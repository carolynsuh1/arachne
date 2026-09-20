"""Shared Deepgram STT and continuous Voice Agent configuration."""

from __future__ import annotations

import os
import re
from html import unescape

import httpx


LISTEN_URL = "https://api.deepgram.com/v1/listen"
VOICE_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"


class DeepgramConfigurationError(RuntimeError):
    """Raised when Deepgram has not been configured."""


class DeepgramError(RuntimeError):
    """Raised when Deepgram cannot complete a speech request."""


def _api_key() -> str:
    key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if not key:
        raise DeepgramConfigurationError(
            "Deepgram voice is not configured. Set DEEPGRAM_API_KEY in backend/.env "
            "and restart the backend."
        )
    return key


def transcribe_audio(audio: bytes, content_type: str) -> str:
    """Transcribe prerecorded audio with Deepgram Nova-3."""
    try:
        response = httpx.post(
            LISTEN_URL,
            params={"model": "nova-3", "smart_format": "true"},
            headers={
                "Authorization": f"Token {_api_key()}",
                "Content-Type": content_type,
            },
            content=audio,
            timeout=60,
        )
        response.raise_for_status()
        text = (
            response.json()
            .get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
            .get("transcript", "")
        )
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise DeepgramError(
            "Deepgram transcription failed. Check DEEPGRAM_API_KEY and try again."
        ) from exc
    if not str(text).strip():
        raise DeepgramError("Deepgram did not detect any speech.")
    return str(text).strip()


def api_key() -> str:
    """Return the backend-only key for the WebSocket proxy."""
    return _api_key()


def to_speakable_text(text: str) -> str:
    """Convert display-oriented Markdown or HTML into plain text for TTS."""
    value = unescape(str(text))
    value = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"```(?:[A-Za-z0-9_+-]+)?\s*([\s\S]*?)```", r"\1", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"<[^>]+>", " ", value)

    spoken_lines: list[str] = []
    for raw_line in value.splitlines():
        line = re.sub(r"^\s{0,3}#{1,6}\s+", "", raw_line)
        line = re.sub(r"^\s*>\s?", "", line)
        bullet = bool(re.match(r"^\s*(?:[-+*]|\d+[.)])\s+", line))
        line = re.sub(r"^\s*(?:[-+*]|\d+[.)])\s+", "", line).strip()
        line = re.sub(r"(\*\*|__|\*|_|~~)", "", line)
        line = re.sub(r"\\([\\`*_[\]{}()#+\-.!>])", r"\1", line)
        if not line:
            continue
        if bullet and line[-1] not in ".!?":
            line += "."
        spoken_lines.append(line)
    return re.sub(r"\s+", " ", " ".join(spoken_lines)).strip()


def voice_agent_settings(mode: str, goal_context: str = "") -> dict:
    """Build one Voice Agent configuration shared by every voice surface."""
    prompt = (
        "You are YourWeb's continuous voice interface. Be concise and conversational. "
        "Your replies are sent directly to speech synthesis, so respond only in natural "
        "spoken prose. Never use Markdown, HTML, asterisks, underscores, backticks, headings, "
        "bullets, numbered lists, or other visual formatting. Do not use symbols for emphasis. "
        "Use tools for all claims about the user's network, meetings, goals, and reminders. "
        "Never invent people or memories. Ask a follow-up when reminder details are missing. "
        "Before a permanent write, summarize it and ask for explicit confirmation; only call "
        "a write tool with confirmed=true after the user agrees. "
        f"Session mode: {mode}. "
        f"Active goal context: {goal_context or 'none'}."
    )
    return {
        "type": "Settings",
        "tags": ["yourweb", "voice_agent"],
        "mip_opt_out": True,
        "flags": {"history": True},
        "audio": {
            "input": {"encoding": "linear16", "sample_rate": 16_000},
            "output": {
                "encoding": "linear16",
                "sample_rate": 24_000,
                "container": "none",
            },
        },
        "agent": {
            "language": "en",
            "listen": {
                "provider": {
                    "type": "deepgram",
                    "model": "nova-3",
                    "smart_format": True,
                }
            },
            "think": {
                "provider": {
                    "type": "open_ai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                },
                "prompt": prompt,
                "functions": voice_tool_definitions(),
            },
            "speak": {
                "provider": {
                    "type": "deepgram",
                    "model": os.getenv(
                        "DEEPGRAM_VOICE_MODEL", "aura-2-thalia-en"
                    ).strip(),
                }
            },
        },
    }


def voice_tool_definitions() -> list[dict]:
    read = {
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    }
    identifiers = {
        "type": "object",
        "properties": {"id": {"type": "string"}},
        "required": ["id"],
    }
    tools = [
        ("search_people", "Search real people and profile context.", read),
        ("get_person", "Get one person by id.", identifiers),
        ("search_meetings", "Search raw transcripts and confirmed meeting memory.", read),
        ("get_meeting", "Get one meeting by id.", identifiers),
        ("search_relationships", "Search relationship evidence.", read),
        ("get_goal_context", "Get saved goals relevant to a query.", read),
        ("suggest_person", "Suggest who to talk to from real network data.", read),
        ("search_meeting_memory", "Answer from confirmed meetings and notes.", read),
        (
            "generate_followup",
            "Draft an email, LinkedIn message, or casual DM from conversation context.",
            {
                "type": "object",
                "properties": {
                    "person": {"type": "string"},
                    "channel": {"type": "string"},
                    "tone": {"type": "string"},
                },
                "required": ["person"],
            },
        ),
        (
            "create_reminder",
            "Create a reminder only after explicit user confirmation.",
            {
                "type": "object",
                "properties": {
                    "person": {"type": "string"},
                    "action": {"type": "string"},
                    "due": {"type": "string"},
                    "source": {"type": "string"},
                    "goal": {"type": "string"},
                    "confirmed": {"type": "boolean"},
                },
                "required": ["person", "action", "confirmed"],
            },
        ),
        (
            "create_followup_task",
            "Create a follow-up task only after explicit confirmation.",
            {
                "type": "object",
                "properties": {
                    "person": {"type": "string"},
                    "action": {"type": "string"},
                    "due": {"type": "string"},
                    "confirmed": {"type": "boolean"},
                },
                "required": ["person", "action", "confirmed"],
            },
        ),
        (
            "add_person_mention",
            "Stage a mentioned person for later confirmation; never persists directly.",
            {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "context": {"type": "string"},
                },
                "required": ["name"],
            },
        ),
    ]
    return [
        {
            "name": name,
            "description": description,
            "parameters": parameters,
            "defer_until_eot": True,
        }
        for name, description, parameters in tools
    ]
