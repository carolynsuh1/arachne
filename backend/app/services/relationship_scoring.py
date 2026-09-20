"""Deterministic, evidence-backed temporal relationship scoring."""

from __future__ import annotations

import math
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import (
    BrainDumpItem,
    GraphEvidence,
    InteractionMemory,
    Relationship,
    Reminder,
)

DECAY_DAYS = 45.0


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def recency_score(last_interaction_at: datetime | None, now: datetime | None = None) -> float:
    """Exponential decay with a documented 45-day time constant."""
    if last_interaction_at is None:
        return 0.0
    current = now or datetime.utcnow()
    if current.tzinfo is not None and last_interaction_at.tzinfo is None:
        current = current.replace(tzinfo=None)
    elif current.tzinfo is None and last_interaction_at.tzinfo is not None:
        last_interaction_at = last_interaction_at.replace(tzinfo=None)
    days = max(0.0, (current - last_interaction_at).total_seconds() / 86400)
    return math.exp(-days / DECAY_DAYS)


def score_relationship(
    db: Session,
    relationship: Relationship,
    now: datetime | None = None,
    persist: bool = False,
) -> dict:
    person_ids = {
        entity_id
        for entity_type, entity_id in (
            (relationship.source_type, relationship.source_id),
            (relationship.target_type, relationship.target_id),
        )
        if entity_type == "person"
    }
    metrics = _score_signals(
        db,
        person_ids=person_ids,
        evidence_entity_ids={relationship.id},
        prior_strength=relationship.strength or 0.0,
        relationship_type=relationship.type,
        now=now,
    )
    if persist:
        relationship.relationship_strength = metrics["relationship_strength"]
        relationship.confidence = metrics["confidence"]
        relationship.last_interaction_at = metrics["last_interaction_at"]
        relationship.interaction_count = metrics["interaction_count"]
        relationship.intro_probability = metrics["intro_probability"]
        relationship.updated_at = now or datetime.utcnow()
    return metrics


def score_person_connection(
    db: Session,
    person_id: str,
    now: datetime | None = None,
) -> dict:
    related = [
        row
        for row in db.query(Relationship).all()
        if (
            row.source_type == "person"
            and row.source_id == person_id
            or row.target_type == "person"
            and row.target_id == person_id
        )
    ]
    strongest = max(
        related,
        key=lambda row: (
            row.intro_probability or 0.0,
            row.relationship_strength or row.strength or 0.0,
        ),
        default=None,
    )
    evidence_ids = {row.id for row in related}
    path_person_ids = {person_id}
    if strongest:
        if strongest.source_type == "person":
            path_person_ids.add(strongest.source_id)
        if strongest.target_type == "person":
            path_person_ids.add(strongest.target_id)
    metrics = _score_signals(
        db,
        person_ids=path_person_ids,
        evidence_entity_ids=evidence_ids,
        prior_strength=(
            strongest.relationship_strength or strongest.strength
            if strongest
            else 0.0
        ),
        relationship_type=strongest.type if strongest else "",
        now=now,
    )
    metrics["path_relationship_id"] = strongest.id if strongest else None
    return metrics


def recompute_relationships(
    db: Session, relationship_ids: set[str] | None = None, now: datetime | None = None
) -> list[dict]:
    rows = db.query(Relationship).all()
    if relationship_ids is not None:
        rows = [row for row in rows if row.id in relationship_ids]
    results = [score_relationship(db, row, now=now, persist=True) for row in rows]
    return results


