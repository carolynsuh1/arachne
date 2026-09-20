import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.transcription import router


class TranscriptionTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    @patch(
        "app.routers.transcription.transcribe_audio",
        return_value=("Met Maya and promised an introduction.", "deepgram"),
    )
    def test_audio_in_returns_transcribed_text(self, transcribe):
        response = self.client.post(
            "/transcription",
            files={"audio": ("debrief.webm", b"recorded-audio", "audio/webm")},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "text": "Met Maya and promised an introduction.",
                "provider": "deepgram",
            },
        )
        transcribe.assert_called_once_with(
            b"recorded-audio",
            "debrief.webm",
            "audio/webm",
        )

    @patch.dict(
        os.environ,
        {"DEEPGRAM_API_KEY": "", "OPENAI_API_KEY": ""},
        clear=False,
    )
    def test_missing_provider_key_returns_actionable_error(self):
        response = self.client.post(
            "/transcription",
            files={"audio": ("debrief.webm", b"recorded-audio", "audio/webm")},
        )

        self.assertEqual(response.status_code, 503)
        self.assertIn("DEEPGRAM_API_KEY or OPENAI_API_KEY", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
