"""Step 2 only: draw the stored people as a map of chat recommendations.

Nodes are people. An edge means the source person is someone who can
recommend you chat with the target person.

Do not filter or rank by goal here (step 3).
Do not extract entities here (step 4).
Do not query Elasticsearch here (step 5).

This module only READs people and relationships from SQLite.
It does not hide or rank contacts for a selected goal.
"""

import json
import math
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models import GraphMutation, InteractionMemory, Person, Relationship, SyncState
from ..schemas import GraphEdge, GraphEdgeData, GraphNode, GraphNodeData, GraphOut
from ..services.relationship_scoring import score_person_connection, score_relationship

# A person card is at most this big on screen. The layout keeps every pair of
# cards farther apart than this, so no two names can overlap.
CARD_WIDTH = 240.0
CARD_HEIGHT = 80.0
CARD_GAP = 40.0
MIN_RADIUS = 280.0


def build_graph(db: Session) -> GraphOut:
    people = db.query(Person).order_by(Person.name).all()
    rels = db.query(Relationship).all()
    state = db.get(SyncState, 1)
    suggested_ids = {
        rel.target_id
        for rel in rels
        if rel.type in {"suggested_intro", "offered_intro"}
    }
    recent_mutations = (
        db.query(GraphMutation)
        .filter(GraphMutation.created_at >= datetime.utcnow() - timedelta(minutes=10))
        .all()
    )
    recent_people = {
        row.entity_id for row in recent_mutations if row.entity_type == "person"
    }
    recent_relationships = {
        row.entity_id for row in recent_mutations if row.entity_type == "relationship"
    }
    for rel in rels:
        if rel.id in recent_relationships:
            if rel.source_type == "person":
                recent_people.add(rel.source_id)
            if rel.target_type == "person":
                recent_people.add(rel.target_id)
    has_interactions = db.query(InteractionMemory).count() > 0

    positions = _ring_positions(len(people) + (1 if has_interactions else 0))
    nodes = []
    for index, person in enumerate(people):
        metrics = score_person_connection(db, person.id)
        nodes.append(
            GraphNode(
                id=_node_id(person.id),
                type="person",
                position=positions[index],
                data=GraphNodeData(
                    kind="person",
                    name=person.name,
                    university=person.university or None,
                    bio=person.bio,
                    interests=json.loads(person.interests or "[]"),
                    skills=json.loads(person.skills or "[]"),
                    suggested=person.id in suggested_ids,
                    relationship_strength=metrics["relationship_strength"],
                    confidence=metrics["confidence"],
                    intro_probability=metrics["intro_probability"],
                    last_interaction_at=metrics["last_interaction_at"],
                    interaction_count=metrics["interaction_count"],
                    score_explanation=metrics["explanation"],
                    recently_mutated=person.id in recent_people,
                ),
            )
        )
    if has_interactions:
        nodes.insert(
            0,
            GraphNode(
                id="user:me",
                type="person",
                position=positions[-1],
                data=GraphNodeData(kind="user", name="Me", relevant=False),
            ),
        )

    known_ids = {node.id for node in nodes}
    edges: list[GraphEdge] = []
    linked_pairs: set[frozenset[str]] = set()

    scored_relationships = [
        (rel, score_relationship(db, rel)) for rel in rels
    ]
    scored_relationships.sort(
        key=lambda item: item[1]["relationship_strength"], reverse=True
    )
    for rel, metrics in scored_relationships:
        if rel.source_type != "person" or rel.target_type != "person":
            continue
        source = _node_id(rel.source_id)
        target = _node_id(rel.target_id)
        if source == target or source not in known_ids or target not in known_ids:
            continue
        pair = frozenset((source, target))
        if pair in linked_pairs:
            continue
        linked_pairs.add(pair)
        edges.append(
            GraphEdge(
                id=rel.id,
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
                    recently_mutated=rel.id in recent_relationships,
                ),
            )
        )

    if has_interactions:
        for person in people:
            metrics = score_person_connection(db, person.id)
            if not metrics["interaction_count"]:
                continue
            edges.append(
                GraphEdge(
                    id=f"user-relationship-{person.id}",
                    source="user:me",
                    target=_node_id(person.id),
                    label="direct relationship",
                    data=GraphEdgeData(
                        type="direct_interaction",
                        strength=metrics["relationship_strength"],
                        evidence="Derived from confirmed interaction memory.",
                        relationship_strength=metrics["relationship_strength"],
                        confidence=metrics["confidence"],
                        intro_probability=metrics["intro_probability"],
                        last_interaction_at=metrics["last_interaction_at"],
                        interaction_count=metrics["interaction_count"],
                        structured_evidence=metrics["evidence"],
                        score_explanation=metrics["explanation"],
                        recently_mutated=person.id in recent_people,
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


def _node_id(person_id: str) -> str:
    return f"person:{person_id}"


def _ring_positions(count: int) -> list[dict[str, float]]:
    """Place people on one circle wide enough that no two cards can touch.

    Adjacent cards sit at least CARD_WIDTH + CARD_GAP apart along the circle,
    which is farther than the diagonal of a card, so nothing overlaps.
    """
    if count == 0:
        return []
    if count == 1:
        return [{"x": 0.0, "y": 0.0}]

    spacing = CARD_WIDTH + CARD_GAP
    radius = max(MIN_RADIUS, (count * spacing) / (2 * math.pi))
    return [
        {
            "x": radius * math.cos((2 * math.pi * index) / count),
            "y": radius * math.sin((2 * math.pi * index) / count),
        }
        for index in range(count)
    ]
