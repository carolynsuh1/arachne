"""Dynamic, deterministic person relevance for a selected goal."""

from __future__ import annotations

import json
import re
from collections import defaultdict

from sqlalchemy.orm import Session

from ..models import Goal, GoalPlan, Organization, Person, Relationship, ResearchBrief
from .relationship_scoring import clamp, score_person_connection

STOP_WORDS = {
    "a", "an", "and", "are", "at", "be", "can", "for", "from", "get", "help",
    "in", "into", "is", "of", "on", "or", "the", "this", "to", "want", "with",
}
ALIASES = {
    "embodied": {"robotics", "robot", "manipulation"},
    "robotics": {"robot", "embodied", "manipulation"},
    "research": {"lab", "researcher", "faculty", "phd"},
    "faculty": {"professor", "advisor", "researcher"},
    "student": {"undergrad", "graduate", "phd"},
    "ai": {"machine", "learning", "ml"},
}


def score_person_for_goal(db: Session, person_id: str, goal_id: str) -> dict:
    person = db.get(Person, person_id)
    goal = db.get(Goal, goal_id)
    if person is None or goal is None:
        raise ValueError("Person or goal not found.")
    plan = db.get(GoalPlan, goal_id)

    organizations = _person_organizations(db, person_id)
    brief = (
        db.query(ResearchBrief)
        .filter(ResearchBrief.person_id == person_id)
        .order_by(ResearchBrief.created_at.desc())
        .first()
    )
    research_text = brief.result_json if brief else ""
    document_sections = {
        "bio": person.bio or "",
        "interests": " ".join(_json_list(person.interests)),
        "skills": " ".join(_json_list(person.skills)),
        "organization": " ".join(
            f"{item.name} {item.type} {item.description}" for item in organizations
        ),
        "university": person.university or "",
        "research": research_text,
    }
    document = " ".join(document_sections.values()).casefold()

    goal_terms = _tokens(goal.text)
    plan_terms: set[str] = set()
    needed_items = []
    if plan:
        plan_terms |= _tokens(plan.summary)
        for item in json.loads(plan.subgoals_json or "[]"):
            plan_terms |= _tokens(f"{item.get('text', '')} {item.get('why', '')}")
        needed_items = json.loads(plan.needed_connections_json or "[]")
        for item in needed_items:
            plan_terms |= _tokens(
                f"{item.get('kind', '')} {item.get('query', '')} {item.get('why', '')}"
            )

    core_matches = sorted(term for term in goal_terms if term in document)
    context_matches = sorted(term for term in plan_terms - goal_terms if term in document)
    denominator = max(1.0, len(goal_terms) + 0.35 * len(plan_terms - goal_terms))
    domain_score = clamp(
        (len(core_matches) + 0.35 * len(context_matches)) / denominator
    )

    needed_matches: list[str] = []
    for item in needed_items:
        kind = str(item.get("kind", "")).strip()
        kind_terms = _tokens(kind)
        item_terms = kind_terms or _tokens(str(item.get("query", "")))
        if item_terms and any(term in document for term in item_terms):
            needed_matches.append(kind or str(item.get("query", "")).strip())
    needed_score = clamp(len(needed_matches) / max(1, len(needed_items)))

    connection = score_person_connection(db, person_id)
    reachability = clamp(
        0.6 * connection["intro_probability"]
        + 0.4 * connection["relationship_strength"]
    )
    relevance = clamp(0.65 * domain_score + 0.15 * needed_score + 0.20 * reachability)

    reasons = []
    if core_matches:
        reasons.append(f"{person.name} matches goal topics: {', '.join(core_matches[:4])}")
    if needed_matches:
        reasons.append(
            f"matches needed connection type: {', '.join(needed_matches[:2])}"
        )
    if connection["intro_probability"] >= 0.4:
        reasons.append("there is an actionable introduction path")
    elif connection["relationship_strength"] > 0:
        reasons.append("the existing network provides a reachable relationship path")
    if brief and any(term in research_text.casefold() for term in goal_terms):
        reasons.append("saved research contains goal-relevant evidence")
    if not reasons:
        reasons.append("no strong overlap with the current goal is recorded yet")

    return {
        "person_id": person_id,
        "goal_id": goal_id,
        "goal_relevance": round(relevance, 3),
        "domain_match": round(domain_score, 3),
        "needed_connection_match": round(needed_score, 3),
        "reachability": round(reachability, 3),
        "relationship_strength": connection["relationship_strength"],
        "confidence": connection["confidence"],
        "intro_probability": connection["intro_probability"],
        "last_interaction_at": connection["last_interaction_at"],
        "interaction_count": connection["interaction_count"],
        "score_explanation": connection["explanation"],
        "explanation": reasons,
        "matched_terms": (core_matches + context_matches)[:12],
        "path_relationship_id": connection["path_relationship_id"],
    }


def _tokens(value: str) -> set[str]:
    raw = {
        token
        for token in re.findall(r"[a-z0-9]+", value.casefold())
        if len(token) > 1 and token not in STOP_WORDS
    }
    expanded = set(raw)
    for token in raw:
        expanded.update(ALIASES.get(token, set()))
    return expanded


def _json_list(value: str) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _person_organizations(db: Session, person_id: str) -> list[Organization]:
    organizations = {row.id: row for row in db.query(Organization).all()}
    result: dict[str, Organization] = {}
    for rel in db.query(Relationship).all():
        org_id = None
        if (
            rel.source_type == "person"
            and rel.source_id == person_id
            and rel.target_type == "organization"
        ):
            org_id = rel.target_id
        elif (
            rel.target_type == "person"
            and rel.target_id == person_id
            and rel.source_type == "organization"
        ):
            org_id = rel.source_id
        if org_id in organizations:
            result[org_id] = organizations[org_id]
    return list(result.values())
