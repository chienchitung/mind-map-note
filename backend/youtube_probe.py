"""
Test-only check of whether this server can reach YouTube through yt-dlp.

YouTube often answers cloud servers with "Sign in to confirm you're not a
bot", so before building a full "paste a YouTube link" feature this only
reads a video's info and lists its audio formats — nothing is downloaded.
A working probe means the same cookies and server can download the audio.

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

DEFAULT_COOKIES_FILE = "/etc/secrets/youtube_cookies.txt"
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


def probe(url: str) -> dict:
    """Reads one video's info; never downloads it. Runs in a worker thread."""
    cookies_source = _cookies_file()
    deno_path = _deno_path()
    report = {"cookies_used": bool(cookies_source), "js_runtime": bool(deno_path)}

    with tempfile.TemporaryDirectory(prefix="yt_probe_") as tmp_dir:
        options = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 20,
            # Only YouTube: this must never fetch arbitrary URLs.
            "allowed_extractors": ["youtube", "youtube:tab"],
        }
        if deno_path:
            options["js_runtimes"] = {"deno": {"path": deno_path}}
        if cookies_source:
            # A copy: yt-dlp writes refreshed cookies back to the file, and
            # Render's Secret Files are read-only.
            cookies_copy = os.path.join(tmp_dir, "cookies.txt")
            shutil.copyfile(cookies_source, cookies_copy)
            options["cookiefile"] = cookies_copy
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as error:
            message = str(error).replace("\x1b[0;31mERROR:\x1b[0m ", "").removeprefix("ERROR: ").strip()
            return {**report, "ok": False, "error_type": _classify_error(message), "message": message[:500]}

    formats = info.get("formats") or []
    audio_formats = [f for f in formats if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")]
    return {
        **report,
        "ok": True,
        "title": info.get("title"),
        "uploader": info.get("uploader"),
        "duration_seconds": info.get("duration"),
        "availability": info.get("availability"),
        "audio_formats": len(audio_formats),
        "best_audio": max((f.get("abr") or 0 for f in audio_formats), default=0),
    }


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
<p class="hint">只讀取影片資訊與音訊格式，不會下載影片。</p>
<label for="token">存取密碼</label><input id="token" type="password" autocomplete="off">
<label for="url">YouTube 連結</label><input id="url" type="url" placeholder="https://youtu.be/...">
<button id="go">測試</button>
<pre id="out" hidden></pre>
<script>
const go = document.getElementById('go'), out = document.getElementById('out');
go.onclick = async () => {
  go.disabled = true; out.hidden = false; out.textContent = '測試中…（約 10–30 秒）';
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
