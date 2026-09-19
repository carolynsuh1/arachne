from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalCreate(BaseModel):
    text: str = Field(min_length=1)


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    created_at: datetime


class GraphNodeData(BaseModel):
    kind: str
    name: str
    bio: str | None = None
    interests: list[str] = []
    skills: list[str] = []
    org_type: str | None = None
    description: str | None = None


class GraphNode(BaseModel):
    id: str
    type: str
    data: GraphNodeData
    position: dict[str, float]


class GraphEdgeData(BaseModel):
    type: str
    strength: float
    evidence: str


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    data: GraphEdgeData


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    source: str
    detail: str


class SyncOut(BaseModel):
    source: str
    detail: str
    people: int
    organizations: int
    relationships: int
    synced_at: datetime
