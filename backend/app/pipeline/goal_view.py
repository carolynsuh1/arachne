"""Step 3: create a different people graph for each saved goal."""

import json
import re
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..agents.knowledge_graph import _ring_positions
from ..models import GraphMutation, Goal, GoalPlan, Organization, Person, PersonProfile, Relationship
from ..schemas import GraphEdge, GraphEdgeData, GraphNode, GraphNodeData, GraphOut, RankedNode
from ..services.recommendations import rank_people_for_goal
from ..services.relationship_scoring import score_relationship

STOP_WORDS = {
    "a", "actually", "an", "and", "are", "at", "be", "can", "conversation",
    "find", "for", "from", "get", "group", "groups", "help", "i", "in", "into",
    "is", "know", "make", "next", "of", "on", "open", "or", "people", "person",
    "the", "this", "to", "want", "who", "with",
}
ROLE_ALIASES = {
    "faculty": {"professor", "advisor", "researcher"},
    "student": {"undergrad", "phd", "graduate"},
    "company": {"industry", "startup", "lab"},
    "robotics": {"robot", "robot learning", "reinforcement learning", "rl"},
    "research": {"researcher", "lab", "faculty", "phd"},
}


def build_goal_view(db: Session, goal_id: str, person_ids: list[str] | None = None) -> GraphOut | None:
    """Rank people against a goal.

    By default the best few matches across the whole network are returned. When `person_ids` is given
    (a user's own map inside the shared network), only those people are scored and all of them are
    returned, best first, including ones with no overlap yet.
    """
    goal = db.get(Goal, goal_id)
    if goal is None:
        return None
    plan = db.get(GoalPlan, goal_id)
    people = db.query(Person).order_by(Person.name).all()
    if person_ids is not None:
        wanted = set(person_ids)
        people = [person for person in people if person.id in wanted]
    organizations = {row.id: row for row in db.query(Organization).all()}
    profiles = {row.person_id: row for row in db.query(PersonProfile).all()}
    rels = db.query(Relationship).all()
    recent_mutations = (
        db.query(GraphMutation)
        .filter(GraphMutation.created_at >= datetime.utcnow() - timedelta(minutes=10))
        .all()
    )
    recent_relationship_ids = {
        item.entity_id
        for item in recent_mutations
        if item.entity_type == "relationship"
    }
    recent_person_ids = {
        item.entity_id for item in recent_mutations if item.entity_type == "person"
    }
    for rel in rels:
        if rel.id in recent_relationship_ids:
            if rel.source_type == "person":
                recent_person_ids.add(rel.source_id)
            if rel.target_type == "person":
                recent_person_ids.add(rel.target_id)

    affiliated: dict[str, list[Organization]] = defaultdict(list)
    for rel in rels:
        if rel.source_type == "person" and rel.target_type == "organization":
            org = organizations.get(rel.target_id)
            if org:
                affiliated[rel.source_id].append(org)
        elif rel.target_type == "person" and rel.source_type == "organization":
            org = organizations.get(rel.source_id)
            if org:
                affiliated[rel.target_id].append(org)

    ranking = rank_people_for_goal(
        db, goal_id, [person.id for person in people] if person_ids is not None else None
    )
    if person_ids is not None:
        selected = ranking
        fallback_why = "No overlap with this goal yet."
    else:
        positive = [item for item in ranking if item["score"] > 0]
        selected = (
            positive[:6]
            if len(positive) >= 3
            else ranking[: min(6, len(ranking))]
        )
        fallback_why = "Included as the closest available network match."
    positions = _ring_positions(len(selected))
    nodes: list[GraphNode] = []
    ranked: list[RankedNode] = []
    people_by_id = {person.id: person for person in people}

    for index, item in enumerate(selected):
        person = people_by_id[item["person_id"]]
        orgs = affiliated[person.id]
        companies = sorted({org.name for org in orgs if org.type == "company"})
        affiliations = sorted({org.name for org in orgs})
        location = profiles.get(person.id).location if profiles.get(person.id) else ""
        why = item["why"] if item["score"] > 0 else fallback_why
        nodes.append(
            GraphNode(
                id=f"person:{person.id}",
                type="person",
                position=positions[index],
                data=GraphNodeData(
                    kind="person",
                    name=person.name,
                    bio=person.bio,
                    interests=json.loads(person.interests or "[]"),
                    skills=json.loads(person.skills or "[]"),
                    relevant=True,
                    why=why,
                    score=item["score"],
                    goal_relevance=item["goal_relevance"],
                    relationship_strength=item["relationship_strength"],
                    confidence=item["confidence"],
                    intro_probability=item["intro_probability"],
                    last_interaction_at=item["last_interaction_at"],
                    interaction_count=item["interaction_count"],
                    rank=item["rank"],
                    previous_rank=item["previous_rank"],
                    score_delta=item["score_delta"],
                    rank_delta=item["rank_delta"],
                    change_reason=item["change_reason"],
                    next_action=item["next_action"],
                    score_explanation=item["score_explanation"],
                    recently_mutated=person.id in recent_person_ids,
                    location=location,
                    companies=companies,
                    affiliations=affiliations,
                ),
            )
        )
        ranked.append(
            RankedNode(
                id=person.id,
                name=person.name,
                kind="person",
                score=item["score"],
                why=why,
                goal_relevance=item["goal_relevance"],
                relationship_strength=item["relationship_strength"],
                confidence=item["confidence"],
                intro_probability=item["intro_probability"],
                rank=item["rank"],
                previous_rank=item["previous_rank"],
                score_delta=item["score_delta"],
                rank_delta=item["rank_delta"],
                change_reason=item["change_reason"],
                next_action=item["next_action"],
                explanation=item["explanation"],
            )
        )

    selected_ids = {node.id for node in nodes}
    edges: list[GraphEdge] = []
    linked_pairs: set[frozenset[str]] = set()
    for rel in rels:
        if rel.source_type != "person" or rel.target_type != "person":
            continue
        source = f"person:{rel.source_id}"
        target = f"person:{rel.target_id}"
        pair = frozenset((source, target))
        if source not in selected_ids or target not in selected_ids or pair in linked_pairs:
            continue
        linked_pairs.add(pair)
        metrics = score_relationship(db, rel)
        edges.append(
            GraphEdge(
                id=f"goal-{goal_id}-{rel.id}",
                source=source,
                target=target,
                label=(
                    "offered introduction"
                    if rel.type == "offered_intro"
                    else "suggested intro"
                    if rel.type == "suggested_intro"
                    else "recommends chat"
                ),
                data=GraphEdgeData(
                    type=rel.type,
                    strength=rel.strength,
                    evidence=rel.evidence,
                    relationship_strength=metrics["relationship_strength"],
                    confidence=metrics["confidence"],
                    intro_probability=metrics["intro_probability"],
                    last_interaction_at=metrics["last_interaction_at"],
                    interaction_count=metrics["interaction_count"],
                    structured_evidence=metrics["evidence"],
                    score_explanation=metrics["explanation"],
                    recently_mutated=rel.id in recent_relationship_ids,
                ),
            )
        )

    return GraphOut(
        nodes=nodes,
        edges=edges,
        ranked=ranked,
        source="goal-match",
        detail=f"Best local network matches for: {goal.text}",
        goal_id=goal.id,
    )


