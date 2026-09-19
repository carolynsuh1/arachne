"""Step 2 only: draw the stored network as a map.

Do not filter or rank by goal here (step 3).
Do not ingest Dropbox files here (step 4).
Do not extract entities here (step 5).
Do not query Elasticsearch here (step 6).

This module only READs people, organizations, relationships, and goals from SQLite.
It does not hide or rank contacts for a selected goal.
"""

import json
import math
import re

from sqlalchemy.orm import Session

from ..models import Goal, Organization, Person, Relationship, SyncState
from ..schemas import GraphEdge, GraphEdgeData, GraphNode, GraphNodeData, GraphOut


def build_graph(db: Session) -> GraphOut:
    people = db.query(Person).all()
    orgs = db.query(Organization).all()
    rels = db.query(Relationship).all()
    goals = db.query(Goal).order_by(Goal.created_at.desc()).limit(8).all()
    state = db.get(SyncState, 1)

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    goal_positions = _positions(len(goals), 480, -40, 180)
    for index, goal in enumerate(goals):
        nodes.append(
            GraphNode(
                id=_node_id("goal", goal.id),
                type="goal",
                position=goal_positions[index],
                data=GraphNodeData(
                    kind="goal",
                    name="Goal",
                    description=goal.text,
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
                data=GraphNodeData(kind="interest", name=interest),
            )
        )

    org_positions = _positions(len(orgs), 160, 380, 170)
    for index, org in enumerate(orgs):
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
                ),
            )
        )

    person_positions = _positions(len(people), 800, 400, 250)
    for index, person in enumerate(people):
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

    return GraphOut(
        nodes=nodes,
        edges=edges,
        ranked=[],
        source=state.source if state else "empty",
        detail=state.detail if state else "No network data loaded yet.",
        goal_id=None,
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
