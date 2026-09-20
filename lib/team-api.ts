// Server-side client for the team's FastAPI backend (backend/). The browser never calls it directly:
// Next routes and server components go through here, after checking the user's session.

export class TeamApiError extends Error {
  /** HTTP status from the backend, or 0 when it could not be reached at all. */
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  get unreachable() {
    return this.status === 0 || this.status >= 500;
  }
}

export type TeamPerson = { id: string; name: string; university: string };
export type TeamGraphEdge = { id: string; source: string; target: string; label: string };
export type TeamGraph = { nodes: { id: string }[]; edges: TeamGraphEdge[] };

function baseUrl() {
  return (process.env.TEAM_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

async function teamFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const key = process.env.INTERNAL_API_KEY;
  if (key) headers.set("X-Internal-Key", key);

  let res: Response;
  try {
    res = await fetch(baseUrl() + path, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new TeamApiError(0, "The team backend is unreachable.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new TeamApiError(res.status, typeof body.detail === "string" ? body.detail : `Backend returned ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

export async function teamHealthy(): Promise<boolean> {
  try {
    await teamFetch("/health", {}, 2000);
    return true;
  } catch {
    return false;
  }
}

export const listTeamPeople = () => teamFetch<TeamPerson[]>("/person-data");

export const createTeamPerson = (person: { name: string; university: string }) =>
  teamFetch<TeamPerson>("/person-data", { method: "POST", body: JSON.stringify(person) });

export const getTeamGraph = () => teamFetch<TeamGraph>("/graph");

/** Same normalisation the backend uses to decide two names are the same person. */
export const normalizeName = (name: string) => name.trim().split(/\s+/).join(" ").toLowerCase();
