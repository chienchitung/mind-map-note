"""
YouTube links as a voice-note source: fetches a video's audio with yt-dlp so
it can go through the same transcription pipeline as an uploaded file.

YouTube often answers cloud servers with "Sign in to confirm you're not a
bot", so downloads use the owner's cookies and try several of yt-dlp's
player clients in turn. probe() is a diagnostic for the /youtube/test page:
it downloads a few seconds' worth and stops — listing formats alone isn't
enough, since YouTube can list them to a cloud server and then refuse the
stream.

Configured entirely through the environment, so it stays off unless set up:
- YOUTUBE_ACCESS_TOKEN: required; requests must send it as a Bearer token.
  The cookies below log in as the owner's Google account, so nobody else may
  be able to use this server to fetch videos with them.
- YOUTUBE_COOKIES_FILE: path of a Netscape-format cookies.txt (on Render, a
  Secret File, mounted under /etc/secrets/). Optional: without it, the probe
  runs anonymously.
"""

import hmac
import os
import shutil
import tempfile
from typing import Optional
from urllib.parse import urlparse

import yt_dlp

SECRETS_DIR = "/etc/secrets"
DEFAULT_COOKIES_FILE = f"{SECRETS_DIR}/youtube_cookies.txt"
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}


def access_token() -> str:
    return os.getenv("YOUTUBE_ACCESS_TOKEN", "").strip()


def is_authorized(authorization_header: Optional[str]) -> bool:
    expected = access_token()
    if not expected or not authorization_header:
        return False
    scheme, _, supplied = authorization_header.partition(" ")
    return scheme.lower() == "bearer" and hmac.compare_digest(supplied.strip().encode(), expected.encode())


def is_youtube_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and (parsed.hostname or "").lower() in YOUTUBE_HOSTS


def _cookies_file() -> Optional[str]:
    path = os.getenv("YOUTUBE_COOKIES_FILE", DEFAULT_COOKIES_FILE)
    return path if path and os.path.isfile(path) else None


def _secret_file_names() -> list:
    # Names only, never contents: shown when the cookies file isn't found,
    # so a misnamed Secret File is easy to spot.
    try:
        return sorted(os.listdir(SECRETS_DIR))
    except OSError:
        return []


def _cookies_format(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(4096)
    except OSError:
        return "unreadable"
    if head.lstrip().startswith(("[", "{")):
        return "json (yt-dlp needs the Netscape cookies.txt format)"
    if "# Netscape HTTP Cookie File" in head or "# HTTP Cookie File" in head or "\t" in head:
        return "netscape"
    return "unknown"


def _deno_path() -> Optional[str]:
    try:
        import deno
        return deno.find_deno_bin()
    except Exception:
        return shutil.which("deno")


def _classify_error(message: str) -> str:
    lowered = message.lower()
    if "not a bot" in lowered or "sign in to confirm" in lowered:
        return "bot_check"
    if "429" in lowered or "too many requests" in lowered:
        return "rate_limited"
    if "private video" in lowered or "sign in" in lowered or "members-only" in lowered:
        return "login_required"
    if "unavailable" in lowered or "does not exist" in lowered:
        return "unavailable"
    return "other"


# Tried in order until one gets through: YouTube's bot check can apply to
# one client and not another. None is yt-dlp's own default choice.
PLAYER_CLIENTS = (None, "tv", "web_safari", "mweb", "web_embedded")
LOGIN_COOKIE_NAMES = {"SAPISID", "__Secure-1PSID", "__Secure-3PSID", "__Secure-3PAPISID", "LOGIN_INFO"}


def _login_cookie_names(path: str) -> list:
    """Which known Google/YouTube login cookies the file has — names only."""
    found = set()
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                fields = line.rstrip("\n").split("\t")
                if len(fields) >= 7 and fields[5] in LOGIN_COOKIE_NAMES:
                    found.add(fields[5])
    except OSError:
        pass
    return sorted(found)


# A real download of this much audio is the only reliable success signal:
# YouTube can list a video's audio formats to a cloud server and then refuse
# the stream itself (HTTP 403). The test stops as soon as it has this much.
PROBE_DOWNLOAD_BYTES = 200_000


class _EnoughDownloaded(Exception):
    pass


# Audio only; a video-only upload (rare) falls back to a small video, since
# the audio is all that's transcribed. Capped so a mislabeled stream can't
# fill the disk.
AUDIO_FORMAT = "bestaudio/best[height<=360]/best"
MAX_DOWNLOAD_BYTES = 600 * 1024 * 1024
# Long enough for a full day's lecture; anything longer is likely a stream
# or loop that would only burn Groq quota.
MAX_DURATION_SECONDS = 6 * 3600


def _ydl_options(tmp_dir: str, cookies_source: Optional[str], deno_path: Optional[str],
                 player_client: Optional[str], **extra) -> dict:
    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 15,
        # Only YouTube: this must never fetch arbitrary URLs.
        "allowed_extractors": ["youtube", "youtube:tab"],
        **extra,
    }
    if deno_path:
        options["js_runtimes"] = {"deno": {"path": deno_path}}
    if player_client:
        options["extractor_args"] = {"youtube": {"player_client": [player_client]}}
    if cookies_source:
        # A copy: yt-dlp writes refreshed cookies back to the file, and
        # Render's Secret Files are read-only.
        cookies_copy = os.path.join(tmp_dir, "cookies.txt")
        shutil.copyfile(cookies_source, cookies_copy)
        options["cookiefile"] = cookies_copy
    return options


