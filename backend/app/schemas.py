from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GoalCreate(BaseModel):
    text: str = Field(min_length=1)


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    text: str
    created_at: datetime


class Subgoal(BaseModel):
    text: str
    why: str


class NeededConnection(BaseModel):
    kind: str
    query: str
    why: str


class GoalNetworkOut(BaseModel):
    goal: GoalOut
    summary: str
    subgoals: list[Subgoal]
    needed_connections: list[NeededConnection]
    provider: str


class GraphNodeData(BaseModel):
    kind: str
    name: str
    bio: str | None = None
    interests: list[str] = []
    skills: list[str] = []
    org_type: str | None = None
    description: str | None = None
    relevant: bool = False
    why: str | None = None
    score: float | None = None
    location: str | None = None
    companies: list[str] = []
    affiliations: list[str] = []


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


class RankedNode(BaseModel):
    id: str
    name: str
    kind: str
    score: float
    why: str


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    ranked: list[RankedNode] = []
    source: str
    detail: str
    goal_id: str | None = None


class SyncOut(BaseModel):
    source: str
    detail: str
    people: int
    organizations: int
    relationships: int
    synced_at: datetime


class TrackerPersonOut(BaseModel):
    id: str
    name: str
    bio: str
    location: str
    companies: list[str] = []
    clubs: list[str] = []
    organizations: list[str] = []


class TrackerGroupOut(BaseModel):
    name: str
    kind: str
    count: int
    people: list[str]


class NetworkTrackerOut(BaseModel):
    people: list[TrackerPersonOut]
    companies: list[TrackerGroupOut]
    clubs: list[TrackerGroupOut]
    organizations: list[TrackerGroupOut]
    locations: list[TrackerGroupOut]