def _score_signals(
    db: Session,
    person_ids: set[str],
    evidence_entity_ids: set[str],
    prior_strength: float,
    relationship_type: str,
    now: datetime | None,
) -> dict:
    memories = (
        db.query(InteractionMemory)
        .filter(InteractionMemory.person_id.in_(person_ids))
        .order_by(InteractionMemory.happened_at.desc())
        .all()
        if person_ids
        else []
    )
    interaction_count = len(memories)
    last_interaction = memories[0].happened_at if memories else None
    freshness = recency_score(last_interaction, now)
    interaction_signal = 1.0 - math.exp(-interaction_count / 3.0)

    commitments = (
        db.query(BrainDumpItem)
        .filter(
            BrainDumpItem.person_id.in_(person_ids),
            BrainDumpItem.category.in_(
                ["commitments", "follow_ups", "promises_they_made", "next_conversation"]
            ),
        )
        .all()
        if person_ids
        else []
    )
    reminders = (
        db.query(Reminder).filter(Reminder.person_id.in_(person_ids)).all()
        if person_ids
        else []
    )
    commitment_count = len(commitments) + len(reminders)
    commitment_signal = 1.0 - math.exp(-commitment_count / 2.0)

    evidence = [
        item
        for item in db.query(GraphEvidence)
        .order_by(GraphEvidence.created_at.desc())
        .all()
        if (
            item.entity_type == "relationship"
            and item.entity_id in evidence_entity_ids
        )
        or (item.entity_type == "person" and item.entity_id in person_ids)
    ]
    support_count = len(evidence) + len(memories)
    support_signal = min(1.0, support_count / 4.0)
    source_types = {item.evidence_type for item in evidence}
    if memories:
        source_types.add("interaction")
    diversity_signal = min(1.0, len(source_types) / 3.0)
    event_types = {item.event_type for item in evidence}
    explicit_offer = "offered_intro" in event_types or relationship_type in {
        "introduced_by",
        "offered_intro",
    }
    recommendation = "suggested_intro" in event_types or relationship_type == "suggested_intro"

    strength = clamp(
        0.35 * clamp(prior_strength)
        + 0.25 * interaction_signal
        + 0.20 * freshness
        + 0.10 * commitment_signal
        + 0.10 * support_signal
    )
    confidence = clamp(
        0.15
        + 0.15 * interaction_signal
        + 0.20 * support_signal
        + 0.25 * diversity_signal
        + 0.25 * (1.0 if explicit_offer else 0.6 if recommendation else 0.0)
    )
    intro_probability = clamp(
        (0.50 if explicit_offer else 0.30 if recommendation else 0.0)
        + 0.30 * strength
        + 0.10 * commitment_signal
        + 0.10 * freshness
    )

    strength_reasons = [f"{interaction_count} recorded interaction{'s' if interaction_count != 1 else ''}"]
    if last_interaction:
        days = max(
            0,
            int(((now or datetime.utcnow()) - last_interaction).total_seconds() / 86400),
        )
        strength_reasons.append(f"last interaction was {days} day{'s' if days != 1 else ''} ago")
    if commitment_count:
        strength_reasons.append(
            f"{commitment_count} explicit follow-up commitment{'s' if commitment_count != 1 else ''}"
        )
    if support_count:
        strength_reasons.append(f"{support_count} supporting evidence item{'s' if support_count != 1 else ''}")

    intro_reasons = []
    if explicit_offer:
        intro_reasons.append("an explicit introduction offer is recorded")
    elif recommendation:
        intro_reasons.append("a direct introduction suggestion is recorded")
    if strength >= 0.6:
        intro_reasons.append("relationship strength is high")
    if commitment_count:
        intro_reasons.append("a follow-up commitment makes the path actionable")

    return {
        "relationship_strength": round(strength, 3),
        "confidence": round(confidence, 3),
        "intro_probability": round(intro_probability, 3),
        "last_interaction_at": last_interaction,
        "last_interaction_days": (
            max(0, int(((now or datetime.utcnow()) - last_interaction).total_seconds() / 86400))
            if last_interaction
            else None
        ),
        "interaction_count": interaction_count,
        "explanation": {
            "relationship_strength": strength_reasons,
            "confidence": [
                f"{support_count} evidence item{'s' if support_count != 1 else ''}",
                f"{len(source_types)} evidence source type{'s' if len(source_types) != 1 else ''}",
            ],
            "intro_probability": intro_reasons or ["no explicit introduction evidence is recorded"],
        },
        "evidence": [
            {
                "type": item.evidence_type,
                "id": item.evidence_id,
                "event_type": item.event_type,
                "excerpt": item.excerpt,
            }
            for item in evidence
        ]
        + [
            {
                "type": "interaction",
                "id": memory.id,
                "event_type": "interaction",
                "excerpt": memory.transcript[:500],
            }
            for memory in memories
        ],
    }