def _error_message(error: Exception) -> str:
    return str(error).replace("\x1b[0;31mERROR:\x1b[0m ", "").removeprefix("ERROR: ").strip()


class YoutubeError(Exception):
    """yt-dlp couldn't get the video; error_type is one of _classify_error's."""

    def __init__(self, message: str, error_type: str):
        super().__init__(message)
        self.error_type = error_type


def fetch_info(url: str) -> dict:
    """The video's title and length, for confirming before transcribing."""
    cookies_source = _cookies_file()
    deno_path = _deno_path()
    with tempfile.TemporaryDirectory(prefix="yt_info_") as tmp_dir:
        options = _ydl_options(tmp_dir, cookies_source, deno_path, None,
                               skip_download=True, ignore_no_formats_error=True)
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False) or {}
        except Exception as error:
            message = _error_message(error)
            raise YoutubeError(message[:300], _classify_error(message)) from error
    return {
        "title": info.get("title"),
        "uploader": info.get("uploader"),
        "duration_seconds": info.get("duration"),
        "too_long": bool(info.get("duration") and info["duration"] > MAX_DURATION_SECONDS),
        "max_duration_seconds": MAX_DURATION_SECONDS,
    }


def download_audio(url: str, out_dir: str, on_progress=None, log=print) -> dict:
    """
    Downloads the video's audio into out_dir, trying each player client
    until one works. Returns {"path", "title", "duration_seconds"}; raises
    YoutubeError if none did. Runs in a worker thread; on_progress(percent)
    is called from it.
    """
    cookies_source = _cookies_file()
    deno_path = _deno_path()
    last_percent = {"value": -1}

    def hook(status):
        if status.get("status") != "downloading" or not on_progress:
            return
        total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
        if total:
            percent = min(99, int(status.get("downloaded_bytes", 0) * 100 / total))
            if percent != last_percent["value"]:
                last_percent["value"] = percent
                on_progress(percent)

    last_error = None
    for player_client in PLAYER_CLIENTS:
        attempt_dir = tempfile.mkdtemp(prefix="attempt_", dir=out_dir)
        options = _ydl_options(attempt_dir, cookies_source, deno_path, player_client,
                               format=AUDIO_FORMAT, max_filesize=MAX_DOWNLOAD_BYTES,
                               outtmpl=os.path.join(attempt_dir, "audio.%(ext)s"),
                               progress_hooks=[hook])
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True) or {}
        except Exception as error:
            message = _error_message(error)
            last_error = YoutubeError(message[:300], _classify_attempt_error(message))
            log(f"youtube client {player_client or 'default'} failed: {last_error.error_type}")
            shutil.rmtree(attempt_dir, ignore_errors=True)
            continue
        if info.get("duration") and info["duration"] > MAX_DURATION_SECONDS:
            raise YoutubeError("This video is too long to transcribe.", "too_long")
        files = [name for name in os.listdir(attempt_dir) if name.startswith("audio.")]
        if not files:
            last_error = YoutubeError("The download finished without an audio file.", "other")
            continue
        log(f"youtube client {player_client or 'default'} downloaded {files[0]}")
        return {
            "path": os.path.join(attempt_dir, files[0]),
            "title": info.get("title"),
            "duration_seconds": info.get("duration"),
        }
    raise last_error or YoutubeError("Could not download this video.", "other")


