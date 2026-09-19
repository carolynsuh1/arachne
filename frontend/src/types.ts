export type Goal = {
  id: string
  text: string
  created_at: string
}

export type GraphNodeData = {
  kind: "person" | "organization" | string
  name: string
  bio?: string | null
  interests?: string[]
  skills?: string[]
  org_type?: string | null
  description?: string | null
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

export type GraphResponse = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  source: string
  detail: string
}

export type SyncResponse = {
  source: string
  detail: string
  people: number
  organizations: number
  relationships: number
  synced_at: string
}
