"""
Audio ingestion pipeline: normalize (extract audio track, downmix/resample),
split into Groq-sized chunks, and transcribe via Groq's Whisper API.

normalize_audio() and _split_audio_ffmpeg() both shell out to the ffmpeg/
ffprobe binaries directly rather than decoding audio in-process. Decoding a
long recording's full PCM into Python memory (e.g. via pydub) is exactly the
memory-risk pattern this backend exists to replace (the browser did the same
thing via AudioContext.decodeAudioData before this backend existed) — an
hour-plus recording can be several hundred MB of raw PCM, which reliably
exceeds Render's free-tier 512MB RAM. Invoking ffmpeg as a subprocess instead
keeps decoding inside ffmpeg's own bounded streaming buffers, so peak added
memory in this process stays small regardless of recording length.
"""
import asyncio
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Awaitable, Callable, Optional

import httpx

try:
    from opencc import OpenCC
    # Whisper transcribes Mandarin speech as Simplified characters regardless
    # of the speaker's accent/region. s2twp converts Simplified -> Traditional
    # with Taiwan phrasing conventions (matches the client's previous
    # opencc-js 'cn'->'twp' conversion, now moved server-side).
    _S2TWP_CONVERTER = OpenCC("s2twp")
    OPENCC_AVAILABLE = True
except ImportError:
    _S2TWP_CONVERTER = None
    OPENCC_AVAILABLE = False

NORMALIZED_AUDIO_FORMAT = "mp3"
GROQ_TRANSCRIPTION_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")
GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

# Groq caps direct (multipart) file uploads at 25MB on the free tier. Chunk
# size is picked as a safety margin under that limit.
GROQ_MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# Whisper always emits some caption-like text, even for silence/background
# noise — no "nothing was said" output, so it hallucinates instead. Groq's
# verbose_json response carries a per-segment `no_speech_prob`; segments
# above this threshold are dropped. 0.6 matches OpenAI's reference Whisper
# implementation's default no_speech_threshold.
NO_SPEECH_PROB_THRESHOLD = 0.6

GROQ_RATE_LIMIT_MAX_RETRIES = 5
GROQ_RATE_LIMIT_DEFAULT_WAIT_SECONDS = 15.0

FFMPEG_BIN = shutil.which("ffmpeg")
FFPROBE_BIN = shutil.which("ffprobe")


class AudioProcessingError(Exception):
    """ffmpeg/ffprobe failed, or neither binary is available."""


class GroqRateLimitError(Exception):
    """Groq's Whisper API is still rate-limiting a chunk after all retries."""

    def __init__(self, message: str, retry_after_seconds: float):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class InvalidGroqApiKeyError(Exception):
    """Groq rejected the API key (401/403)."""


def _to_traditional(text: str) -> str:
    text = str(text or "")
    if not text or not OPENCC_AVAILABLE:
        return text
    return _S2TWP_CONVERTER.convert(text)


def _probe_duration_seconds(path: str) -> float:
    if not FFPROBE_BIN:
        return 0.0
    try:
        result = subprocess.run(
            [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path],
            check=True, capture_output=True, text=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _run_ffmpeg_with_progress(cmd: list, total_seconds: float, on_progress: Optional[Callable[[int], None]] = None) -> None:
    """
    Runs an ffmpeg command (which must include "-progress pipe:1 -nostats")
    and parses its out_time_us=... progress stream to report integer
    percent-complete as the transcode/split actually runs.

    stderr is captured to a temp file rather than a pipe: ffmpeg can write
    enough to fill an undrained PIPE and deadlock while we only read stdout.
    """
    with tempfile.TemporaryFile() as stderr_capture:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=stderr_capture, text=True, bufsize=1)
        last_percent = -1
        try:
            for line in process.stdout:
                line = line.strip()
                if on_progress and total_seconds > 0 and line.startswith("out_time_us="):
                    raw_value = line.split("=", 1)[1]
                    if raw_value == "N/A":
                        continue
                    elapsed_seconds = max(0, int(raw_value)) / 1_000_000
                    percent = min(99, int(elapsed_seconds / total_seconds * 100))
                    if percent != last_percent:
                        last_percent = percent
                        on_progress(percent)
                elif on_progress and line == "progress=end" and last_percent != 100:
                    last_percent = 100
                    on_progress(100)
        finally:
            process.wait()

        if process.returncode != 0:
            stderr_capture.seek(0)
            stderr_text = stderr_capture.read().decode("utf-8", errors="replace")
            raise AudioProcessingError(f"ffmpeg failed (exit {process.returncode}): {stderr_text[-2000:]}")


