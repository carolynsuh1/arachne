import type {
  Goal,
  GoalNetworkResult,
  GraphResponse,
  InteractionMemory,
  NetworkTracker,
  SyncResponse,
} from "./types"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (typeof body.detail === "string") detail = body.detail
    } catch {
      // Keep the status text if the server did not return JSON.
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

export function createGoal(text: string) {
  return request<Goal>("/goals", {
    method: "POST",
    body: JSON.stringify({ text }),
  })
}

export function analyzeGoal(text: string) {
  return request<GoalNetworkResult>("/agents/goal-network", {
    method: "POST",
    body: JSON.stringify({ text }),
  })
}

export function listGoals() {
  return request<Goal[]>("/goals")
}

export function fetchGraph() {
  return request<GraphResponse>("/graph")
}

export function fetchGoalGraph(goalId: string) {
  return request<GraphResponse>(`/goals/${encodeURIComponent(goalId)}/graph`)
}

export function fetchNetworkTracker() {
  return request<NetworkTracker>("/network/tracker")
}

export function listInteractions() {
  return request<InteractionMemory[]>("/interactions")
}

export function createInteraction(input: {
  person_id?: string
  person_name: string
  transcript: string
  happened_at: string
}) {
  return request<InteractionMemory>("/interactions", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function syncFromSample() {
  return request<SyncResponse>("/sync/sample", { method: "POST" })
}

export type ResearchInput = { name: string; affiliation: string; goal: string; viewer_profile_id?: string; profileUrl?: string; person_id?: string }
export type ResearchResult = {
 status: string; person: string; coverage?: string; saved?: boolean; brief_id?: string;
 candidates?: {url:string;title:string;description?:string}[];
 facts?: {id:string;claim:string;sourceId:string;evidence:string}[];
 sources?: {id:string;url:string;title:string;retrievedAt:string}[];
 questions?: {text:string;viewerEvidence?:string}[];
 discovery?: {url:string;title:string;status:string}[];
 researchStats?: {discovered:number;attempted:number;retrieved:number};
 personalization?: {profile:Record<string,string>;generatedAt:string}; warnings?: string[]; uncertainties?: string[];
 profile?: {headline:string;about:string;retrievedAt:string;experience:{company:string;position:string;summary:string;starts_at:string;ends_at:string}[];education:{school:string;degree:string;field_of_study:string;starts_at:string;ends_at:string}[]}
}
export function researchPerson(input: ResearchInput) { return request<ResearchResult>("/research", {method:"POST",body:JSON.stringify(input)}) }
export function latestResearch(id:string) { return request<ResearchResult|null>("/research/people/"+encodeURIComponent(id)) }

export function personalizeQuestions(briefId:string, profileId:string, goal:string) {
 return request<ResearchResult>(`/research/briefs/${encodeURIComponent(briefId)}/questions`, {method:"POST",body:JSON.stringify({viewer_profile_id:profileId,goal})})
}
