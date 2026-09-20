"""Backend-only proxy for continuous Deepgram Voice Agent sessions."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from uuid import uuid4

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import SessionLocal
from ..models import Goal, Meeting, MeetingTranscriptSegment
from ..pipeline.deepgram import (
    DeepgramConfigurationError,
    VOICE_AGENT_URL,
    api_key,
    to_speakable_text,
    voice_agent_settings,
)
from ..services.voice_tools import run_voice_tool
from ..voice_token import VoiceTokenError, verify_voice_token

router = APIRouter(tags=["voice"])


@router.websocket("/voice/session")
async def voice_session(
    client: WebSocket,
    mode: str = "network",
    meeting_id: str = "",
    goal_id: str = "",
    token: str = "",
):
    await client.accept()
    try:
        claims = verify_voice_token(token)
    except VoiceTokenError as exc:
        await client.send_json({"type": "Error", "description": str(exc), "reconnectable": False})
        await client.close(code=1008)
        return
    allowed_person_ids = {
        str(person_id) for person_id in claims["person_ids"] if str(person_id).strip()
    }
    if goal_id and goal_id != str(claims.get("goal_id", "")):
        await client.send_json({"type": "Error", "description": "Goal is outside this voice session.", "reconnectable": False})
        await client.close(code=1008)
        return
    try:
        key = api_key()
    except DeepgramConfigurationError as exc:
        await client.send_json({"type": "Error", "description": str(exc), "reconnectable": False})
        await client.close(code=1011)
        return

    goal_context = ""
    with SessionLocal() as db:
        goal = db.get(Goal, goal_id) if goal_id else None
        goal_context = goal.text if goal else ""
        if meeting_id:
            meeting = db.get(Meeting, meeting_id)
            if not meeting:
                await client.send_json({"type": "Error", "description": "Meeting not found.", "reconnectable": False})
                await client.close(code=1008)
                return
            meeting_people = set(json.loads(meeting.person_ids_json or "[]"))
            if not meeting_people or not meeting_people.issubset(allowed_person_ids):
                await client.send_json({"type": "Error", "description": "Meeting is outside this voice session.", "reconnectable": False})
                await client.close(code=1008)
                return

    try:
        async with websockets.connect(
            VOICE_AGENT_URL,
            additional_headers={"Authorization": f"Token {key}"},
            max_size=16 * 1024 * 1024,
        ) as agent:
            welcome = await agent.recv()
            await client.send_text(welcome if isinstance(welcome, str) else welcome.decode())
            await agent.send(json.dumps(voice_agent_settings(mode, goal_context)))
            tasks = {
                asyncio.create_task(_client_to_agent(client, agent)),
                asyncio.create_task(
                    _agent_to_client(
                        agent,
                        client,
                        meeting_id,
                        allowed_person_ids,
                        str(claims.get("goal_id", "")),
                    )
                ),
            }
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                error = task.exception()
                if error:
                    raise error
    except WebSocketDisconnect:
        return
    except (OSError, websockets.WebSocketException) as exc:
        await _safe_send(
            client,
            {
                "type": "Error",
                "description": "Deepgram disconnected. Check your network and reconnect.",
                "reconnectable": True,
                "detail": type(exc).__name__,
            },
        )
    finally:
        try:
            await client.close()
        except RuntimeError:
            pass


async def _client_to_agent(client: WebSocket, agent) -> None:
    while True:
        message = await client.receive()
        if message["type"] == "websocket.disconnect":
            return
        if message.get("bytes") is not None:
            await agent.send(message["bytes"])
        elif message.get("text") is not None:
            payload = json.loads(message["text"])
            if payload.get("type") in {
                "InjectUserMessage", "InjectAgentMessage", "KeepAlive",
                "UpdatePrompt", "UpdateSpeak"
            }:
                if payload.get("type") == "InjectAgentMessage":
                    field = "message" if "message" in payload else "content"
                    payload[field] = to_speakable_text(payload.get(field, ""))
                await agent.send(json.dumps(payload))


async def _agent_to_client(
    agent,
    client: WebSocket,
    meeting_id: str,
    allowed_person_ids: set[str],
    allowed_goal_id: str,
) -> None:
    async for message in agent:
        if isinstance(message, bytes):
            await client.send_bytes(message)
            continue
        event = json.loads(message)
        if event.get("type") == "FunctionCallRequest":
            for function in event.get("functions", []):
                if function.get("client_side") is False:
                    continue
                try:
                    arguments = json.loads(function.get("arguments") or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                with SessionLocal() as db:
                    result = run_voice_tool(
                        db,
                        function.get("name", ""),
                        arguments,
                        allowed_person_ids,
                        allowed_goal_id,
                    )
                response = {
                    "type": "FunctionCallResponse",
                    "id": function.get("id"),
                    "name": function.get("name"),
                    "content": json.dumps(result, default=str),
                }
                if function.get("thought_signature"):
                    response["thought_signature"] = function["thought_signature"]
                await agent.send(json.dumps(response))
                await client.send_json({"type": "ToolResult", "name": function.get("name"), "result": result})
        if (
            meeting_id
            and event.get("type") == "ConversationText"
            and event.get("role") == "user"
            and str(event.get("content", "")).strip()
        ):
            _save_meeting_segment(meeting_id, str(event["content"]).strip())
        await client.send_text(message)


def _save_meeting_segment(meeting_id: str, text: str) -> None:
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        if not meeting or meeting.status not in {"live", "paused"}:
            return
        previous = (
            db.query(MeetingTranscriptSegment)
            .filter(MeetingTranscriptSegment.meeting_id == meeting_id)
            .order_by(MeetingTranscriptSegment.captured_at.desc())
            .first()
        )
        if previous and previous.text == text:
            return
        db.add(MeetingTranscriptSegment(
            id=str(uuid4()),
            meeting_id=meeting_id,
            speaker="user",
            text=text,
            captured_at=datetime.utcnow(),
        ))
        meeting.transcript = "\n".join(filter(None, [meeting.transcript.strip(), text]))
        db.commit()


async def _safe_send(client: WebSocket, payload: dict) -> None:
    try:
        await client.send_json(payload)
    except (RuntimeError, WebSocketDisconnect):
        pass
