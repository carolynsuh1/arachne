"""Call GPT-5.6 Terra via the Responses API.

Used by pipeline extract (and later teammate steps). Do not import this from
goal_network.py — step 1 keeps Chat Completions / gpt-4o-mini.
"""

from __future__ import annotations

import json
import os
import re

import httpx

RESPONSES_URL = "https://api.openai.com/v1/responses"


class LLMError(Exception):
    pass


def get_api_key() -> str | None:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    return key or None


def call_terra(instructions: str, user_input: str) -> str:
    api_key = get_api_key()
    if not api_key:
        raise LLMError("OPENAI_API_KEY is not set in backend/.env")

    model = os.getenv("PIPELINE_MODEL", "gpt-5.6-terra").strip() or "gpt-5.6-terra"
    payload = {
        "model": model,
        "instructions": instructions,
        "input": user_input[:12000],
    }
    try:
        response = httpx.post(
            RESPONSES_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=60.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise LLMError(f"Terra request failed: {exc}") from exc

    text = _output_text(response.json())
    if not text.strip():
        raise LLMError("Terra returned an empty response")
    return text


def parse_json_object(text: str) -> dict:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise LLMError("Terra did not return valid JSON") from exc
    if not isinstance(parsed, dict):
        raise LLMError("Terra JSON must be an object")
    return parsed


def _output_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"]
    chunks: list[str] = []
    for item in payload.get("output") or []:
        for part in item.get("content") or []:
            if part.get("type") in {"output_text", "text"} and part.get("text"):
                chunks.append(str(part["text"]))
    return "\n".join(chunks)
