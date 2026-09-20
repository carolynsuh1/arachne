from __future__ import annotations

import json
import os
import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BrainDumpItem, Goal, InteractionMemory, Meeting, Person, Relationship, Reminder
from ..pipeline.llm import LLMError, call_terra
from ..schemas import (
    AskMeetingsIn,
    AskMeetingsOut,
    BrainDumpCard,
    BrainDumpExtraction,
    MeetingChunkIn,
    MeetingCitation,
    MeetingConfirmIn,
    MeetingConfirmOut,
    MeetingLiveOut,
    MeetingOut,
    MeetingStartIn,
    SuggestedIntroduction,
)
from .brain_dumps import (
    _create_reminders,
    _find_person,
    _heuristic_extract,
    _openai_extract,
    _summary,
)

router = APIRouter(prefix="/meetings", tags=["meetings"])
MEETING_TYPES = {"coffee_chat", "networking", "mentor", "club", "professional_call", "other"}


@router.post("", response_model=MeetingOut, status_code=201)
def start_meeting(payload: MeetingStartIn, db: Session = Depends(get_db)):
    if not payload.person_ids:
        raise HTTPException(422, "Choose at least one person for the meeting.")
    people = _people(db, payload.person_ids)
    goal = db.get(Goal, payload.goal_id) if payload.goal_id else None
    meeting_type = payload.meeting_type if payload.meeting_type in MEETING_TYPES else "other"
    title = payload.title.strip() or f"{_type_label(meeting_type)} with {', '.join(p.name for p in people)}"
    meeting = Meeting(
        id=str(uuid4()), title=title, meeting_type=meeting_type,
        person_ids_json=json.dumps([p.id for p in people]),
        person_names_json=json.dumps([p.name for p in people]),
        goal_id=goal.id if goal else None,
        goal_text=(payload.goal_text.strip() or (goal.text if goal else "")),
        status="live",
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _out(meeting)


@router.post("/{meeting_id}/chunks", response_model=MeetingLiveOut)
def ingest_chunk(meeting_id: str, payload: MeetingChunkIn, db: Session = Depends(get_db)):
    meeting = _meeting(db, meeting_id)
    if meeting.status not in {"live", "paused"}:
        raise HTTPException(409, "This meeting has ended.")
    text = payload.text.strip()
    # The client sends the complete current transcript, which makes retries idempotent.
    meeting.transcript = text
    extraction = _extract(meeting, db)
    meeting.cards_json = json.dumps([card.model_dump() for card in extraction.cards])
    meeting.introductions_json = json.dumps([item.model_dump() for item in extraction.introductions])
    meeting.summary = extraction.spoken_summary
    meeting.tags_json = json.dumps(_tags(extraction.cards))
    db.commit()
    db.refresh(meeting)
    return MeetingLiveOut(meeting=_out(meeting), extraction=extraction)


@router.post("/{meeting_id}/pause", response_model=MeetingOut)
def pause_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = _meeting(db, meeting_id)
    meeting.status = "paused"
    db.commit()
    return _out(meeting)


@router.post("/{meeting_id}/resume", response_model=MeetingOut)
def resume_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = _meeting(db, meeting_id)
    if meeting.ended_at:
        raise HTTPException(409, "This meeting has ended.")
    meeting.status = "live"
    db.commit()
    return _out(meeting)


@router.post("/{meeting_id}/end", response_model=MeetingLiveOut)
def end_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = _meeting(db, meeting_id)
    if not meeting.transcript.strip():
        raise HTTPException(422, "Add a transcript before ending the meeting.")
    extraction = _extract(meeting, db)
    meeting.status = "review"
    meeting.ended_at = meeting.ended_at or datetime.utcnow()
    meeting.cards_json = json.dumps([card.model_dump() for card in extraction.cards])
    meeting.introductions_json = json.dumps([item.model_dump() for item in extraction.introductions])
    meeting.summary = extraction.spoken_summary
    meeting.tags_json = json.dumps(_tags(extraction.cards))
    db.commit()
    return MeetingLiveOut(meeting=_out(meeting), extraction=extraction)


@router.post("/{meeting_id}/confirm", response_model=MeetingConfirmOut)
def confirm_meeting(meeting_id: str, payload: MeetingConfirmIn, db: Session = Depends(get_db)):
    meeting = _meeting(db, meeting_id)
    if meeting.confirmed_at:
        raise HTTPException(409, "Meeting memory has already been confirmed.")
    selected = [card for card in payload.cards if card.selected and card.text.strip()]
    people = _people(db, json.loads(meeting.person_ids_json))
    reminders = []
    for person in people:
        memory = InteractionMemory(
            id=str(uuid4()), person_id=person.id, person_name=person.name,
            transcript=meeting.transcript, happened_at=meeting.started_at,
        )
        db.add(memory)
        db.flush()
        for card in selected:
            db.add(BrainDumpItem(
                id=str(uuid4()), interaction_id=memory.id, person_id=person.id,
                category=card.category, text=card.text.strip(),
            ))
        reminders.extend(_create_reminders(db, person.id, memory.id, selected, meeting.started_at))
        info = list(dict.fromkeys(
            c.text for c in selected
            if c.category in {"new_information", "personal_details", "advice", "opportunities", "career_info", "current_projects"}
        ))
        if info:
            addition = f"Meeting {meeting.started_at.date().isoformat()}: {' '.join(info)}"
            if addition.casefold() not in (person.bio or "").casefold():
                person.bio = " ".join(filter(None, [person.bio, addition])).strip()

    created_people: list[str] = []
    source = people[0]
    for intro in payload.introductions:
        target = db.get(Person, intro.existing_person_id) if intro.existing_person_id else _find_person(db, intro.name)
        if not target:
            target = Person(
                id=f"suggested-{uuid4().hex[:12]}", name=intro.name.strip(),
                bio=f"Suggested connection. {intro.affiliation}".strip(), interests="[]", skills="[]",
            )
            db.add(target)
            db.flush()
            created_people.append(target.name)
        relation_id = f"intro-{source.id}-{target.id}"
        if not db.get(Relationship, relation_id):
            db.add(Relationship(
                id=relation_id, source_type="person", source_id=source.id,
                target_type="person", target_id=target.id, type="suggested_intro",
                strength=0.65, evidence=intro.context or f"{source.name} recommended {target.name}.",
            ))
    meeting.status = "confirmed"
    meeting.confirmed_at = datetime.utcnow()
    meeting.cards_json = json.dumps([card.model_dump() for card in payload.cards])
    meeting.introductions_json = json.dumps([item.model_dump() for item in payload.introductions])
    meeting.tags_json = json.dumps(_tags(selected))
    db.commit()
    return MeetingConfirmOut(
        meeting=_out(meeting), reminders=reminders, created_people=created_people,
    )


@router.get("", response_model=list[MeetingOut])
def list_meetings(
    search: str = "", person_id: str = "", goal_id: str = "", topic: str = "",
    company: str = "", meeting_type: str = "", date: str = "",
    db: Session = Depends(get_db),
):
    rows = db.query(Meeting).order_by(Meeting.started_at.desc()).all()
    terms = [search, topic, company]
    result = []
    for row in rows:
        haystack = " ".join([
            row.title, row.transcript, row.summary, row.cards_json,
            row.person_names_json, row.tags_json, row.goal_text,
        ]).casefold()
        if person_id and person_id not in json.loads(row.person_ids_json):
            continue
        if goal_id and row.goal_id != goal_id:
            continue
        if meeting_type and row.meeting_type != meeting_type:
            continue
        if date and row.started_at.date().isoformat() != date:
            continue
        if any(term and term.casefold() not in haystack for term in terms):
            continue
        result.append(_out(row))
    return result


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    return _out(_meeting(db, meeting_id))


@router.post("/ask/query", response_model=AskMeetingsOut)
def ask_meetings(payload: AskMeetingsIn, db: Session = Depends(get_db)):
    words = {word for word in re.findall(r"[a-z0-9]+", payload.question.casefold()) if len(word) > 2}
    scored = []
    for meeting in db.query(Meeting).filter(Meeting.status == "confirmed").all():
        text = " ".join([meeting.transcript, meeting.summary, meeting.cards_json])
        score = sum(text.casefold().count(word) for word in words)
        if score:
            scored.append((score, meeting, _excerpt(text, words)))
    scored.sort(key=lambda item: (item[0], item[1].started_at), reverse=True)
    citations = [
        MeetingCitation(
            meeting_id=row.id, title=row.title, person_names=json.loads(row.person_names_json),
            date=row.started_at, excerpt=excerpt,
        )
        for _, row, excerpt in scored[:5]
    ]
    if not citations:
        return AskMeetingsOut(answer="I could not find that in your confirmed meeting memory.", citations=[])
    context = "\n".join(f"{c.title} ({c.date.date()}): {c.excerpt}" for c in citations)
    answer = f"{citations[0].excerpt} — {citations[0].title}"
    if os.getenv("OPENAI_API_KEY", "").strip():
        try:
            answer = call_terra(
                "Answer only from the supplied meeting excerpts. Be concise and do not invent facts. "
                "Cite meeting titles in conversational plain prose. This answer is read aloud, so never "
                "use Markdown, HTML, asterisks, underscores, backticks, headings, bullets, or visual emphasis.",
                f"Question: {payload.question}\n\nExcerpts:\n{context}",
            ).strip()
        except LLMError:
            pass
    return AskMeetingsOut(answer=answer, citations=citations)


@router.get("/people/{person_id}/timeline")
def person_timeline(person_id: str, db: Session = Depends(get_db)):
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "Person not found.")
    events = []
    for meeting in db.query(Meeting).order_by(Meeting.started_at.desc()).all():
        if person_id in json.loads(meeting.person_ids_json):
            events.append({
                "id": meeting.id, "kind": "meeting", "title": meeting.title,
                "detail": meeting.summary, "at": meeting.started_at.isoformat(),
            })
    for reminder in db.query(Reminder).filter(Reminder.person_id == person_id).all():
        events.append({
            "id": reminder.id, "kind": "reminder", "title": reminder.action,
            "detail": reminder.status, "at": (reminder.due_at or reminder.created_at).isoformat(),
        })
    for memory in db.query(InteractionMemory).filter(InteractionMemory.person_id == person_id).all():
        events.append({
            "id": memory.id, "kind": "interaction", "title": f"Conversation with {person.name}",
            "detail": memory.transcript[:240], "at": memory.happened_at.isoformat(),
        })
    return sorted(events, key=lambda event: event["at"], reverse=True)


