"""Convert confirmed human observations into auditable graph state transitions."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy.orm import Session

from ..models import (
    GraphEvidence,
    GraphMutation,
    Person,
    Relationship,
    Reminder,
)
from .recommendations import save_ranking_snapshot
from .relationship_scoring import recompute_relationships

OPERATIONS = {
    "ADD_NODE",
    "ADD_EDGE",
    "UPDATE_EDGE",
    "UPDATE_PERSON_CONTEXT",
    "ADD_EVIDENCE",
    "ADD_COMMITMENT",
}


def apply_confirmed_observation(
    db: Session,
    *,
    source_person_id: str,
    transcript: str,
    cards: list[dict],
    introductions: list[dict],
    provenance_type: str,
    provenance_id: str,
    interaction_id: str,
    goal_id: str | None = None,
    happened_at: datetime | None = None,
) -> dict:
    source = db.get(Person, source_person_id)
    if source is None:
        raise ValueError("Source person not found.")
    batch_id = f"{provenance_type}:{provenance_id}:{source_person_id}"
    existing = (
        db.query(GraphMutation).filter(GraphMutation.batch_id == batch_id).all()
    )
    if existing:
        return {
            "batch_id": batch_id,
            "mutations": [_mutation_dict(row) for row in existing],
            "affected_relationship_ids": sorted(
                {
                    row.entity_id
                    for row in existing
                    if row.entity_type == "relationship"
                }
            ),
            "recommendations": [],
            "idempotent": True,
        }

    if goal_id:
        save_ranking_snapshot(
            db,
            goal_id,
            f"{batch_id}:before",
            "before_mutation",
            provenance_id,
        )

    mutations: list[GraphMutation] = []
    affected_relationship_ids: set[str] = set()
    created_people: list[str] = []
    now = happened_at or datetime.utcnow()

    interaction_evidence = _add_evidence(
        db,
        entity_type="person",
        entity_id=source.id,
        evidence_type=provenance_type,
        evidence_id=provenance_id,
        event_type="interaction",
        excerpt=transcript,
        confidence=1.0,
        created_at=now,
    )
    mutations.append(
        _record_mutation(
            db,
            batch_id,
            "ADD_EVIDENCE",
            "person",
            source.id,
            provenance_type,
            provenance_id,
            {"evidence_id": interaction_evidence.id},
        )
    )

    for topic in _negated_topics(transcript):
        previous = {"bio": source.bio, "interests": source.interests}
        source.interests = json.dumps(
            [
                item
                for item in _json_list(source.interests)
                if topic.casefold() not in item.casefold()
            ]
        )
        source.bio = " ".join(
            sentence
            for sentence in re.split(r"(?<=[.!?])\s+", source.bio or "")
            if topic.casefold() not in sentence.casefold()
        ).strip()
        context_evidence = _add_evidence(
            db,
            entity_type="person",
            entity_id=source.id,
            evidence_type=provenance_type,
            evidence_id=provenance_id,
            event_type="context_superseded",
            excerpt=_sentence_containing(transcript, topic),
            confidence=0.9,
            metadata={"topic": topic, "previous": previous},
            created_at=now,
        )
        mutations.append(
            _record_mutation(
                db,
                batch_id,
                "UPDATE_PERSON_CONTEXT",
                "person",
                source.id,
                provenance_type,
                provenance_id,
                {"topic": topic, "evidence_id": context_evidence.id},
            )
        )

    for intro in introductions:
        name = str(intro.get("name", "")).strip()
        if not name:
            continue
        target = _find_person(db, intro.get("existing_person_id"), name)
        if target is None:
            affiliation = str(intro.get("affiliation", "")).strip()
            target = Person(
                id=f"suggested-{uuid5(NAMESPACE_URL, batch_id + ':' + name).hex[:12]}",
                name=name,
                bio=f"Suggested connection. {affiliation}".strip(),
                interests=json.dumps(
                    _context_interests(transcript, name, affiliation)
                ),
                skills="[]",
            )
            db.add(target)
            db.flush()
            created_people.append(target.name)
            mutations.append(
                _record_mutation(
                    db,
                    batch_id,
                    "ADD_NODE",
                    "person",
                    target.id,
                    provenance_type,
                    provenance_id,
                    {"name": target.name},
                )
            )

        explicit_offer = _has_explicit_offer(transcript, name)
        relation_id = f"intro-{source.id}-{target.id}"
        relationship = db.get(Relationship, relation_id)
        operation = "UPDATE_EDGE" if relationship else "ADD_EDGE"
        if relationship is None:
            relationship = Relationship(
                id=relation_id,
                source_type="person",
                source_id=source.id,
                target_type="person",
                target_id=target.id,
                type="offered_intro" if explicit_offer else "suggested_intro",
                strength=0.8 if explicit_offer else 0.65,
                relationship_strength=0.8 if explicit_offer else 0.65,
                confidence=0.8 if explicit_offer else 0.6,
                intro_probability=0.85 if explicit_offer else 0.6,
                evidence=str(intro.get("context", "")).strip(),
                created_at=now,
                updated_at=now,
            )
            db.add(relationship)
        else:
            if explicit_offer:
                relationship.type = "offered_intro"
                relationship.strength = max(relationship.strength, 0.8)
                relationship.intro_probability = max(
                    relationship.intro_probability or 0.0, 0.85
                )
            relationship.updated_at = now
        affected_relationship_ids.add(relationship.id)
        excerpt = _sentence_containing(transcript, name) or str(
            intro.get("context", "")
        )
        evidence = _add_evidence(
            db,
            entity_type="relationship",
            entity_id=relationship.id,
            evidence_type=provenance_type,
            evidence_id=provenance_id,
            event_type="offered_intro" if explicit_offer else "suggested_intro",
            excerpt=excerpt,
            confidence=0.95 if explicit_offer else 0.8,
            created_at=now,
        )
        mutations.append(
            _record_mutation(
                db,
                batch_id,
                operation,
                "relationship",
                relationship.id,
                provenance_type,
                provenance_id,
                {
                    "target_person_id": target.id,
                    "event_type": evidence.event_type,
                    "evidence_id": evidence.id,
                },
            )
        )

    commitments = [
        str(card.get("text", "")).strip()
        for card in cards
        if card.get("category") in {"commitments", "follow_ups", "next_conversation"}
        and str(card.get("text", "")).strip()
    ]
    commitments.extend(_implicit_followups(transcript))
    for action in dict.fromkeys(commitments):
        reminder = (
            db.query(Reminder)
            .filter(
                Reminder.interaction_id == interaction_id,
                Reminder.action == action,
            )
            .first()
        )
        if reminder is None:
            reminder = Reminder(
                id=str(uuid4()),
                person_id=source.id,
                interaction_id=interaction_id,
                action=action,
                due_at=_due_at(action, now),
                status="upcoming",
                notes=f"Created from confirmed {provenance_type} graph mutation.",
            )
            db.add(reminder)
            db.flush()
        mutations.append(
            _record_mutation(
                db,
                batch_id,
                "ADD_COMMITMENT",
                "reminder",
                reminder.id,
                provenance_type,
                provenance_id,
                {"action": action, "due_at": reminder.due_at.isoformat() if reminder.due_at else None},
            )
        )

    recompute_relationships(db, affected_relationship_ids, now=now)
    recommendations = []
    if goal_id:
        recommendations = save_ranking_snapshot(
            db,
            goal_id,
            batch_id,
            f"after_{provenance_type}",
            provenance_id,
        )
    return {
        "batch_id": batch_id,
        "mutations": [_mutation_dict(row) for row in mutations],
        "affected_relationship_ids": sorted(affected_relationship_ids),
        "created_people": created_people,
        "recommendations": recommendations,
        "idempotent": False,
    }


def _record_mutation(
    db: Session,
    batch_id: str,
    operation: str,
    entity_type: str,
    entity_id: str,
    provenance_type: str,
    provenance_id: str,
    payload: dict,
) -> GraphMutation:
    if operation not in OPERATIONS:
        raise ValueError(f"Unknown mutation operation: {operation}")
    key = f"{batch_id}:{operation}:{entity_type}:{entity_id}:{json.dumps(payload, sort_keys=True)}"
    row = GraphMutation(
        id=str(uuid5(NAMESPACE_URL, key)),
        batch_id=batch_id,
        operation=operation,
        entity_type=entity_type,
        entity_id=entity_id,
        provenance_type=provenance_type,
        provenance_id=provenance_id,
        payload_json=json.dumps(payload, sort_keys=True),
    )
    db.add(row)
    db.flush()
    return row


def _add_evidence(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    evidence_type: str,
    evidence_id: str,
    event_type: str,
    excerpt: str,
    confidence: float,
    metadata: dict | None = None,
    created_at: datetime,
) -> GraphEvidence:
    key = f"{entity_type}:{entity_id}:{evidence_type}:{evidence_id}:{event_type}"
    evidence = GraphEvidence(
        id=str(uuid5(NAMESPACE_URL, key)),
        entity_type=entity_type,
        entity_id=entity_id,
        evidence_type=evidence_type,
        evidence_id=evidence_id,
        event_type=event_type,
        excerpt=excerpt.strip()[:2000],
        confidence=confidence,
        metadata_json=json.dumps(metadata or {}, sort_keys=True),
        created_at=created_at,
    )
    db.add(evidence)
    db.flush()
    return evidence


def _find_person(db: Session, person_id, name: str) -> Person | None:
    if person_id:
        row = db.get(Person, str(person_id))
        if row:
            return row
    wanted = name.casefold()
    return next(
        (
            row
            for row in db.query(Person).all()
            if row.name.casefold() == wanted
            or row.name.split()[0].casefold() == wanted
        ),
        None,
    )


def _negated_topics(transcript: str) -> list[str]:
    matches = re.findall(
        r"\bnot\s+(?:doing|working on|working in|in)\s+([a-z][a-z0-9 -]{1,40}?)(?:\s+anymore|[,.])",
        transcript.casefold(),
    )
    return list(dict.fromkeys(item.strip() for item in matches if item.strip()))


def _context_interests(transcript: str, name: str, affiliation: str) -> list[str]:
    sentence = _sentence_containing(transcript, name)
    candidates = []
    match = re.search(
        rf"\b{re.escape(name)}\b[^.]*?(?:works on|working on|researches)\s+([^.,;]+)",
        sentence,
        re.I,
    )
    if match:
        candidates.append(match.group(1).strip(" -—"))
    if affiliation:
        candidates.append(affiliation)
    return list(dict.fromkeys(candidates))


def _has_explicit_offer(transcript: str, name: str) -> bool:
    return bool(
        re.search(
            rf"(?:I\s+can|I(?:'|’)ll|happy to|offered to)\s+introduce[^.]*\b{re.escape(name)}\b|"
            rf"\b{re.escape(name)}\b[^.]*\b(?:I\s+can|I(?:'|’)ll)\s+introduce",
            transcript,
            re.I,
        )
        or (
            re.search(r"\bI\s+can\s+introduce\s+you\b", transcript, re.I)
            and re.search(rf"\b{re.escape(name)}\b", transcript, re.I)
        )
    )


def _implicit_followups(transcript: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", transcript.strip())
    return [
        sentence.strip()
        for sentence in sentences
        if re.search(
            r"\b(?:send me|email me|message me|follow up|reach out)\b",
            sentence,
            re.I,
        )
        and re.search(
            r"\b(?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)\b",
            sentence,
            re.I,
        )
    ]


def _due_at(text: str, now: datetime) -> datetime | None:
    lower = text.casefold()
    if "tomorrow" in lower:
        return now + timedelta(days=1)
    if "next week" in lower:
        return now + timedelta(days=7)
    return None


def _sentence_containing(text: str, term: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return next(
        (sentence.strip() for sentence in sentences if term.casefold() in sentence.casefold()),
        "",
    )


def _json_list(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _mutation_dict(row: GraphMutation) -> dict:
    return {
        "id": row.id,
        "operation": row.operation,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "provenance_type": row.provenance_type,
        "provenance_id": row.provenance_id,
        "payload": json.loads(row.payload_json or "{}"),
        "created_at": row.created_at,
    }
