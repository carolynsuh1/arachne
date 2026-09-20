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
    suggested: bool = False


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


class InteractionMemoryCreate(BaseModel):
    person_id: str | None = Field(default=None, max_length=200)
    person_name: str = Field(min_length=1, max_length=120)
    transcript: str = Field(min_length=1, max_length=10_000)
    happened_at: datetime


class InteractionMemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    person_id: str | None
    person_name: str
    transcript: str
    happened_at: datetime
    created_at: datetime


class BrainDumpCard(BaseModel):
    category: str
    text: str
    selected: bool = True


class SuggestedIntroduction(BaseModel):
    name: str
    affiliation: str = ""
    context: str
    existing_person_id: str | None = None


class BrainDumpExtractIn(BaseModel):
    person_id: str
    transcript: str = Field(min_length=1, max_length=10_000)
    happened_at: datetime | None = None


class BrainDumpExtraction(BaseModel):
    cards: list[BrainDumpCard]
    introductions: list[SuggestedIntroduction] = []
    spoken_summary: str
    provider: str


class BrainDumpConfirmIn(BrainDumpExtractIn):
    cards: list[BrainDumpCard]
    introductions: list[SuggestedIntroduction] = []


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    person_id: str
    interaction_id: str | None
    action: str
    due_at: datetime | None
    status: str
    notes: str


class BrainDumpConfirmOut(BaseModel):
    interaction: InteractionMemoryOut
    reminders: list[ReminderOut]
    created_people: list[str]
    spoken_summary: str


class ReminderCreate(BaseModel):
    person_id: str
    action: str = Field(min_length=1, max_length=500)
    due_at: datetime | None = None
    interaction_id: str | None = None
    notes: str = ""


class WhoNextOut(BaseModel):
    person_id: str
    name: str
    reason: str
    path: list[str]
    suggested_action: str


class BrainDumpActionIn(BaseModel):
    person_id: str
    text: str = Field(min_length=1, max_length=500)
    interaction_id: str | None = None


class BrainDumpActionOut(BaseModel):
    message: str
    reminder: ReminderOut | None = None
    recommendations: list[WhoNextOut] = []
