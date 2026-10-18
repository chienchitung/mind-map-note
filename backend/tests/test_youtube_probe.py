import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
import youtube_probe


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
             patch.object(youtube_probe, 'probe') as probe:
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
             patch.object(youtube_probe, 'probe', return_value={'ok': True, 'title': 'Lecture'}) as probe:
            page = await self.client.get('/youtube/test')
            response = await self.client.post('/youtube/probe', json={'url': 'https://www.youtube.com/watch?v=abc'},
                                              headers={'Authorization': 'Bearer secret'})
        self.assertEqual(page.status_code, 200)
        self.assertIn('YouTube 連線測試', page.text)
        self.assertEqual(response.json(), {'ok': True, 'title': 'Lecture'})
        probe.assert_called_once_with('https://www.youtube.com/watch?v=abc')

    def test_error_messages_are_classified(self):
        classify = youtube_probe._classify_error
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
            self.assertEqual(youtube_probe._cookies_format(str(netscape)), 'netscape')
            self.assertTrue(youtube_probe._cookies_format(str(json_file)).startswith('json'))

    def test_missing_cookies_report_lists_secret_file_names(self):
        with patch.dict(os.environ, {'YOUTUBE_COOKIES_FILE': '/nonexistent/youtube_cookies.txt'}), \
             patch.object(youtube_probe, '_secret_file_names', return_value=['cookies.txt']), \
             patch.object(youtube_probe.yt_dlp, 'YoutubeDL', side_effect=RuntimeError('Sign in to confirm you’re not a bot')):
            result = youtube_probe.probe('https://youtu.be/x')
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
            self.assertEqual(youtube_probe._login_cookie_names(str(path)), ['SAPISID'])

    def test_falls_back_to_another_player_client(self):
        calls = []

        def download(_url, _cookies, _deno, client):
            calls.append(client)
            if client is None:
                raise RuntimeError('ERROR: unable to download video data: HTTP Error 403: Forbidden')
            return {'info': {'title': 'Lecture'}, 'downloaded_bytes': 200_000}

        with patch.object(youtube_probe, '_try_download', side_effect=download):
            result = youtube_probe.probe('https://youtu.be/x')
        self.assertTrue(result['ok'])
        self.assertEqual(result['client'], 'tv')
        self.assertEqual(calls, [None, 'tv'])
        self.assertEqual([a['ok'] for a in result['attempts']], [False, True])
        self.assertEqual(result['attempts'][0]['error_type'], 'download_forbidden')
        self.assertEqual(result['downloaded_bytes'], 200_000)


if __name__ == '__main__':
    unittest.main()
