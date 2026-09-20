"""Short-lived HMAC tokens for the browser-to-backend voice WebSocket."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


class VoiceTokenError(ValueError):
    """Raised when a voice token is missing, invalid, or expired."""


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(value + padding)
    except (ValueError, TypeError) as exc:
        raise VoiceTokenError("Invalid voice token.") from exc


def verify_voice_token(token: str, now: int | None = None) -> dict[str, Any]:
    secret = os.getenv("INTERNAL_API_KEY", "").strip()
    if not secret:
        raise VoiceTokenError("Voice is not configured. Set INTERNAL_API_KEY in both apps.")
    if not token:
        raise VoiceTokenError("Voice token is required.")
    try:
        encoded, supplied = token.split(".", 1)
    except ValueError as exc:
        raise VoiceTokenError("Invalid voice token.") from exc
    expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _decode(supplied)):
        raise VoiceTokenError("Invalid voice token.")
    try:
        payload = json.loads(_decode(encoded))
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError) as exc:
        raise VoiceTokenError("Invalid voice token.") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("person_ids"), list):
        raise VoiceTokenError("Invalid voice token.")
    if int(payload.get("exp", 0)) <= (int(time.time()) if now is None else now):
        raise VoiceTokenError("Voice token has expired.")
    return payload