def normalize_audio(src_path: str, on_progress: Optional[Callable[[int], None]] = None) -> str:
    """
    Extracts the audio track (handles video files too) and converts it to
    mono 16kHz mp3 — small, uniform, and exactly what Groq/Whisper expects.
    """
    if not FFMPEG_BIN:
        raise AudioProcessingError("ffmpeg is not available on this server.")

    dst_path = f"{os.path.splitext(src_path)[0]}_normalized.{NORMALIZED_AUDIO_FORMAT}"
    total_seconds = _probe_duration_seconds(src_path)
    _run_ffmpeg_with_progress(
        [
            FFMPEG_BIN, "-y", "-i", src_path, "-vn", "-ac", "1", "-ar", "16000",
            "-acodec", "libmp3lame", "-b:a", "64k",
            "-progress", "pipe:1", "-nostats",
            dst_path,
        ],
        total_seconds, on_progress,
    )
    return dst_path


def _split_audio_ffmpeg(path: str, chunk_seconds: int, out_dir: str, total_seconds: float, on_progress: Optional[Callable[[int], None]] = None) -> list:
    """
    Splits `path` into sequential chunk files under `out_dir` via ffmpeg's
    segment muxer with stream copy (-c copy) — repackages existing encoded
    frames rather than decoding+re-encoding, so it runs in roughly constant
    memory regardless of file length. `path` must already be the format
    normalize_audio() produces (mp3), which segments cleanly with copy.
    """
    if not FFMPEG_BIN:
        raise AudioProcessingError("ffmpeg is not available on this server.")

    pattern = os.path.join(out_dir, f"chunk_%03d.{NORMALIZED_AUDIO_FORMAT}")
    _run_ffmpeg_with_progress(
        [
            FFMPEG_BIN, "-y", "-i", path,
            "-f", "segment", "-segment_time", str(chunk_seconds),
            "-c", "copy", "-reset_timestamps", "1",
            "-progress", "pipe:1", "-nostats",
            pattern,
        ],
        total_seconds, on_progress,
    )
    return sorted(
        os.path.join(out_dir, name)
        for name in os.listdir(out_dir)
        if name.startswith("chunk_")
    )


def _drop_silent_segments(segments: list) -> list:
    return [seg for seg in segments if float(seg.get("no_speech_prob") or 0.0) <= NO_SPEECH_PROB_THRESHOLD]


def _parse_retry_after_seconds(response: httpx.Response) -> float:
    retry_after = response.headers.get("retry-after")
    if retry_after:
        try:
            return max(float(retry_after), 0.0)
        except ValueError:
            pass
    match = re.search(r"try again in ([\d.]+)s", response.text or "", re.IGNORECASE)
    if match:
        return max(float(match.group(1)), 0.0)
    return GROQ_RATE_LIMIT_DEFAULT_WAIT_SECONDS


async def _transcribe_bytes(
    audio_bytes: bytes,
    filename: str,
    groq_api_key: str,
    language: Optional[str],
    on_rate_limited: Optional[Callable[[float, int], Awaitable[None]]] = None,
) -> dict:
    """
    POSTs one chunk to Groq's Whisper endpoint. On 429, waits out the
    interval Groq reports and retries the same chunk, up to
    GROQ_RATE_LIMIT_MAX_RETRIES times before giving up. Raises
    InvalidGroqApiKeyError on 401/403.
    """
    data = {"model": GROQ_TRANSCRIPTION_MODEL, "response_format": "verbose_json"}
    if language and language != "auto":
        data["language"] = language

    for attempt in range(GROQ_RATE_LIMIT_MAX_RETRIES + 1):
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                GROQ_TRANSCRIPTIONS_URL,
                headers={"Authorization": f"Bearer {groq_api_key}"},
                files={"file": (filename, audio_bytes)},
                data=data,
            )

        if response.status_code in (401, 403):
            message = "Groq rejected this API key."
            try:
                message = response.json().get("error", {}).get("message") or message
            except Exception:
                pass
            raise InvalidGroqApiKeyError(message)

        if response.status_code != 429:
            response.raise_for_status()
            return response.json()

        if attempt == GROQ_RATE_LIMIT_MAX_RETRIES:
            raise GroqRateLimitError(
                f"Groq transcription is still rate-limited after {GROQ_RATE_LIMIT_MAX_RETRIES} retries.",
                _parse_retry_after_seconds(response),
            )
        wait_seconds = _parse_retry_after_seconds(response)
        if on_rate_limited:
            await on_rate_limited(wait_seconds, attempt + 1)
        await asyncio.sleep(wait_seconds)