def _try_download(url: str, cookies_source: Optional[str], deno_path: Optional[str], player_client: Optional[str]) -> dict:
    """Starts downloading the best audio and stops after PROBE_DOWNLOAD_BYTES."""
    progress = {"bytes": 0}

    def hook(status):
        if status.get("status") == "downloading":
            progress["bytes"] = status.get("downloaded_bytes") or 0
            if progress["bytes"] >= PROBE_DOWNLOAD_BYTES:
                raise _EnoughDownloaded()

    with tempfile.TemporaryDirectory(prefix="yt_probe_") as tmp_dir:
        options = _ydl_options(tmp_dir, cookies_source, deno_path, player_client,
                               format="bestaudio/best",
                               outtmpl=os.path.join(tmp_dir, "audio.%(ext)s"),
                               progress_hooks=[hook])
        info = {}
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=True) or {}
        except Exception:
            # Stopping from the hook surfaces as an error too; enough bytes
            # before it means the download itself worked.
            if progress["bytes"] < PROBE_DOWNLOAD_BYTES:
                raise
        return {"info": info, "downloaded_bytes": progress["bytes"]}


def _classify_attempt_error(message: str) -> str:
    lowered = message.lower()
    if "403" in lowered or "forbidden" in lowered:
        return "download_forbidden"
    if "requested format is not available" in lowered or "no video formats" in lowered:
        return "no_audio_formats"
    return _classify_error(message)


def probe(url: str) -> dict:
    """Downloads a few seconds of a video's audio, then stops. Runs in a worker thread."""
    cookies_source = _cookies_file()
    deno_path = _deno_path()
    report = {"cookies_used": bool(cookies_source), "js_runtime": bool(deno_path)}
    if cookies_source:
        report["cookies_format"] = _cookies_format(cookies_source)
        report["login_cookies_found"] = _login_cookie_names(cookies_source)
    else:
        report["cookies_expected_at"] = os.getenv("YOUTUBE_COOKIES_FILE", DEFAULT_COOKIES_FILE)
        report["secret_files_found"] = _secret_file_names()

    attempts = []
    for player_client in PLAYER_CLIENTS:
        label = player_client or "default"
        try:
            outcome = _try_download(url, cookies_source, deno_path, player_client)
        except Exception as error:
            message = _error_message(error)
            attempts.append({"client": label, "ok": False, "error_type": _classify_attempt_error(message),
                             "message": message[:300]})
            continue
        attempts.append({"client": label, "ok": True})
        info = outcome["info"]
        return {
            **report,
            "attempts": attempts,
            "ok": True,
            "client": label,
            "downloaded_bytes": outcome["downloaded_bytes"],
            "title": info.get("title"),
            "duration_seconds": info.get("duration"),
            "availability": info.get("availability"),
        }

    return {**report, "attempts": attempts, "ok": False,
            "error_type": attempts[-1]["error_type"], "message": attempts[-1]["message"]}


TEST_PAGE = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>YouTube 連線測試</title>
<style>
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#1d1d1f;background:#f5f5f7}
h1{font-size:20px}label{display:block;margin:14px 0 4px;font-weight:600}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d2d2d7;border-radius:10px;font:inherit}
button{margin-top:16px;padding:10px 18px;border:0;border-radius:10px;background:#0071e3;color:#fff;font:inherit;cursor:pointer}
button:disabled{opacity:.5}pre{background:#fff;border:1px solid #d2d2d7;border-radius:10px;padding:12px;white-space:pre-wrap;word-break:break-all}
p.hint{color:#6e6e73;font-size:13px}
</style></head><body>
<h1>YouTube 連線測試</h1>
<p class="hint">會試著下載開頭幾秒的音訊確認可行，隨即停止並刪除，不會下載整部影片。</p>
<label for="token">存取密碼</label><input id="token" type="password" autocomplete="off">
<label for="url">YouTube 連結</label><input id="url" type="url" placeholder="https://youtu.be/...">
<button id="go">測試</button>
<pre id="out" hidden></pre>
<script>
const go = document.getElementById('go'), out = document.getElementById('out');
go.onclick = async () => {
  go.disabled = true; out.hidden = false; out.textContent = '測試中…（約 10 秒到 2 分鐘）';
  try {
    const res = await fetch('/youtube/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + document.getElementById('token').value },
      body: JSON.stringify({ url: document.getElementById('url').value }),
    });
    out.textContent = res.status + '\\n' + JSON.stringify(await res.json(), null, 2);
  } catch (e) { out.textContent = '連線失敗：' + e; }
  go.disabled = false;
};
</script></body></html>"""
