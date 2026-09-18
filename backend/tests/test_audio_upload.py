import asyncio
import io
import math
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audio_pipeline
import main


def sample_wav():
    samples = bytearray()
    for i in range(16000):
        sample = int(4000 * math.sin(2 * math.pi * 440 * i / 16000))
        samples.extend(sample.to_bytes(2, 'little', signed=True))
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(samples)
    return stream.getvalue()


class AudioUploadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app),
            base_url='http://test',
        )

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_dev_origin_can_reach_health_and_upload(self):
        origin = 'http://localhost:3000'
        health = await self.client.get('/health', headers={'Origin': origin})
        self.assertEqual(health.headers.get('access-control-allow-origin'), origin)
        preflight = await self.client.options('/audio/transcribe/stream', headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
        })
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers.get('access-control-allow-origin'), origin)
        other = await self.client.get('/health', headers={'Origin': 'https://unrelated.example'})
        self.assertNotIn('access-control-allow-origin', other.headers)

    async def test_uploaded_wav_normalizes_and_streams_transcript(self):
        response_from_groq = {
            'text': 'Hello world',
            'segments': [{'start': 0, 'end': 1, 'text': 'Hello world', 'no_speech_prob': 0.01}],
            'duration': 1,
        }
        with patch.object(audio_pipeline, '_transcribe_bytes', new=AsyncMock(return_value=response_from_groq)) as groq:
            response = await self.client.post('/audio/transcribe/stream',
                files={'audio': ('speech.wav', sample_wav(), 'audio/wav')},
                data={'groq_api_key': 'test-key', 'language': 'en'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('event: final', response.text)
        self.assertIn('"text": "Hello world"', response.text)
        self.assertIn('"phase": "transcribing"', response.text)
        self.assertEqual(groq.await_args.args[2], 'test-key')
        self.assertEqual(groq.await_args.args[3], 'en')
        self.assertTrue(groq.await_args.args[1].endswith('.mp3'))

    async def test_audio_only_webm_skips_expensive_transcode(self):
        with tempfile.TemporaryDirectory() as folder:
            wav_path = Path(folder) / 'speech.wav'
            webm_path = Path(folder) / 'speech.webm'
            wav_path.write_bytes(sample_wav())
            subprocess.run([
                audio_pipeline.FFMPEG_BIN, '-y', '-loglevel', 'error', '-i', str(wav_path),
                '-c:a', 'libopus', str(webm_path),
            ], check=True)
            self.assertTrue(audio_pipeline.can_transcribe_webm_directly(str(webm_path)))

            response_from_groq = {
                'text': 'Hello',
                'segments': [{'start': 0, 'end': 1, 'text': 'Hello', 'no_speech_prob': 0}],
                'duration': 1,
            }
            with patch.object(main, 'normalize_audio', side_effect=AssertionError('unexpected transcode')), \
                 patch.object(audio_pipeline, '_transcribe_bytes', new=AsyncMock(return_value=response_from_groq)) as groq:
                response = await self.client.post('/audio/transcribe/stream',
                    files={'audio': ('speech.webm', webm_path.read_bytes(), 'audio/webm')},
                    data={'groq_api_key': 'test-key'})

        self.assertIn('event: final', response.text)
        self.assertTrue(groq.await_args.args[1].endswith('.webm'))

    async def test_webm_with_video_uses_normalization(self):
        with tempfile.TemporaryDirectory() as folder:
            webm_path = Path(folder) / 'video.webm'
            subprocess.run([
                audio_pipeline.FFMPEG_BIN, '-y', '-loglevel', 'error',
                '-f', 'lavfi', '-i', 'color=c=black:s=16x16:d=1',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
                '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest', str(webm_path),
            ], check=True)
            self.assertFalse(audio_pipeline.can_transcribe_webm_directly(str(webm_path)))

    async def test_silent_segments_do_not_generate_a_note(self):
        hallucinated = {
            'text': 'Thank you for watching',
            'segments': [{'start': 0, 'end': 1, 'text': 'Thank you for watching', 'no_speech_prob': 0.95}],
            'duration': 1,
        }
        with patch.object(audio_pipeline, '_transcribe_bytes', new=AsyncMock(return_value=hallucinated)):
            response = await self.client.post('/audio/transcribe/stream',
                files={'audio': ('silence.wav', sample_wav(), 'audio/wav')},
                data={'groq_api_key': 'test-key'})
        self.assertIn('"error_type": "no_speech"', response.text)
        self.assertNotIn('event: final', response.text)

    async def test_missing_key_reports_stream_error(self):
        response = await self.client.post('/audio/transcribe/stream',
            files={'audio': ('speech.wav', sample_wav(), 'audio/wav')})
        self.assertIn('"error_type": "missing_groq_key"', response.text)

    async def test_multipart_boundary_does_not_reduce_file_limit(self):
        # The request body includes the key, language and multipart headers;
        # a file right at the advertised limit needs room for that overhead.
        response = await self.client.post('/audio/transcribe/stream',
            headers={'Content-Length': str(main.MAX_UPLOAD_BYTES + 100)},
            files={'audio': ('speech.wav', sample_wav(), 'audio/wav')})
        self.assertEqual(response.status_code, 200)
        self.assertIn('missing_groq_key', response.text)

        response = await self.client.post('/audio/transcribe/stream',
            headers={'Content-Length': str(main.MAX_UPLOAD_BYTES + main.MAX_MULTIPART_OVERHEAD_BYTES + 1)},
            files={'audio': ('speech.wav', sample_wav(), 'audio/wav')})
        self.assertEqual(response.status_code, 413)

    async def test_chunk_timestamps_and_filtered_note_text(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'normalized.mp3'
            source.write_bytes(b'0' * (audio_pipeline.GROQ_MAX_UPLOAD_BYTES + 1))

            def split(_path, _seconds, out_dir, _duration, _on_progress):
                chunks = [Path(out_dir) / f'chunk_00{i}.mp3' for i in range(2)]
                for chunk in chunks:
                    chunk.write_bytes(b'mp3')
                return [str(chunk) for chunk in chunks]

            groq = AsyncMock(side_effect=[
                {'text': 'first silence', 'duration': 10, 'segments': [
                    {'start': 0, 'end': 3, 'text': 'first', 'no_speech_prob': 0.01},
                    {'start': 3, 'end': 10, 'text': 'silence', 'no_speech_prob': 0.98}]},
                {'text': 'second', 'duration': 8, 'segments': [
                    {'start': 1, 'end': 6, 'text': 'second', 'no_speech_prob': 0.01}]},
            ])
            with patch.object(audio_pipeline, '_split_audio_ffmpeg', side_effect=split), \
                 patch.object(audio_pipeline, '_probe_duration_seconds', return_value=18), \
                 patch.object(audio_pipeline, '_transcribe_bytes', new=groq):
                result = await audio_pipeline.transcribe_audio(str(source), 'test-key')

        self.assertEqual(result['text'], 'first second')
        self.assertEqual(result['segments'][1]['start'], 11)
        self.assertEqual(result['duration'], 18)
        self.assertEqual(groq.await_count, 2)

    async def test_groq_invalid_key_becomes_a_specific_stream_error(self):
        with patch.object(audio_pipeline, '_transcribe_bytes',
                          new=AsyncMock(side_effect=audio_pipeline.InvalidGroqApiKeyError('Invalid API key'))):
            response = await self.client.post('/audio/transcribe/stream',
                files={'audio': ('speech.wav', sample_wav(), 'audio/wav')},
                data={'groq_api_key': 'bad-key'})
        self.assertIn('"error_type": "invalid_groq_key"', response.text)
        self.assertNotIn('event: final', response.text)

    async def test_groq_rate_limit_retries_the_same_chunk(self):
        statuses = [429, 200]

        def reply(_request):
            status = statuses.pop(0)
            if status == 429:
                return httpx.Response(429, headers={'retry-after': '0'}, json={'error': {'message': 'Rate limited'}})
            return httpx.Response(200, json={'text': 'Recovered', 'segments': []})

        transport = httpx.MockTransport(reply)
        client_type = httpx.AsyncClient
        cooldowns = []

        async def report(seconds, attempt):
            cooldowns.append((seconds, attempt))

        with patch.object(audio_pipeline.httpx, 'AsyncClient',
                          side_effect=lambda **kwargs: client_type(transport=transport, **kwargs)), \
             patch.object(audio_pipeline.asyncio, 'sleep', new=AsyncMock()):
            result = await audio_pipeline._transcribe_bytes(b'mp3', 'speech.mp3', 'test-key', None, report)

        self.assertEqual(result['text'], 'Recovered')
        self.assertEqual(cooldowns, [(0.0, 1)])
        self.assertEqual(statuses, [])


if __name__ == '__main__':
    unittest.main()