def _extract(meeting: Meeting, db: Session) -> BrainDumpExtraction:
    person = _people(db, json.loads(meeting.person_ids_json))[0]
    if os.getenv("OPENAI_API_KEY", "").strip():
        try:
            return _openai_extract(person, meeting.transcript, db)
        except (LLMError, KeyError, TypeError, ValueError):
            pass
    result = _heuristic_extract(person, meeting.transcript, db)
    result.spoken_summary = _summary(person.name, result.cards, result.introductions)
    return result


def _people(db: Session, ids: list[str]) -> list[Person]:
    people = [db.get(Person, person_id) for person_id in dict.fromkeys(ids)]
    if not people or any(person is None for person in people):
        raise HTTPException(404, "One or more people were not found.")
    return [person for person in people if person is not None]


def _meeting(db: Session, meeting_id: str) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(404, "Meeting not found.")
    return meeting


def _out(row: Meeting) -> MeetingOut:
    return MeetingOut(
        id=row.id, title=row.title, meeting_type=row.meeting_type,
        person_ids=json.loads(row.person_ids_json), person_names=json.loads(row.person_names_json),
        goal_id=row.goal_id, goal_text=row.goal_text, status=row.status,
        transcript=row.transcript, summary=row.summary,
        cards=[BrainDumpCard(**item) for item in json.loads(row.cards_json or "[]")],
        introductions=[SuggestedIntroduction(**item) for item in json.loads(row.introductions_json or "[]")],
        tags=json.loads(row.tags_json or "[]"), started_at=row.started_at,
        ended_at=row.ended_at, confirmed_at=row.confirmed_at,
    )


def _tags(cards: list[BrainDumpCard]) -> list[str]:
    tags = []
    for card in cards:
        if card.category in {"topics", "current_projects", "career_info", "opportunities"}:
            tags.extend(re.findall(r"\b[A-Z][A-Za-z0-9+.-]{2,}\b", card.text))
    return list(dict.fromkeys(tags))[:12]


def _excerpt(text: str, words: set[str]) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    return max(sentences, key=lambda sentence: sum(word in sentence.casefold() for word in words), default=text[:280])[:500]


def _type_label(value: str) -> str:
    return value.replace("_", " ").title()
