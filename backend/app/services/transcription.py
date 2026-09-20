"""Server-side speech-to-text providers used by every voice input surface."""

import os

import httpx

from ..pipeline.deepgram import (
    DeepgramConfigurationError,
    DeepgramError,
    transcribe_audio as transcribe_with_deepgram,
)

class TranscriptionConfigurationError(RuntimeError):
    """Raised when no speech-to-text provider has been configured."""


class TranscriptionProviderError(RuntimeError):
    """Raised when a configured speech-to-text provider fails."""


def transcribe_audio(audio: bytes, filename: str, content_type: str) -> tuple[str, str]:
    deepgram_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    if deepgram_key:
        try:
            return transcribe_with_deepgram(audio, content_type), "deepgram"
        except (DeepgramError, DeepgramConfigurationError) as exc:
            if not openai_key:
                raise TranscriptionProviderError(
                    str(exc)
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
        "Voice transcription is not configured. Set DEEPGRAM_API_KEY or OPENAI_API_KEY "
        "in backend/.env, then restart the backend."
    )
