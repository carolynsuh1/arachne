"""Goal-conditioned recommendation ranking and before/after snapshots."""

from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models import Person, RecommendationSnapshot, Relationship
from .goal_relevance import score_person_for_goal
from .relationship_scoring import clamp


def rank_people_for_goal(
    db: Session,
    goal_id: str,
    person_ids: list[str] | None = None,
    include_deltas: bool = True,
) -> list[dict]:
    people = db.query(Person).order_by(Person.name).all()
    if person_ids is not None:
        wanted = set(person_ids)
        people = [person for person in people if person.id in wanted]

    ranked = []
    for person in people:
        relevance = score_person_for_goal(db, person.id, goal_id)
        effective_score = clamp(
            0.60 * relevance["goal_relevance"]
            + 0.25 * relevance["intro_probability"]
            + 0.15 * relevance["relationship_strength"]
        )
        ranked.append(
            {
                **relevance,
                "id": person.id,
                "name": person.name,
                "kind": "person",
                "score": round(effective_score, 3),
                "why": ". ".join(relevance["explanation"]).rstrip(".") + ".",
                "next_action": _next_action(db, person, relevance),
            }
        )
    ranked.sort(key=lambda item: (-item["score"], item["name"].casefold()))
    for index, item in enumerate(ranked, 1):
        item["rank"] = index
        item.update(
            _snapshot_delta(db, goal_id, item["person_id"])
            if include_deltas
            else {
                "previous_score": None,
                "previous_rank": None,
                "score_delta": None,
                "rank_delta": None,
                "change_reason": None,
            }
        )
    return ranked


def save_ranking_snapshot(
    db: Session,
    goal_id: str,
    batch_id: str,
    source_type: str,
    source_id: str,
    person_ids: list[str] | None = None,
    now: datetime | None = None,
) -> list[dict]:
    ranked = rank_people_for_goal(
        db, goal_id, person_ids=person_ids, include_deltas=False
    )
    created_at = now or datetime.utcnow()
    for item in ranked:
        db.add(
            RecommendationSnapshot(
                id=str(uuid4()),
                batch_id=batch_id,
                goal_id=goal_id,
                person_id=item["person_id"],
                score=item["score"],
                rank=item["rank"],
                reasons_json=json.dumps(item["explanation"]),
                next_action=item["next_action"],
                source_type=source_type,
                source_id=source_id,
                created_at=created_at,
            )
        )
    db.flush()
    return ranked


def _snapshot_delta(db: Session, goal_id: str, person_id: str) -> dict:
    rows = (
        db.query(RecommendationSnapshot)
        .filter(
            RecommendationSnapshot.goal_id == goal_id,
            RecommendationSnapshot.person_id == person_id,
        )
        .order_by(
            RecommendationSnapshot.created_at.desc(),
            RecommendationSnapshot.id.desc(),
        )
        .limit(2)
        .all()
    )
    if not rows:
        return {
            "previous_score": None,
            "previous_rank": None,
            "score_delta": None,
            "rank_delta": None,
            "change_reason": None,
        }
    latest = rows[0]
    previous = rows[1] if len(rows) > 1 else None
    if previous is None:
        return {
            "previous_score": None,
            "previous_rank": None,
            "score_delta": None,
            "rank_delta": None,
            "change_reason": None,
        }
    score_delta = round(latest.score - previous.score, 3)
    rank_delta = previous.rank - latest.rank
    change_reason = None
    if rank_delta > 0:
        label = latest.source_type.replace("_", " ") or "new evidence"
        change_reason = (
            f"Moved to #{latest.rank} after {label} {latest.source_id} "
            "changed reachability or goal evidence."
        )
    elif score_delta:
        change_reason = (
            f"Score changed by {score_delta:+.2f} after "
            f"{latest.source_type.replace('_', ' ') or 'new evidence'}."
        )
    return {
        "previous_score": previous.score,
        "previous_rank": previous.rank,
        "score_delta": score_delta,
        "rank_delta": rank_delta,
        "change_reason": change_reason,
    }


def _next_action(db: Session, person: Person, relevance: dict) -> str:
    relationship_id = relevance.get("path_relationship_id")
    relationship = db.get(Relationship, relationship_id) if relationship_id else None
    if relationship and relationship.type in {"suggested_intro", "offered_intro"}:
        source = db.get(Person, relationship.source_id)
        if source and source.id != person.id:
            return f"Ask {source.name} for the {person.name} introduction."
    if relevance["relationship_strength"] >= 0.55:
        return f"Send {person.name} a focused follow-up tied to the current goal."
    return f"Ask {person.name} for a 15-minute conversation about the current goal."
