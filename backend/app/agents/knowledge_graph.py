import json
import math
import re

from sqlalchemy.orm import Session

from ..models import Organization, Person, Relationship, SyncState
from ..schemas import (
    GraphEdge,
    GraphEdgeData,
    GraphNode,
    GraphNodeData,
    GraphOut,
    RankedNode,
)
from .goal_network import load_plan


def build_graph(db: Session, goal_id: str | None = None) -> GraphOut:
    """Agent 2: turn stored people/orgs/relationships into a goal-aware map."""
    people = db.query(Person).all()
    orgs = db.query(Organization).all()
    rels = db.query(Relationship).all()
    state = db.get(SyncState, 1)
    plan = load_plan(db, goal_id) if goal_id else None

    query_terms = _query_terms(plan.goal.text if plan else "", plan)
    scored_people = [_score_person(person, query_terms, plan) for person in people]
    scored_orgs = [_score_org(org, query_terms, plan) for org in orgs]

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    if plan:
        nodes.append(
            GraphNode(
                id=_node_id("goal", plan.goal.id),
                type="goal",
                position={"x": 480, "y": 20},
                data=GraphNodeData(
                    kind="goal",
                    name="Your goal",
                    description=plan.goal.text,
                    relevant=True,
                    why=plan.summary,
                ),
            )
        )

    interests = _unique_interests(people)
    interest_positions = _positions(len(interests), 480, 140, 220)
    for index, (slug, interest) in enumerate(interests.items()):
        nodes.append(
            GraphNode(
                id=_node_id("interest", slug),
                type="interest",
                position=interest_positions[index],
                data=GraphNodeData(
                    kind="interest",
                    name=interest,
                    relevant=any(term in interest.lower() for term in query_terms),
                ),
            )
        )

    org_positions = _positions(len(orgs), 160, 380, 170)
    for index, (org, score, why) in enumerate(scored_orgs):
        nodes.append(
            GraphNode(
                id=_node_id("organization", org.id),
                type="organization",
                position=org_positions[index],
                data=GraphNodeData(
                    kind="organization",
                    name=org.name,
                    org_type=org.type,
                    description=org.description,
                    relevant=score > 0,
                    why=why,
                    score=score,
                ),
            )
        )

    person_positions = _positions(len(people), 800, 400, 250)
    for index, (person, score, why) in enumerate(scored_people):
        nodes.append(
            GraphNode(
                id=_node_id("person", person.id),
                type="person",
                position=person_positions[index],
                data=GraphNodeData(
                    kind="person",
                    name=person.name,
                    bio=person.bio,
                    interests=json.loads(person.interests or "[]"),
                    skills=json.loads(person.skills or "[]"),
                    relevant=score > 0,
                    why=why,
                    score=score,
                ),
            )
        )

    edges.extend(
        GraphEdge(
            id=rel.id,
            source=_node_id(rel.source_type, rel.source_id),
            target=_node_id(rel.target_type, rel.target_id),
            label=rel.type.replace("_", " "),
            data=GraphEdgeData(
                type=rel.type,
                strength=rel.strength,
                evidence=rel.evidence,
            ),
        )
        for rel in rels
    )

    for person in people:
        for interest in json.loads(person.interests or "[]"):
            slug = _slug(interest)
            if slug not in interests:
                continue
            edges.append(
                GraphEdge(
                    id=f"int-{person.id}-{slug}",
                    source=_node_id("person", person.id),
                    target=_node_id("interest", slug),
                    label="interested in",
                    data=GraphEdgeData(
                        type="interested_in",
                        strength=0.55,
                        evidence=f"{person.name} lists {interest}.",
                    ),
                )
            )

    ranked = [
        RankedNode(
            id=_node_id("person", person.id),
            name=person.name,
            kind="person",
            score=score,
            why=why,
        )
        for person, score, why in sorted(scored_people, key=lambda item: item[1], reverse=True)
        if score > 0
    ]

    if plan:
        for item in ranked[:5]:
            edges.append(
                GraphEdge(
                    id=f"goal-link-{item.id}",
                    source=_node_id("goal", plan.goal.id),
                    target=item.id,
                    label="needed for",
                    data=GraphEdgeData(
                        type="needed_for",
                        strength=min(1.0, item.score / 6),
                        evidence=item.why,
                    ),
                )
            )

    source = state.source if state else "empty"
    if plan:
        detail = f"Knowledge graph ranked for: {plan.goal.text}"
    else:
        detail = state.detail if state else "No network data loaded yet."

    return GraphOut(
        nodes=nodes,
        edges=edges,
        ranked=ranked,
        source=source,
        detail=detail,
        goal_id=goal_id,
    )


def _node_id(entity_type: str, entity_id: str) -> str:
    return f"{entity_type}:{entity_id}"


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _unique_interests(people: list[Person]) -> dict[str, str]:
    seen: dict[str, str] = {}
    for person in people:
        for interest in json.loads(person.interests or "[]"):
            slug = _slug(interest)
            if slug and slug not in seen:
                seen[slug] = interest
        if len(seen) >= 10:
            break
    return seen


def _positions(count: int, origin_x: float, origin_y: float, radius: float) -> list[dict[str, float]]:
    if count == 0:
        return []
    if count == 1:
        return [{"x": origin_x, "y": origin_y}]
    return [
        {
            "x": origin_x + radius * math.cos((2 * math.pi * index) / count),
            "y": origin_y + radius * math.sin((2 * math.pi * index) / count),
        }
        for index in range(count)
    ]


def _query_terms(goal_text: str, plan) -> set[str]:
    blob = goal_text
    if plan:
        blob += " " + plan.summary
        blob += " " + " ".join(item.text for item in plan.subgoals)
        blob += " " + " ".join(item.query + " " + item.kind for item in plan.needed_connections)
    words = re.findall(r"[a-zA-Z]{4,}", blob.lower())
    stop = {"want", "with", "that", "this", "from", "have", "into", "your", "they", "them"}
    return {word for word in words if word not in stop}


def _score_person(person: Person, terms: set[str], plan) -> tuple[Person, float, str]:
    blob = " ".join(
        [
            person.name,
            person.bio,
            person.interests,
            person.skills,
        ]
    ).lower()
    hits = sorted({term for term in terms if term in blob})
    score = float(len(hits))
    why = ""
    if hits:
        why = "Matches your goal on: " + ", ".join(hits[:6])
    if plan:
        for needed in plan.needed_connections:
            markers = _kind_markers(needed.kind)
            if any(marker in blob for marker in markers):
                score += 3
                why = f"{needed.kind}: {needed.why}"
                break
    return person, score, why


def _score_org(org: Organization, terms: set[str], plan) -> tuple[Organization, float, str]:
    blob = " ".join([org.name, org.type, org.description]).lower()
    hits = sorted({term for term in terms if term in blob})
    score = float(len(hits))
    why = "Matches your goal on: " + ", ".join(hits[:6]) if hits else ""
    if plan and hits:
        why = f"Relevant place for: {plan.summary}"
    return org, score, why


def _kind_markers(kind: str) -> list[str]:
    lowered = kind.lower()
    mapping = {
        "faculty advisor": ["faculty", "professor", "advisor"],
        "current student": ["phd", "undergrad", "graduate student"],
        "lab manager": ["lab manager", "community", "office hours"],
        "alumni": ["alum", "alumni"],
        "recruiter": ["recruiter", "hiring"],
    }
    if lowered in mapping:
        return mapping[lowered]
    return [word for word in lowered.split() if len(word) > 5]
