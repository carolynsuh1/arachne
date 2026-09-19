import type { Goal, GoalNetworkResult, GraphResponse, SyncResponse } from "./types"

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

export function fetchGraph(goalId?: string) {
  const suffix = goalId ? `?goal_id=${encodeURIComponent(goalId)}` : ""
  return request<GraphResponse>(`/graph${suffix}`)
}

export function syncFromDropbox() {
  return request<SyncResponse>("/sync/dropbox", { method: "POST" })
}

export function syncFromSample() {
  return request<SyncResponse>("/sync/sample", { method: "POST" })
}