def _goal_terms(goal: Goal, plan: GoalPlan | None) -> tuple[set[str], set[str]]:
    parts: list[str] = []
    if plan:
        parts.append(plan.summary)
        for item in json.loads(plan.subgoals_json or "[]"):
            parts.extend([str(item.get("text", "")), str(item.get("why", ""))])
        for item in json.loads(plan.needed_connections_json or "[]"):
            parts.extend(
                [
                    str(item.get("kind", "")),
                    str(item.get("query", "")),
                    str(item.get("why", "")),
                ]
            )
    core = _tokens(goal.text)
    context = _tokens(" ".join(parts)) - core
    return core, context


def _tokens(value: str) -> set[str]:
    raw = {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 1 and token not in STOP_WORDS
    }
    expanded = set(raw)
    for token in raw:
        expanded.update(ROLE_ALIASES.get(token, set()))
    return expanded


def _score_person(
    person: Person,
    profile: PersonProfile | None,
    orgs: list[Organization],
    core_terms: set[str],
    context_terms: set[str],
) -> tuple[Person, float, list[str]]:
    interests = " ".join(json.loads(person.interests or "[]"))
    skills = " ".join(json.loads(person.skills or "[]"))
    org_text = " ".join(f"{org.name} {org.type}" for org in orgs)
    location = profile.location if profile else ""
    document = f"{person.name} {person.university or ''} {person.bio} {interests} {skills} {org_text} {location}".lower()
    matched_core = sorted({term for term in core_terms if term in document})
    matched_context = sorted({term for term in context_terms if term in document})
    matched = matched_core + matched_context
    score = float(len(matched_core) * 3 + len(matched_context))
    score += sum(0.5 for term in matched if term in interests.lower())
    score += sum(0.5 for term in matched if term in skills.lower())
    score += sum(0.4 for term in matched if term in org_text.lower())
    return person, score, matched
