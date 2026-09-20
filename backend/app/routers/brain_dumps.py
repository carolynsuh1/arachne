from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BrainDumpItem, Goal, InteractionMemory, Person, Relationship, Reminder
from ..pipeline.llm import LLMError, call_terra, parse_json_object
from ..schemas import (
    BrainDumpCard,
    BrainDumpActionIn,
    BrainDumpActionOut,
    BrainDumpConfirmIn,
    BrainDumpConfirmOut,
    BrainDumpExtractIn,
    BrainDumpExtraction,
    ReminderCreate,
    ReminderOut,
    SuggestedIntroduction,
    WhoNextOut,
)

router = APIRouter(prefix="/brain-dumps", tags=["brain dumps"])

CATEGORIES = {
    "new_information", "topics", "personal_details", "advice", "opportunities",
    "recommended_people", "commitments", "follow_ups", "next_conversation", "dates",
    "current_projects", "career_info", "organizations", "resources", "promises_they_made",
}


@router.post("/extract", response_model=BrainDumpExtraction)
def extract_brain_dump(payload: BrainDumpExtractIn, db: Session = Depends(get_db)):
    person = db.get(Person, payload.person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    if os.getenv("OPENAI_API_KEY", "").strip():
        try:
            return _openai_extract(person, payload.transcript, db)
        except (LLMError, KeyError, TypeError, ValueError):
            pass
    return _heuristic_extract(person, payload.transcript, db)


@router.post("/confirm", response_model=BrainDumpConfirmOut, status_code=201)
def confirm_brain_dump(payload: BrainDumpConfirmIn, db: Session = Depends(get_db)):
    person = db.get(Person, payload.person_id)
    if not person:
        raise HTTPException(404, "Person not found")
    selected = [card for card in payload.cards if card.selected and card.text.strip()]
    happened_at = payload.happened_at or datetime.utcnow()
    memory = InteractionMemory(
        id=str(uuid4()), person_id=person.id, person_name=person.name,
        transcript=payload.transcript.strip(), happened_at=happened_at,
    )
    db.add(memory)
    for card in selected:
        db.add(BrainDumpItem(
            id=str(uuid4()), interaction_id=memory.id, person_id=person.id,
            category=card.category, text=card.text.strip(),
        ))

    info = list(dict.fromkeys(card.text for card in selected if card.category in {"new_information", "personal_details", "advice", "opportunities"}))
    topics = [card.text for card in selected if card.category == "topics"]
    if info:
        addition = "Recent coffee chat: " + " ".join(info)
        if addition.casefold() not in (person.bio or "").casefold():
            person.bio = " ".join(part for part in [person.bio, addition] if part).strip()
    if topics:
        existing = json.loads(person.interests or "[]")
        person.interests = json.dumps(list(dict.fromkeys([*existing, *topics])))

    reminders = _create_reminders(db, person.id, memory.id, selected, happened_at)
    created_people: list[str] = []
    for intro in payload.introductions:
        target = _find_person(db, intro.name)
        if not target:
            target = Person(
                id=f"suggested-{uuid4().hex[:12]}", name=intro.name.strip(),
                bio=(f"Suggested connection. {intro.affiliation}".strip()),
                interests="[]", skills="[]",
            )
            db.add(target)
            db.flush()
            created_people.append(target.name)
        relation_id = f"intro-{person.id}-{target.id}"
        if not db.get(Relationship, relation_id):
            db.add(Relationship(
                id=relation_id, source_type="person", source_id=person.id,
                target_type="person", target_id=target.id, type="suggested_intro",
                strength=0.65, evidence=intro.context or f"{person.name} recommended introduction.",
            ))
    db.commit()
    db.refresh(memory)
    for reminder in reminders:
        db.refresh(reminder)
    summary = _summary(person.name, selected, payload.introductions)
    return BrainDumpConfirmOut(
        interaction=memory, reminders=reminders, created_people=created_people,
        spoken_summary=summary,
    )


@router.get("/upcoming", response_model=list[ReminderOut])
def upcoming(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    rows = db.query(Reminder).filter(Reminder.status != "completed").order_by(
        Reminder.due_at.is_(None), Reminder.due_at, Reminder.created_at
    ).limit(limit).all()
    for row in rows:
        if row.due_at and row.due_at < now:
            row.status = "overdue"
    db.commit()
    return rows


@router.post("/reminders", response_model=ReminderOut, status_code=201)
def create_reminder(payload: ReminderCreate, db: Session = Depends(get_db)):
    if not db.get(Person, payload.person_id):
        raise HTTPException(404, "Person not found")
    reminder = Reminder(id=str(uuid4()), **payload.model_dump())
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.post("/actions", response_model=BrainDumpActionOut)
def brain_dump_action(payload: BrainDumpActionIn, db: Session = Depends(get_db)):
    text = payload.text.strip()
    lower = text.casefold()
    if "who" in lower and ("talk" in lower or "reach out" in lower):
        recommendations = who_next(3, db)
        return BrainDumpActionOut(
            message="Here are the strongest next conversations based on intros and follow-ups.",
            recommendations=recommendations,
        )
    if "remind" in lower:
        due = _natural_due(lower, datetime.utcnow())
        action = re.sub(r"^(yes,?\s*)?remind me (to )?", "", text, flags=re.I).strip(" .")
        reminder = Reminder(
            id=str(uuid4()), person_id=payload.person_id, interaction_id=payload.interaction_id,
            action=action or text, due_at=due, status="upcoming",
            notes="Created by post-chat voice action.",
        )
        db.add(reminder)
        db.commit()
        db.refresh(reminder)
        return BrainDumpActionOut(
            message=f"I'll remind you {due.strftime('%A, %B %-d')}.", reminder=reminder,
        )
    return BrainDumpActionOut(message="Try asking me to set a reminder or who you should talk to next.")


@router.get("/who-next", response_model=list[WhoNextOut])
def who_next(limit: int = Query(3, ge=1, le=5), db: Session = Depends(get_db)):
    people = {person.id: person for person in db.query(Person).all()}
    results: list[WhoNextOut] = []
    seen: set[str] = set()
    for rel in db.query(Relationship).filter(Relationship.type == "suggested_intro").all():
        source, target = people.get(rel.source_id), people.get(rel.target_id)
        if not source or not target or target.id in seen:
            continue
        seen.add(target.id)
        results.append(WhoNextOut(
            person_id=target.id, name=target.name,
            reason=f"{source.name} offered a path to {target.name}. {rel.evidence}".strip(),
            path=["You", source.name, target.name],
            suggested_action=f"Ask {source.name} for an introduction to {target.name}.",
        ))
    for reminder in db.query(Reminder).filter(Reminder.status != "completed").order_by(Reminder.due_at).all():
        person = people.get(reminder.person_id)
        if not person or person.id in seen:
            continue
        seen.add(person.id)
        results.append(WhoNextOut(
            person_id=person.id, name=person.name,
            reason=f"You have an outstanding follow-up: {reminder.action}",
            path=["You", person.name], suggested_action=reminder.action,
        ))
    if len(results) < limit:
        goal = db.query(Goal).order_by(Goal.created_at.desc()).first()
        for person in people.values():
            if person.id in seen:
                continue
            results.append(WhoNextOut(
                person_id=person.id, name=person.name,
                reason=f"Reconnect based on your goal: {goal.text}" if goal else "Keep this relationship warm.",
                path=["You", person.name], suggested_action=f"Check in with {person.name}.",
            ))
            if len(results) >= limit:
                break
    return results[:limit]


def _heuristic_extract(person: Person, transcript: str, db: Session) -> BrainDumpExtraction:
    text = re.sub(r"\s+", " ", transcript).strip()
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    cards: list[BrainDumpCard] = []
    intros = _extract_intros(person, text, db)
    for sentence in sentences:
        lower = sentence.casefold()
        if any(word in lower for word in ("working on", "used to", "intern", "told me")):
            cards.append(BrainDumpCard(category="new_information", text=sentence))
        if any(word in lower for word in ("working on", "building", "project")):
            cards.append(BrainDumpCard(category="current_projects", text=sentence))
        if any(word in lower for word in ("intern", "job", "career", "role at", "works at", "works on")):
            cards.append(BrainDumpCard(category="career_info", text=sentence))
        if any(word in lower for word in ("talked about", "interested in", "working on")):
            cards.append(BrainDumpCard(category="topics", text=sentence))
        if "should" in lower and ("talk" in lower or "meet" in lower):
            cards.append(BrainDumpCard(category="advice", text=sentence))
        if any(word in lower for word in ("friend", "connection", "opportunity", "resource")):
            cards.append(BrainDumpCard(category="opportunities", text=sentence))
        if any(word in lower for word in ("resource", "article", "book", "link", "paper")):
            cards.append(BrainDumpCard(category="resources", text=sentence))
        if any(word in lower for word in ("company", "startup", "university", "club", " at anthropic", " at nvidia")):
            cards.append(BrainDumpCard(category="organizations", text=sentence))
        if any(word in lower for word in ("she promised", "he promised", "they promised", "she will", "he will", "they will")):
            cards.append(BrainDumpCard(category="promises_they_made", text=sentence))
        if any(word in lower for word in ("send her", "send him", "i promised", "remind me", "told her i", "told him i")):
            cards.append(BrainDumpCard(category="commitments", text=sentence))
            cards.append(BrainDumpCard(category="follow_ups", text=sentence))
        if re.search(r"\b(next week|tomorrow|tuesday|wednesday|thursday|friday|in \d+ weeks?|september|october)\b", lower):
            cards.append(BrainDumpCard(category="dates", text=sentence))
    for intro in intros:
        cards.append(BrainDumpCard(category="recommended_people", text=intro.context))
        cards.append(BrainDumpCard(category="next_conversation", text=f"Ask {person.name} for an introduction to {intro.name}."))
    if not cards:
        cards.append(BrainDumpCard(category="new_information", text=text))
    return BrainDumpExtraction(cards=_dedupe(cards), introductions=intros, spoken_summary=_summary(person.name, cards, intros), provider="heuristic")


def _extract_intros(person: Person, text: str, db: Session) -> list[SuggestedIntroduction]:
    patterns = [
        r"(?:friend|connection|colleague)\s+([A-Z][a-z]+)(?:,\s*who\s+works\s+(?:on|at)\s+([^.,]+))?",
        r"(?:meet|talk to|reach out to)\s+([A-Z][a-z]+)(?:\s+from\s+([A-Z][\w ]+))?",
    ]
    found: list[SuggestedIntroduction] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            name = match.group(1).strip()
            if name.casefold() == person.name.split()[0].casefold() or any(x.name.casefold() == name.casefold() for x in found):
                continue
            existing = _find_person(db, name)
            affiliation = (match.group(2) or "").strip()
            if not affiliation:
                nearby = re.search(
                    rf"\b{re.escape(name)}\b[^.]*\.\s*(?:He|She|They)\s+works?\s+[^.]*?\bat\s+([A-Z][\w&.-]+)",
                    text,
                )
                affiliation = nearby.group(1).strip(" .,!?:;") if nearby else ""
            found.append(SuggestedIntroduction(
                name=name, affiliation=affiliation,
                context=f"{person.name} recommended introduction to {name}{f' at {affiliation}' if affiliation else ''}.",
                existing_person_id=existing.id if existing else None,
            ))
    return found


def _create_reminders(db: Session, person_id: str, interaction_id: str, cards: list[BrainDumpCard], happened_at: datetime) -> list[Reminder]:
    rows: list[Reminder] = []
    seen: set[str] = set()
    for card in cards:
        if card.category not in {"commitments", "follow_ups", "next_conversation"}:
            continue
        key = card.text.casefold().strip()
        if key in seen:
            continue
        seen.add(key)
        due = happened_at + timedelta(days=7 if "next week" in card.text.casefold() else 14 if "2 weeks" in card.text.casefold() else 3)
        row = Reminder(id=str(uuid4()), person_id=person_id, interaction_id=interaction_id, action=card.text, due_at=due, status="upcoming", notes="Created from coffee chat brain dump.")
        db.add(row)
        rows.append(row)
    return rows


def _natural_due(text: str, now: datetime) -> datetime:
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for index, name in enumerate(weekdays):
        if name in text:
            days = (index - now.weekday()) % 7 or 7
            return (now + timedelta(days=days)).replace(hour=9, minute=0, second=0, microsecond=0)
    match = re.search(r"in (\d+) (day|week)s?", text)
    if match:
        amount = int(match.group(1)) * (7 if match.group(2) == "week" else 1)
        return now + timedelta(days=amount)
    return now + timedelta(days=1)


def _find_person(db: Session, name: str) -> Person | None:
    wanted = name.casefold().strip()
    return next((person for person in db.query(Person).all() if person.name.casefold().strip() == wanted or person.name.split()[0].casefold() == wanted), None)


def _dedupe(cards: list[BrainDumpCard]) -> list[BrainDumpCard]:
    seen: set[tuple[str, str]] = set()
    return [card for card in cards if not ((card.category, card.text.casefold()) in seen or seen.add((card.category, card.text.casefold())))]


def _summary(person_name: str, cards: list[BrainDumpCard], intros: list[SuggestedIntroduction]) -> str:
    commitments = [card.text for card in cards if card.category in {"commitments", "follow_ups"}]
    lead = f"The biggest opportunity is {person_name}'s connection to {intros[0].name}." if intros else f"Got it. I structured your conversation with {person_name}."
    return f"{lead} I've also noted: {commitments[0]} Do you want me to remind you?" if commitments else lead


def _openai_extract(person: Person, transcript: str, db: Session) -> BrainDumpExtraction:
    instructions = """Extract a coffee chat transcript as strict JSON with keys cards, introductions, spoken_summary.
cards is an array of {category,text,selected}; categories: new_information, topics, personal_details, advice,
opportunities, recommended_people, commitments, promises_they_made, follow_ups, next_conversation,
dates, current_projects, career_info, organizations, resources.
introductions is an array of {name,affiliation,context}. Never invent people.
spoken_summary is read aloud. Write it as conversational plain prose with no Markdown, HTML, asterisks,
underscores, backticks, headings, bullets, numbered lists, or visual emphasis."""
    raw = parse_json_object(call_terra(instructions, transcript))
    cards = [BrainDumpCard(**card) for card in raw.get("cards", []) if card.get("category") in CATEGORIES]
    intros = []
    for item in raw.get("introductions", []):
        existing = _find_person(db, item["name"])
        intros.append(SuggestedIntroduction(**item, existing_person_id=existing.id if existing else None))
    return BrainDumpExtraction(cards=cards, introductions=intros, spoken_summary=raw.get("spoken_summary") or _summary(person.name, cards, intros), provider="openai")
