import json
import math

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Organization, Person, Relationship, SyncState
from ..schemas import GraphEdge, GraphEdgeData, GraphNode, GraphNodeData, GraphOut

router = APIRouter(prefix="/graph", tags=["graph"])


def _node_id(entity_type: str, entity_id: str) -> str:
    return f"{entity_type}:{entity_id}"


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


@router.get("", response_model=GraphOut)
def get_graph(db: Session = Depends(get_db)):
    people = db.query(Person).all()
    orgs = db.query(Organization).all()
    rels = db.query(Relationship).all()
    state = db.get(SyncState, 1)

    org_positions = _positions(len(orgs), 180, 280, 160)
    person_positions = _positions(len(people), 620, 300, 240)

    nodes: list[GraphNode] = []
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

    edges = [
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
    ]

    return GraphOut(
        nodes=nodes,
        edges=edges,
        source=state.source if state else "empty",
        detail=state.detail if state else "No network data loaded yet.",
    )
