"""Database-backed tools exposed to the Deepgram Voice Agent."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models import Goal, InteractionMemory, Meeting, Person, Relationship, Reminder


def run_voice_tool(db: Session, name: str, arguments: dict) -> dict:
    query = str(arguments.get("query", "")).casefold()
    if name == "search_people":
        rows = [
            person for person in db.query(Person).order_by(Person.name).all()
            if query in f"{person.name} {person.bio} {person.interests} {person.skills}".casefold()
        ]
        return {"people": [_person(row) for row in rows[:8]]}
    if name == "get_person":
        row = db.get(Person, str(arguments.get("id", "")))
        return {"person": _person(row) if row else None}
    if name in {"search_meetings", "search_meeting_memory"}:
        rows = db.query(Meeting).order_by(Meeting.started_at.desc()).all()
        matches = [
            row for row in rows
            if query in f"{row.title} {row.transcript} {row.summary} {row.cards_json}".casefold()
        ]
        return {"meetings": [_meeting(row) for row in matches[:6]]}
    if name == "get_meeting":
        row = db.get(Meeting, str(arguments.get("id", "")))
        return {"meeting": _meeting(row) if row else None}
    if name == "search_relationships":
        people = {person.id: person.name for person in db.query(Person).all()}
        rows = [
            row for row in db.query(Relationship).all()
            if query in f"{row.type} {row.evidence} {people.get(row.source_id, '')} {people.get(row.target_id, '')}".casefold()
        ]
        return {"relationships": [
            {
                "source": people.get(row.source_id, row.source_id),
                "target": people.get(row.target_id, row.target_id),
                "type": row.type,
                "evidence": row.evidence,
            }
            for row in rows[:8]
        ]}
    if name == "get_goal_context":
        rows = db.query(Goal).order_by(Goal.created_at.desc()).all()
        return {"goals": [
            {"id": row.id, "text": row.text}
            for row in rows if not query or query in row.text.casefold()
        ][:8]}
    if name == "suggest_person":
        rows = db.query(Person).all()
        scored = sorted(
            rows,
            key=lambda row: (
                -sum(word in f"{row.bio} {row.interests} {row.skills}".casefold() for word in query.split()),
                row.name,
            ),
        )
        return {"people": [_person(row) for row in scored[:5]]}
    if name == "generate_followup":
        person = _find_person(db, str(arguments.get("person", "")))
        if not person:
            return {"error": "Person not found."}
        memory = (
            db.query(InteractionMemory)
            .filter(InteractionMemory.person_id == person.id)
            .order_by(InteractionMemory.happened_at.desc())
            .first()
        )
        channel = str(arguments.get("channel", "message"))
        tone = str(arguments.get("tone", "warm"))
        context = memory.transcript[:240] if memory else person.bio[:240]
        return {
            "draft": (
                f"Hi {person.name.split()[0]} — thanks again for the conversation. "
                f"I appreciated your perspective on {context}. I’d love to stay in touch."
            ),
            "channel": channel,
            "tone": tone,
        }
    if name in {"create_reminder", "create_followup_task"}:
        if arguments.get("confirmed") is not True:
            return {"needs_confirmation": True, "message": "Ask the user to confirm this write."}
        person = _find_person(db, str(arguments.get("person", "")))
        if not person:
            return {"error": "Person not found; ask which saved person they mean."}
        reminder = Reminder(
            id=str(uuid4()),
            person_id=person.id,
            action=str(arguments.get("action", "")).strip(),
            due_at=_parse_due(str(arguments.get("due", ""))),
            notes=json.dumps({
                "source": arguments.get("source", "voice_agent"),
                "goal": arguments.get("goal", ""),
                "kind": name,
            }),
        )
        db.add(reminder)
        db.commit()
        return {
            "created": True,
            "reminder_id": reminder.id,
            "person": person.name,
            "action": reminder.action,
            "due_at": reminder.due_at.isoformat() if reminder.due_at else None,
        }
    if name == "add_person_mention":
        return {
            "staged": True,
            "name": arguments.get("name"),
            "context": arguments.get("context", ""),
            "message": "Mention staged for the existing review-and-confirm flow.",
        }
    return {"error": f"Unknown tool: {name}"}


def _find_person(db: Session, value: str) -> Person | None:
    wanted = value.casefold().strip()
    return next(
        (
            person for person in db.query(Person).all()
            if person.id == value or wanted in person.name.casefold()
        ),
        None,
    )


def _person(row: Person) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "bio": row.bio,
        "interests": json.loads(row.interests or "[]"),
        "skills": json.loads(row.skills or "[]"),
    }


def _meeting(row: Meeting) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "people": json.loads(row.person_names_json or "[]"),
        "date": row.started_at.isoformat(),
        "status": row.status,
        "raw_transcript": row.transcript,
        "confirmed_summary": row.summary if row.status == "confirmed" else "",
    }


def _parse_due(value: str) -> datetime | None:
    if not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        pass
    weekdays = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    lower = value.casefold()
    day = next((number for word, number in weekdays.items() if word in lower), None)
    if day is None:
        return None
    now = datetime.now()
    delta = (day - now.weekday()) % 7 or 7
    return (now + timedelta(days=delta)).replace(hour=9, minute=0, second=0, microsecond=0)
