from fastapi import APIRouter, File, HTTPException, UploadFile

from ..services.transcription import (
    TranscriptionConfigurationError,
    TranscriptionProviderError,
    transcribe_audio,
)

router = APIRouter(prefix="/transcription", tags=["transcription"])

MAX_AUDIO_BYTES = 20 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "video/webm",
}


@router.post("")
async def create_transcription(audio: UploadFile = File(...)):
    content_type = (audio.content_type or "audio/webm").split(";")[0]
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(415, "Unsupported audio format.")

    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(422, "The recording was empty. Try speaking closer to the microphone.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "The recording is too large. Keep it under 20 MB.")

    try:
        text, provider = transcribe_audio(
            data,
            audio.filename or "recording.webm",
            content_type,
        )
    except TranscriptionConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except TranscriptionProviderError as exc:
        raise HTTPException(502, str(exc)) from exc

    return {"text": text, "provider": provider}
