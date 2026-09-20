import unittest
from unittest.mock import Mock, patch

from app.pipeline.deepgram import transcribe_audio, voice_agent_settings


class DeepgramTests(unittest.TestCase):
    @patch.dict("os.environ", {"DEEPGRAM_API_KEY": "test-only"}, clear=False)
    @patch("app.pipeline.deepgram.httpx.post")
    def test_nova_transcription_uses_binary_audio(self, post):
        response = Mock()
        response.json.return_value = {
            "results": {"channels": [{"alternatives": [{"transcript": "Hello Sarah."}]}]}
        }
        post.return_value = response

        self.assertEqual(transcribe_audio(b"audio", "audio/webm"), "Hello Sarah.")
        _, kwargs = post.call_args
        self.assertEqual(kwargs["params"]["model"], "nova-3")
        self.assertEqual(kwargs["content"], b"audio")
        self.assertTrue(kwargs["headers"]["Authorization"].startswith("Token "))

    def test_voice_agent_configures_nova_aura_and_tools(self):
        settings = voice_agent_settings("network", "Learn AI agents")
        self.assertEqual(
            settings["agent"]["listen"]["provider"]["model"],
            "nova-3",
        )
        self.assertTrue(
            settings["agent"]["speak"]["provider"]["model"].startswith("aura-")
        )
        names = {
            function["name"] for function in settings["agent"]["think"]["functions"]
        }
        self.assertIn("search_people", names)
        self.assertIn("create_reminder", names)


if __name__ == "__main__":
    unittest.main()
