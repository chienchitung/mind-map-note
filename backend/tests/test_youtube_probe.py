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


if __name__ == '__main__':
    unittest.main()
