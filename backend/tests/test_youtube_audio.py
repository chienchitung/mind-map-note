import io
import math
import os
import sys
import unittest
import wave
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio_pipeline
import main
import youtube_audio


class YoutubeProbeEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_endpoints_do_not_exist_without_a_token(self):
        with patch.dict(os.environ, {'YOUTUBE_ACCESS_TOKEN': ''}):
            self.assertEqual((await self.client.get('/youtube/test')).status_code, 404)
            response = await self.client.post('/youtube/probe', json={'url': 'https://youtu.be/x'})
            self.assertEqual(response.status_code, 404)

    async def test_wrong_token_and_non_youtube_urls_are_rejected(self):
        with patch.dict(os.environ, {'YOUTUBE_ACCESS_TOKEN': 'secret'}), \
             patch.object(youtube_audio, 'probe') as probe:
            wrong = await self.client.post('/youtube/probe', json={'url': 'https://youtu.be/x'},
                                           headers={'Authorization': 'Bearer nope'})
            other_site = await self.client.post('/youtube/probe', json={'url': 'http://169.254.169.254/latest'},
                                                headers={'Authorization': 'Bearer secret'})
            lookalike = await self.client.post('/youtube/probe', json={'url': 'https://youtube.com.evil.example/x'},
                                               headers={'Authorization': 'Bearer secret'})
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(other_site.status_code, 400)
        self.assertEqual(lookalike.status_code, 400)
        probe.assert_not_called()

    async def test_authorized_probe_returns_the_result(self):
        with patch.dict(os.environ, {'YOUTUBE_ACCESS_TOKEN': 'secret'}), \
             patch.object(youtube_audio, 'probe', return_value={'ok': True, 'title': 'Lecture'}) as probe:
            page = await self.client.get('/youtube/test')
            response = await self.client.post('/youtube/probe', json={'url': 'https://www.youtube.com/watch?v=abc'},
                                              headers={'Authorization': 'Bearer secret'})
        self.assertEqual(page.status_code, 200)
        self.assertIn('YouTube 連線測試', page.text)
        self.assertEqual(response.json(), {'ok': True, 'title': 'Lecture'})
        probe.assert_called_once_with('https://www.youtube.com/watch?v=abc')

    def test_error_messages_are_classified(self):
        classify = youtube_audio._classify_error
        self.assertEqual(classify("Sign in to confirm you’re not a bot."), 'bot_check')
        self.assertEqual(classify('HTTP Error 429: Too Many Requests'), 'rate_limited')
        self.assertEqual(classify('Private video. Sign in if you have access'), 'login_required')
        self.assertEqual(classify('Video unavailable'), 'unavailable')


    def test_cookie_format_detection(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            netscape = Path(folder) / 'a.txt'
            netscape.write_text('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tx\n')
            json_file = Path(folder) / 'b.txt'
            json_file.write_text('[{"domain": ".youtube.com"}]')
            self.assertEqual(youtube_audio._cookies_format(str(netscape)), 'netscape')
            self.assertTrue(youtube_audio._cookies_format(str(json_file)).startswith('json'))

    def test_missing_cookies_report_lists_secret_file_names(self):
        with patch.dict(os.environ, {'YOUTUBE_COOKIES_FILE': '/nonexistent/youtube_cookies.txt'}), \
             patch.object(youtube_audio, '_secret_file_names', return_value=['cookies.txt']), \
             patch.object(youtube_audio.yt_dlp, 'YoutubeDL', side_effect=RuntimeError('Sign in to confirm you’re not a bot')):
            result = youtube_audio.probe('https://youtu.be/x')
        self.assertFalse(result['cookies_used'])
        self.assertEqual(result['secret_files_found'], ['cookies.txt'])
        self.assertEqual(result['error_type'], 'bot_check')


    def test_login_cookie_names_are_detected(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'c.txt'
            path.write_text('# Netscape HTTP Cookie File\n'
                            '.youtube.com\tTRUE\t/\tTRUE\t0\tSAPISID\tsecret\n'
                            '.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tf1\n')
            self.assertEqual(youtube_audio._login_cookie_names(str(path)), ['SAPISID'])

    def test_falls_back_to_another_player_client(self):
        calls = []

        def download(_url, _cookies, _deno, client):
            calls.append(client)
            if client is None:
                raise RuntimeError('ERROR: unable to download video data: HTTP Error 403: Forbidden')
            return {'info': {'title': 'Lecture'}, 'downloaded_bytes': 200_000}

        with patch.object(youtube_audio, '_try_download', side_effect=download):
            result = youtube_audio.probe('https://youtu.be/x')
        self.assertTrue(result['ok'])
        self.assertEqual(result['client'], 'tv')
        self.assertEqual(calls, [None, 'tv'])
        self.assertEqual([a['ok'] for a in result['attempts']], [False, True])
        self.assertEqual(result['attempts'][0]['error_type'], 'download_forbidden')
        self.assertEqual(result['downloaded_bytes'], 200_000)



def sample_wav():
    samples = bytearray()
    for i in range(16000):
        samples.extend(int(4000 * math.sin(2 * math.pi * 440 * i / 16000)).to_bytes(2, 'little', signed=True))
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(samples)
    return stream.getvalue()


AUTH = {'Authorization': 'Bearer secret'}


class YoutubeTranscribeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test')
        self.env = patch.dict(os.environ, {'YOUTUBE_ACCESS_TOKEN': 'secret'})
        self.env.start()

    async def asyncTearDown(self):
        self.env.stop()
        await self.client.aclose()

    async def test_info_returns_title_and_length(self):
        info = {'title': 'Lecture 3', 'uploader': 'Prof', 'duration_seconds': 4723, 'too_long': False,
                'max_duration_seconds': youtube_audio.MAX_DURATION_SECONDS}
        with patch.object(youtube_audio, 'fetch_info', return_value=info):
            response = await self.client.post('/youtube/info', json={'url': 'https://youtu.be/abc'}, headers=AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['title'], 'Lecture 3')

    async def test_info_reports_youtube_refusal(self):
        with patch.object(youtube_audio, 'fetch_info',
                          side_effect=youtube_audio.YoutubeError('Sign in to confirm', 'bot_check')):
            response = await self.client.post('/youtube/info', json={'url': 'https://youtu.be/abc'}, headers=AUTH)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()['youtube_error_type'], 'bot_check')

    async def test_transcribe_downloads_then_runs_the_normal_pipeline(self):
        def download(_url, out_dir, on_progress, _log):
            on_progress(50)
            path = Path(out_dir) / 'audio.wav'
            path.write_bytes(sample_wav())
            return {'path': str(path), 'title': 'Lecture 3', 'duration_seconds': 1}

        groq = AsyncMock(return_value={'text': '決策樹', 'duration': 1,
                                       'segments': [{'start': 0, 'end': 1, 'text': '決策樹', 'no_speech_prob': 0.01}]})
        with patch.object(youtube_audio, 'download_audio', side_effect=download), \
             patch.object(audio_pipeline, '_transcribe_bytes', new=groq):
            response = await self.client.post('/youtube/transcribe/stream', headers=AUTH, json={
                'url': 'https://youtu.be/abc', 'groq_api_key': 'test-key', 'language': 'zh'})
        body = response.text
        self.assertIn('"phase": "downloading", "percent": 50', body)
        self.assertIn('"phase": "transcribing"', body)
        self.assertIn('event: final', body)
        self.assertEqual(groq.await_args.args[3], 'zh')

    async def test_download_refusal_becomes_a_youtube_error_event(self):
        with patch.object(youtube_audio, 'download_audio',
                          side_effect=youtube_audio.YoutubeError('Sign in to confirm', 'bot_check')):
            response = await self.client.post('/youtube/transcribe/stream', headers=AUTH, json={
                'url': 'https://youtu.be/abc', 'groq_api_key': 'test-key'})
        self.assertIn('"error_type": "youtube_error"', response.text)
        self.assertIn('"youtube_error_type": "bot_check"', response.text)
        self.assertNotIn('event: final', response.text)

    async def test_missing_groq_key_and_bad_token(self):
        missing = await self.client.post('/youtube/transcribe/stream', headers=AUTH,
                                         json={'url': 'https://youtu.be/abc'})
        self.assertIn('"error_type": "missing_groq_key"', missing.text)
        unauthorized = await self.client.post('/youtube/transcribe/stream', json={'url': 'https://youtu.be/abc'},
                                              headers={'Authorization': 'Bearer nope'})
        self.assertEqual(unauthorized.status_code, 401)


if __name__ == '__main__':
    unittest.main()
