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

from sqlalchemy.orm import Session

from ..models import Person, Relationship, SyncState
from ..schemas import GraphEdge, GraphEdgeData, GraphNode, GraphNodeData, GraphOut

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

    positions = _ring_positions(len(people))
    nodes = [
        GraphNode(
            id=_node_id(person.id),
            type="person",
            position=positions[index],
            data=GraphNodeData(
                kind="person",
                name=person.name,
                bio=person.bio,
                interests=json.loads(person.interests or "[]"),
                skills=json.loads(person.skills or "[]"),
            ),
        )
        for index, person in enumerate(people)
    ]

    known_ids = {node.id for node in nodes}
    edges: list[GraphEdge] = []
    linked_pairs: set[frozenset[str]] = set()

    for rel in rels:
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
                label="recommends chat",
                data=GraphEdgeData(
                    type=rel.type,
                    strength=rel.strength,
                    evidence=rel.evidence,
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
