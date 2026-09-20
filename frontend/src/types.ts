export type Goal = {
  id: string
  text: string
  created_at: string
}

export type Subgoal = {
  text: string
  why: string
}

export type NeededConnection = {
  kind: string
  query: string
  why: string
}

export type GoalNetworkResult = {
  goal: Goal
  summary: string
  subgoals: Subgoal[]
  needed_connections: NeededConnection[]
  provider: string
}

export type GraphNodeData = {
  kind: "person" | "organization" | "interest" | "goal" | string
  name: string
  bio?: string | null
  interests?: string[]
  skills?: string[]
  org_type?: string | null
  description?: string | null
  relevant?: boolean
  why?: string | null
  score?: number | null
  location?: string | null
  companies?: string[]
  affiliations?: string[]
  suggested?: boolean
}

export type GraphNode = {
  id: string
  type: string
  data: GraphNodeData
  position: { x: number; y: number }
}

export type GraphEdge = {
  id: string
  source: string
  target: string
  label: string
  data: {
    type: string
    strength: number
    evidence: string
  }
}

export type RankedNode = {
  id: string
  name: string
  kind: string
  score: number
  why: string
}

export type GraphResponse = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  ranked: RankedNode[]
  source: string
  detail: string
  goal_id: string | null
}

export type SyncResponse = {
  source: string
  detail: string
  people: number
  organizations: number
  relationships: number
  synced_at: string
}

export type TrackerPerson = {
  id: string
  name: string
  bio: string
  location: string
  companies: string[]
  clubs: string[]
  organizations: string[]
}

export type TrackerGroup = {
  name: string
  kind: string
  count: number
  people: string[]
}

export type NetworkTracker = {
  people: TrackerPerson[]
  companies: TrackerGroup[]
  clubs: TrackerGroup[]
  organizations: TrackerGroup[]
  locations: TrackerGroup[]
}

export type InteractionMemory = {
  id: string
  person_id: string | null
  person_name: string
  transcript: string
  happened_at: string
  created_at: string
}

export type BrainDumpCard = {
  category: string
  text: string
  selected: boolean
}

export type SuggestedIntroduction = {
  name: string
  affiliation: string
  context: string
  existing_person_id?: string | null
}

export type Reminder = {
  id: string
  person_id: string
  interaction_id: string | null
  action: string
  due_at: string | null
  status: "upcoming" | "completed" | "overdue"
  notes: string
}

export type WhoNext = {
  person_id: string
  name: string
  reason: string
  path: string[]
  suggested_action: string
}

export type ConversationMessage = {
  role: "user" | "assistant"
  content: string
}

export type HighlightEvent = {
  type: "node" | "edge"
  node_id?: string
  edge_id?: string
  source?: string
  target?: string
  at_ms: number
  duration_ms: number
  note: string
}

export type VoicePayload = {
  spoken_text: string
  audio_base64: string | null
  audio_mime_type: string | null
  voice_status: string
}

export type CopilotTurn = VoicePayload & {
  answer: string
  cited_people: { id: string; node_id: string; name: string }[]
  highlight_events: HighlightEvent[]
}

export type PracticeTurn = VoicePayload & {
  reply: string
  person: GraphNodeData & { id: string; focus: string; memories: string[] }
}

export type PracticeFeedback = {
  topics_connected: string
  missed_opportunity: string
  suggested_follow_up: string
  next_action: string
}