ChunkDoneCallback = Callable[[int, int], Awaitable[None]]
RateLimitCallback = Callable[[float, int, int, int], Awaitable[None]]


async def transcribe_audio(
    normalized_path: str,
    groq_api_key: str,
    language: Optional[str] = None,
    on_split_progress: Optional[Callable[[int], None]] = None,
    on_chunk_done: Optional[ChunkDoneCallback] = None,
    on_rate_limited: Optional[RateLimitCallback] = None,
) -> dict:
    """
    Transcribes an already-normalized (mono 16kHz mp3) audio file, splitting
    it into Groq-sized chunks first if needed. Returns
    {"text": str, "segments": [{"start", "end", "text"}], "duration": float}
    — the same shape the frontend's TranscriptionResult already has, with
    each chunk's segment timestamps offset onto one continuous timeline.
    """
    file_size = os.path.getsize(normalized_path)

    if file_size <= GROQ_MAX_UPLOAD_BYTES:
        with open(normalized_path, "rb") as f:
            audio_bytes = f.read()

        async def _report_rate_limit(wait_seconds: float, attempt: int) -> None:
            if on_rate_limited:
                await on_rate_limited(wait_seconds, attempt, 1, 1)

        raw = await _transcribe_bytes(
            audio_bytes, os.path.basename(normalized_path), groq_api_key, language,
            on_rate_limited=_report_rate_limit,
        )
        chunk_results = [raw]
        if on_chunk_done:
            await on_chunk_done(1, 1)
    else:
        duration_seconds = _probe_duration_seconds(normalized_path)
        bytes_per_second = file_size / duration_seconds if duration_seconds else 0
        chunk_seconds = int(GROQ_MAX_UPLOAD_BYTES / bytes_per_second) if bytes_per_second else int(duration_seconds) or 60
        chunk_seconds = max(chunk_seconds, 60)

        chunk_results = []
        with tempfile.TemporaryDirectory(prefix="voice_note_chunks_") as tmp_dir:
            chunk_paths = await asyncio.to_thread(
                _split_audio_ffmpeg, normalized_path, chunk_seconds, tmp_dir, duration_seconds, on_split_progress,
            )
            total_chunks = len(chunk_paths)
            for i, chunk_path in enumerate(chunk_paths, start=1):
                with open(chunk_path, "rb") as f:
                    chunk_bytes = f.read()
                os.remove(chunk_path)

                async def _report_rate_limit(wait_seconds: float, attempt: int, _i=i, _total=total_chunks) -> None:
                    if on_rate_limited:
                        await on_rate_limited(wait_seconds, attempt, _i, _total)

                raw = await _transcribe_bytes(
                    chunk_bytes, os.path.basename(chunk_path), groq_api_key, language,
                    on_rate_limited=_report_rate_limit,
                )
                chunk_results.append(raw)
                if on_chunk_done:
                    await on_chunk_done(i, total_chunks)

    # Combine chunks into one continuous timeline. Each chunk's own
    # `duration` (falling back to its last segment's `end`) advances the
    # offset for the next chunk's timestamps — same math the frontend used
    # to do client-side across live-recording segments.
    combined_text_parts: list[str] = []
    combined_segments: list[dict] = []
    cumulative_seconds = 0.0

    for raw in chunk_results:
        raw_segments = _drop_silent_segments(raw.get("segments") or [])
        for seg in raw_segments:
            text = _to_traditional(str(seg.get("text") or "").strip())
            if not text:
                continue
            combined_segments.append({
                "start": cumulative_seconds + (float(seg.get("start") or 0)),
                "end": cumulative_seconds + (float(seg.get("end") or 0)),
                "text": text,
            })

        chunk_text = _to_traditional(str(raw.get("text") or "").strip())
        if chunk_text:
            combined_text_parts.append(chunk_text)

        chunk_duration = float(raw.get("duration") or 0) or (raw_segments[-1].get("end") if raw_segments else 0) or 0
        cumulative_seconds += float(chunk_duration)

    return {
        "text": " ".join(combined_text_parts).strip(),
        "segments": combined_segments,
        "duration": cumulative_seconds,
    }
