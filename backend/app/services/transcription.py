"""Server-side speech-to-text providers used by every voice input surface."""

import os

import httpx


class TranscriptionConfigurationError(RuntimeError):
    """Raised when no speech-to-text provider has been configured."""


class TranscriptionProviderError(RuntimeError):
    """Raised when a configured speech-to-text provider fails."""


def transcribe_audio(audio: bytes, filename: str, content_type: str) -> tuple[str, str]:
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    if elevenlabs_key:
        try:
            response = httpx.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": elevenlabs_key},
                data={"model_id": "scribe_v1"},
                files={"file": (filename, audio, content_type)},
                timeout=60,
            )
            response.raise_for_status()
            text = str(response.json().get("text", "")).strip()
            if text:
                return text, "elevenlabs"
            raise TranscriptionProviderError("ElevenLabs did not detect any speech.")
        except httpx.HTTPError as exc:
            if not openai_key:
                raise TranscriptionProviderError(
                    "ElevenLabs transcription failed. Check ELEVENLABS_API_KEY and try again."
                ) from exc

    if openai_key:
        try:
            response = httpx.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {openai_key}"},
                data={"model": "whisper-1"},
                files={"file": (filename, audio, content_type)},
                timeout=60,
            )
            response.raise_for_status()
            text = str(response.json().get("text", "")).strip()
            if text:
                return text, "openai"
            raise TranscriptionProviderError("No speech was detected in that recording.")
        except httpx.HTTPError as exc:
            raise TranscriptionProviderError(
                "OpenAI transcription failed. Check OPENAI_API_KEY and try again."
            ) from exc

    raise TranscriptionConfigurationError(
        "Voice transcription is not configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY "
        "in backend/.env, then restart the backend."
    )
