import asyncio
import json
import os
import shutil
import tempfile
import time
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.requests import Request

load_dotenv()

from audio_pipeline import (
    AudioProcessingError,
    GroqRateLimitError,
    InvalidGroqApiKeyError,
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


@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    # Rejects a well-behaved client's oversized upload before the body is
    # even parsed (browsers always send an accurate Content-Length for a
    # FormData Blob/File upload) — cheaper than accepting the whole body
    # first and only then discovering it's too large.
    if request.url.path == "/audio/transcribe/stream":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={"message": f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit."},
            )
    return await call_next(request)


@app.get("/health")
async def health_check():
    # No DB/model calls — used both as an uptime probe and as the frontend's
    # pre-flight "wake up the Render instance" ping, so it must respond as
    # soon as the process is up.
    return {"status": "ok"}


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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

    async def event_generator():
        if not groq_api_key:
            yield sse_event("error", {
                "error_type": "missing_groq_key",
                "message": "No Groq API key was provided.",
            })
            return

        with tempfile.TemporaryDirectory(prefix="voice_note_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            ext = os.path.splitext(audio.filename or "")[1] or ".bin"
            src_path = tmp_path / f"audio{ext}"

            queue: asyncio.Queue = asyncio.Queue()

            async def run_pipeline():
                loop = asyncio.get_running_loop()
                # Render's free tier gives no APM/tracing, so these prints
                # (timestamped, one per phase) are the only way to see where
                # a slow request's time actually went after the fact — check
                # the service's Logs tab and diff consecutive timestamps.
                t_start = time.monotonic()
                request_id = f"{int(t_start * 1000) % 100000}"

                def log(message: str) -> None:
                    print(f"[{request_id}] +{time.monotonic() - t_start:6.2f}s  {message}", flush=True)

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

                    def emit_normalize_progress(percent: int) -> None:
                        # normalize_audio() runs in a worker thread
                        # (asyncio.to_thread below); asyncio.Queue isn't
                        # thread-safe, so progress ticks from that thread
                        # are handed back via call_soon_threadsafe.
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            ("progress", {"phase": "normalizing", "percent": percent}),
                        )

                    normalized_path = await asyncio.to_thread(normalize_audio, str(src_path), emit_normalize_progress)
                    log(f"normalized, {os.path.getsize(normalized_path) / (1024 * 1024):.1f}MB")

                    def emit_split_progress(percent: int) -> None:
                        # Only the file exceeding Groq's per-request cap
                        # (see GROQ_MAX_UPLOAD_BYTES) ever triggers this at
                        # all — logged at the endpoints only, to confirm
                        # from the Logs tab whether a slow request actually
                        # needed splitting rather than flooding it with a
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

                    result = await transcribe_audio(
                        normalized_path, groq_api_key, language,
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
                except asyncio.CancelledError:
                    raise
                except InvalidGroqApiKeyError as e:
                    log(f"failed: invalid Groq API key ({e})")
                    await queue.put(("error", {"error_type": "invalid_groq_key", "message": str(e)}))
                except GroqRateLimitError as e:
                    log(f"failed: Groq rate limited ({e})")
                    await queue.put(("error", {
                        "error_type": "rate_limited",
                        "message": str(e),
                        "retry_after_seconds": e.retry_after_seconds,
                    }))
                except AudioProcessingError as e:
                    log(f"failed: audio processing error ({e})")
                    await queue.put(("error", {"error_type": "processing_error", "message": str(e)}))
                except Exception as e:
                    log(f"failed: unexpected error ({e})")
                    await queue.put(("error", {
                        "error_type": "processing_error",
                        "message": "An unexpected error occurred while processing this recording.",
                    }))

            task = asyncio.create_task(run_pipeline())
            try:
                yield sse_event("progress", {"phase": "normalizing"})
                while True:
                    try:
                        event, payload = await asyncio.wait_for(queue.get(), timeout=15)
                    except asyncio.TimeoutError:
                        # A long Groq retry-after can outlast idle timeouts
                        # on reverse proxies. Comments keep the SSE response
                        # alive without presenting a new UI event.
                        yield ": keepalive\n\n"
                        continue
                    yield sse_event(event, payload)
                    if event in {"final", "error"}:
                        break
            finally:
                # Cancel the background task if still running (e.g. client
                # disconnected mid-stream) so an abandoned transcription
                # doesn't keep running against the Groq API forever.
                if not task.done():
                    task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
