import asyncio
import json
import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, Form, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

load_dotenv()

import youtube_audio
from audio_pipeline import (
    AudioProcessingError,
    GroqRateLimitError,
    InvalidGroqApiKeyError,
    can_transcribe_webm_directly,
    detect_spoken_language,
    normalize_audio,
    transcribe_audio,
)

app = FastAPI()

# Restricted via ALLOWED_ORIGINS (comma-separated) rather than "*" so an
# unrelated site's JS can't call this API in a visitor's browser and free-ride
# on this backend's compute. allow_credentials is False because nothing here
# uses cookies — the Groq API key is sent explicitly in the request body.
# Vite is pinned to port 3000 in vite.config.ts. Keep 5173 as well for
# developers running Vite without that config (or with an older checkout).
_default_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mirrors MAX_BACKEND_UPLOAD_BYTES in services/backendAudioService.ts (the
# frontend already rejects anything larger before ever sending it — this is
# a server-side backstop, not the primary guard).
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
# Multipart requests contain a few form fields and boundaries in addition to
# the file. The actual file size is checked after saving it below.
MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024


class UploadTooLarge(Exception):
    pass


class UploadSizeLimitMiddleware:
    """
    Caps the request body of the upload endpoint at the ASGI level.

    A well-behaved client's oversized upload is rejected up front from its
    Content-Length (browsers always send an accurate one for a FormData
    upload). Counting the bytes as they arrive also covers a request with a
    missing or understated Content-Length (e.g. chunked transfer encoding),
    which would otherwise be parsed all the way to disk before the size
    check after saving ever ran.
    """

    def __init__(self, app, path: str, max_bytes: int):
        self.app = app
        self.path = path
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != self.path:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                declared = int(raw_length)
            except ValueError:
                await self._reject(send, 400, "Invalid Content-Length header.")
                return
            if declared > self.max_bytes:
                await self._reject(send, 413, f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.")
                return

        received = 0
        response_started = False

        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise UploadTooLarge()
            return message

        async def tracking_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except UploadTooLarge:
            if not response_started:
                await self._reject(send, 413, f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.")

    @staticmethod
    async def _reject(send, status: int, message: str) -> None:
        body = json.dumps({"message": message}).encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        })
        await send({"type": "http.response.body", "body": body})


app.add_middleware(
    UploadSizeLimitMiddleware,
    path="/audio/transcribe/stream",
    max_bytes=MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES,
)


@app.get("/youtube/test", response_class=HTMLResponse)
async def youtube_test_page():
    # Only exists once YOUTUBE_ACCESS_TOKEN is configured (see youtube_audio.py).
    if not youtube_audio.access_token():
        return JSONResponse(status_code=404, content={"message": "Not found."})
    return youtube_audio.TEST_PAGE


@app.post("/youtube/probe")
async def youtube_audio_endpoint(
    payload: dict = Body(...),
    authorization: str | None = Header(default=None),
):
    if not youtube_audio.access_token():
        return JSONResponse(status_code=404, content={"message": "Not found."})
    if not youtube_audio.is_authorized(authorization):
        return JSONResponse(status_code=401, content={"message": "Wrong or missing access token."})
    url = str(payload.get("url") or "")
    if not youtube_audio.is_youtube_url(url):
        return JSONResponse(status_code=400, content={"message": "Only youtube.com / youtu.be links are accepted."})
    try:
        result = await asyncio.wait_for(asyncio.to_thread(youtube_audio.probe, url), timeout=150)
    except asyncio.TimeoutError:
        result = {"ok": False, "error_type": "timeout", "message": "YouTube did not respond within 150 seconds."}
    print(f"[youtube probe] ok={result.get('ok')} error_type={result.get('error_type')} cookies={result.get('cookies_used')}", flush=True)
    return result


@app.get("/health")
async def health_check():
    # No DB/model calls — used both as an uptime probe and as the frontend's
    # pre-flight "wake up the Render instance" ping, so it must respond as
    # soon as the process is up.
    return {"status": "ok"}


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _request_logger():
    # Render's free tier gives no APM/tracing, so these prints (timestamped,
    # one per phase) are the only way to see where a slow request's time
    # actually went after the fact — check the service's Logs tab and diff
    # consecutive timestamps.
    t_start = time.monotonic()
    request_id = f"{int(t_start * 1000) % 100000}"

    def log(message: str) -> None:
        print(f"[{request_id}] +{time.monotonic() - t_start:6.2f}s  {message}", flush=True)

    return log


async def _transcribe_saved_file(src_path: str, groq_api_key: str, language: str,
                                 queue: asyncio.Queue, log) -> None:
    """
    Normalizes, splits and transcribes an audio/video file already on disk,
    putting progress and the final result (or a no-speech error) on the
    queue. Shared by uploads and YouTube links; other failures raise and are
    turned into error events by _queue_pipeline_error.
    """
    loop = asyncio.get_running_loop()

    def emit_normalize_progress(percent: int) -> None:
        # normalize_audio() runs in a worker thread (asyncio.to_thread
        # below); asyncio.Queue isn't thread-safe, so progress ticks from
        # that thread are handed back via call_soon_threadsafe.
        loop.call_soon_threadsafe(
            queue.put_nowait,
            ("progress", {"phase": "normalizing", "percent": percent}),
        )

    if await asyncio.to_thread(can_transcribe_webm_directly, src_path):
        normalized_path = src_path
        emit_normalize_progress(100)
        log("audio-only WebM/Opus: skipped normalization")
    else:
        normalized_path = await asyncio.to_thread(normalize_audio, src_path, emit_normalize_progress)
        log(f"normalized, {os.path.getsize(normalized_path) / (1024 * 1024):.1f}MB")

    def emit_split_progress(percent: int) -> None:
        # Only the file exceeding Groq's per-request cap (see
        # GROQ_MAX_UPLOAD_BYTES) ever triggers this at all — logged at the
        # endpoints only, to confirm from the Logs tab whether a slow
        # request actually needed splitting rather than flooding it with a
        # line per percent tick.
        if percent in (0, 100):
            log(f"splitting audio ({percent}%)")
        loop.call_soon_threadsafe(
            queue.put_nowait,
            ("progress", {"phase": "splitting", "percent": percent}),
        )

    async def on_chunk_done(completed: int, total: int) -> None:
        log(f"transcribed chunk {completed}/{total}")
        await queue.put(("progress", {"phase": "transcribing", "completed": completed, "total": total}))

    async def on_rate_limited(wait_seconds: float, attempt: int, chunk_index: int, total_chunks: int) -> None:
        await queue.put(("progress", {
            "phase": "rate_limited",
            "waitSeconds": wait_seconds,
            "completed": max(0, chunk_index - 1),
            "total": total_chunks,
        }))

    transcription_language = language
    if not language or language == "auto":
        async def on_probe_rate_limited(wait_seconds: float, attempt: int) -> None:
            await on_rate_limited(wait_seconds, attempt, 1, 1)

        detected = await detect_spoken_language(normalized_path, groq_api_key, on_probe_rate_limited)
        log(f"auto language: detected {detected or 'nothing usable, leaving it to Whisper'}")
        if detected:
            transcription_language = detected

    result = await transcribe_audio(
        normalized_path, groq_api_key, transcription_language,
        on_split_progress=emit_split_progress,
        on_chunk_done=on_chunk_done,
        on_rate_limited=on_rate_limited,
    )
    log(f"transcription complete, {len(result['text'])} chars, duration={result['duration']:.1f}s")

    if not result["text"].strip():
        await queue.put(("error", {
            "error_type": "no_speech",
            "message": "No speech was detected in this recording.",
        }))
        return

    await queue.put(("final", result))
    log("done")


async def _queue_pipeline_error(error: Exception, queue: asyncio.Queue, log) -> None:
    if isinstance(error, InvalidGroqApiKeyError):
        log(f"failed: invalid Groq API key ({error})")
        await queue.put(("error", {"error_type": "invalid_groq_key", "message": str(error)}))
    elif isinstance(error, GroqRateLimitError):
        log(f"failed: Groq rate limited ({error})")
        await queue.put(("error", {
            "error_type": "rate_limited",
            "message": str(error),
            "retry_after_seconds": error.retry_after_seconds,
        }))
    elif isinstance(error, AudioProcessingError):
        log(f"failed: audio processing error ({error})")
        await queue.put(("error", {"error_type": "processing_error", "message": str(error)}))
    elif isinstance(error, youtube_audio.YoutubeError):
        log(f"failed: YouTube {error.error_type} ({error})")
        await queue.put(("error", {
            "error_type": "youtube_error",
            "youtube_error_type": error.error_type,
            "message": str(error),
        }))
    else:
        log(f"failed: unexpected error ({error})")
        await queue.put(("error", {
            "error_type": "processing_error",
            "message": "An unexpected error occurred while processing this recording.",
        }))


async def _stream_pipeline(pipeline, queue: asyncio.Queue, first_event: dict):
    """Runs the pipeline in the background and relays its queue as SSE."""
    task = asyncio.create_task(pipeline())
    try:
        yield sse_event("progress", first_event)
        while True:
            try:
                event, payload = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                # A long Groq retry-after or YouTube download can outlast
                # idle timeouts on reverse proxies. Comments keep the SSE
                # response alive without presenting a new UI event.
                yield ": keepalive\n\n"
                continue
            yield sse_event(event, payload)
            if event in {"final", "error"}:
                break
    finally:
        # Cancel the background task if still running (e.g. client
        # disconnected mid-stream) so an abandoned transcription doesn't
        # keep running against the Groq API forever.
        if not task.done():
            task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


def _missing_groq_key_stream():
    async def stream():
        yield sse_event("error", {
            "error_type": "missing_groq_key",
            "message": "No Groq API key was provided.",
        })
    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/audio/transcribe/stream")
async def transcribe_stream(
    audio: UploadFile = File(...),
    groq_api_key: str = Form(""),
    language: str = Form("auto"),
):
    """
    Accepts one audio/video file (a live recording or an uploaded file, any
    size up to MAX_UPLOAD_BYTES), normalizes it, splits it into Groq-sized
    chunks if needed, transcribes each chunk, and streams progress via SSE.
    The final event carries a combined {text, segments, duration} result on
    one continuous timeline — the same shape the frontend's
    TranscriptionResult already has.

    Stateless: everything lives in a per-request temp dir that's removed
    once the stream ends, regardless of success or failure.
    """
    groq_api_key = (groq_api_key or "").strip()
    if not groq_api_key:
        return _missing_groq_key_stream()

    async def event_generator():
        with tempfile.TemporaryDirectory(prefix="voice_note_") as tmp_dir:
            # Only the extension of the client's filename is kept, and only
            # if it's a plain one (e.g. ".m4a"): it's used in a local path
            # and handed to ffmpeg/ffprobe.
            ext = os.path.splitext(audio.filename or "")[1].lower()
            if not re.fullmatch(r"\.[a-z0-9]{1,10}", ext):
                ext = ".bin"
            src_path = Path(tmp_dir) / f"audio{ext}"
            queue: asyncio.Queue = asyncio.Queue()
            log = _request_logger()

            async def run_pipeline():
                try:
                    log(f"received upload, filename={audio.filename!r}")
                    with src_path.open("wb") as buffer:
                        await asyncio.to_thread(shutil.copyfileobj, audio.file, buffer)
                    upload_bytes = src_path.stat().st_size
                    log(f"upload saved to disk, {upload_bytes / (1024 * 1024):.1f}MB")

                    if upload_bytes > MAX_UPLOAD_BYTES:
                        await queue.put(("error", {
                            "error_type": "too_large",
                            "message": f"This recording exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.",
                        }))
                        return

                    await _transcribe_saved_file(str(src_path), groq_api_key, language, queue, log)
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    await _queue_pipeline_error(error, queue, log)

            async for chunk in _stream_pipeline(run_pipeline, queue, {"phase": "normalizing"}):
                yield chunk

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _youtube_request_error(authorization: Optional[str], url: str) -> Optional[JSONResponse]:
    """The checks every YouTube endpoint makes before touching YouTube."""
    if not youtube_audio.access_token():
        return JSONResponse(status_code=404, content={"message": "Not found."})
    if not youtube_audio.is_authorized(authorization):
        return JSONResponse(status_code=401, content={"error_type": "youtube_unauthorized",
                                                      "message": "Wrong or missing YouTube access token."})
    if not youtube_audio.is_youtube_url(url):
        return JSONResponse(status_code=400, content={"error_type": "youtube_bad_url",
                                                      "message": "Only youtube.com / youtu.be links are accepted."})
    return None


@app.post("/youtube/info")
async def youtube_info(
    payload: dict = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    url = str(payload.get("url") or "").strip()
    rejection = _youtube_request_error(authorization, url)
    if rejection:
        return rejection
    try:
        return await asyncio.wait_for(asyncio.to_thread(youtube_audio.fetch_info, url), timeout=60)
    except asyncio.TimeoutError:
        return JSONResponse(status_code=504, content={"error_type": "youtube_error", "youtube_error_type": "timeout",
                                                      "message": "YouTube did not respond in time."})
    except youtube_audio.YoutubeError as error:
        return JSONResponse(status_code=502, content={"error_type": "youtube_error",
                                                      "youtube_error_type": error.error_type, "message": str(error)})


@app.post("/youtube/transcribe/stream")
async def youtube_transcribe_stream(
    payload: dict = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    """
    Same as /audio/transcribe/stream, but the audio comes from a YouTube
    link: it's downloaded here (streaming "downloading" progress first) and
    then goes through exactly the same normalize/transcribe steps.
    """
    url = str(payload.get("url") or "").strip()
    rejection = _youtube_request_error(authorization, url)
    if rejection:
        return rejection
    groq_api_key = str(payload.get("groq_api_key") or "").strip()
    language = str(payload.get("language") or "auto")
    if not groq_api_key:
        return _missing_groq_key_stream()

    async def event_generator():
        with tempfile.TemporaryDirectory(prefix="youtube_note_") as tmp_dir:
            queue: asyncio.Queue = asyncio.Queue()
            log = _request_logger()

            async def run_pipeline():
                loop = asyncio.get_running_loop()

                def emit_download_progress(percent: int) -> None:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        ("progress", {"phase": "downloading", "percent": percent}),
                    )

                try:
                    log("downloading YouTube audio")
                    downloaded = await asyncio.to_thread(
                        youtube_audio.download_audio, url, tmp_dir, emit_download_progress, log,
                    )
                    log(f"downloaded {os.path.getsize(downloaded['path']) / (1024 * 1024):.1f}MB, "
                        f"duration={downloaded.get('duration_seconds')}")
                    await queue.put(("progress", {"phase": "normalizing", "percent": 0}))
                    await _transcribe_saved_file(downloaded["path"], groq_api_key, language, queue, log)
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    await _queue_pipeline_error(error, queue, log)

            async for chunk in _stream_pipeline(run_pipeline, queue, {"phase": "downloading", "percent": 0}):
                yield chunk

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
