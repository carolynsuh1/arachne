"""Prioritize saved follow-ups without inventing commitments or deadlines."""
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import FollowUpState, InteractionMemory, Person, Reminder

router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])


@router.get("")
def list_followups(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    people = {p.id: p.name for p in db.query(Person).all()}
    states = {s.reminder_id: s for s in db.query(FollowUpState).all()}
    memories = {m.id: m for m in db.query(InteractionMemory).all()}
    result = []
    for reminder in db.query(Reminder).all():
        state = states.get(reminder.id)
        outcome = state.outcome if state else "active"
        if reminder.status in {"completed", "dismissed"}:
            outcome = "done" if reminder.status == "completed" else "dismissed"
        snoozed = bool(outcome == "active" and state and state.snoozed_until and state.snoozed_until > now)
        # Existing extraction sometimes assigns default dates; show them as saved
        # reminders, never claim they were explicitly promised in the conversation.
        overdue = bool(reminder.due_at and reminder.due_at < now)
        priority = 0 if overdue else 1 if reminder.due_at else 2
        memory = memories.get(reminder.interaction_id)
        if memory and memory.person_id != reminder.person_id:
            memory = None
        result.append({
            "id": reminder.id, "person_id": reminder.person_id,
            "person": people.get(reminder.person_id, "Unknown person"),
            "action": reminder.action, "due_at": reminder.due_at,
            "created_at": reminder.created_at, "outcome": outcome,
            "snoozed_until": state.snoozed_until if state else None,
            "bucket": outcome if outcome != "active" else "snoozed" if snoozed else "active",
            "priority": priority,
            "why": "Saved reminder is overdue" if overdue else "Saved reminder has a date" if reminder.due_at else "Open follow-up without a deadline",
            "source": {"date": memory.happened_at, "transcript": memory.transcript} if memory else None,
        })
    result.sort(key=lambda r: (r["priority"], r["due_at"] or datetime.max, r["created_at"], r["id"]))
    return result


class FollowUpAction(BaseModel):
    action: Literal["done", "dismiss", "snooze", "restore"]
    days: Literal[1, 3, 7] = 1


@router.patch("/{reminder_id}")
def update_followup(reminder_id: str, payload: FollowUpAction, db: Session = Depends(get_db)):
    reminder = db.get(Reminder, reminder_id)
    if not reminder:
        raise HTTPException(404, "Follow-up not found")
    state = db.get(FollowUpState, reminder_id)
    if not state:
        state = FollowUpState(reminder_id=reminder_id)
        db.add(state)
    state.updated_at = datetime.utcnow()
    state.outcome = {"done": "done", "dismiss": "dismissed"}.get(payload.action, "active")
    state.snoozed_until = state.updated_at + timedelta(days=payload.days) if payload.action == "snooze" else None
    # Keep existing reminder consumers from recommending finished actions.
    reminder.status = "completed" if payload.action == "done" else "dismissed" if payload.action == "dismiss" else "upcoming"
    db.commit()
    return {"ok": True}
