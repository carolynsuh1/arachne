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
export type TeamGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  data?: {
    strength: number;
    relationship_strength?: number | null;
    confidence?: number | null;
    intro_probability?: number | null;
    last_interaction_at?: string | null;
    interaction_count?: number;
    evidence?: string;
  };
};
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

export type GoalPlan = {
  goal: { id: string; text: string };
  summary: string;
  subgoals: { text: string; why: string }[];
  needed_connections: { kind: string; query: string; why: string }[];
  /** "openai" when a key is configured on the backend, otherwise "heuristic". */
  provider: string;
};
export type RankedPerson = {
  id: string;
  name: string;
  score: number;
  why: string;
  goal_relevance?: number | null;
  relationship_strength?: number | null;
  intro_probability?: number | null;
  score_delta?: number | null;
  rank_delta?: number | null;
  change_reason?: string | null;
  next_action?: string | null;
};
export type GoalGraph = {
  nodes: { id: string; data: { name: string; location?: string | null; companies?: string[] } }[];
  ranked: RankedPerson[];
};
export type TrackerPerson = {
  id: string;
  name: string;
  location: string;
  companies: string[];
  clubs: string[];
  organizations: string[];
};

/** Creates the goal AND its plan in one call (do not also POST /goals or you get a duplicate). */
export const runGoalAgent = (text: string) =>
  teamFetch<GoalPlan>("/agents/goal-network", { method: "POST", body: JSON.stringify({ text }) }, 45000);

export const getGoalPlan = (goalId: string) => teamFetch<GoalPlan>(`/agents/goal-network/${encodeURIComponent(goalId)}`);

/** With personIds, only those people are scored (a user's own map); without, the network-wide top matches. */
export const getGoalGraph = (goalId: string, personIds?: string[]) =>
  teamFetch<GoalGraph>(
    `/goals/${encodeURIComponent(goalId)}/graph` +
      (personIds ? `?person_ids=${encodeURIComponent(personIds.join(","))}` : ""),
  );

export const getTracker = () => teamFetch<{ people: TrackerPerson[] }>("/network/tracker");

// ---- Phase 3: per-person features ----

export type ResearchResult = {
  status: string;
  person: string;
  coverage?: string;
  saved?: boolean;
  brief_id?: string;
  candidates?: { url: string; title: string; description?: string }[];
  facts?: { id: string; claim: string; sourceId: string; evidence: string }[];
  sources?: { id: string; url: string; title: string; retrievedAt: string }[];
  questions?: { text: string; viewerEvidence?: string }[];
  warnings?: string[];
  uncertainties?: string[];
};
export type Chat = { role: "user" | "assistant"; content: string };
export type BrainDumpCard = { category: string; text: string; selected: boolean };
export type Introduction = { name: string; affiliation: string; context: string; existing_person_id?: string | null };
export type Extraction = { cards: BrainDumpCard[]; introductions: Introduction[]; spoken_summary: string; provider: string };
export type Reminder = { id: string; person_id: string; action: string; due_at: string | null; status: string; notes: string };
export type FollowUp = {
  id: string;
  person_id: string;
  person: string;
  action: string;
  due_at: string | null;
  bucket: string;
  why: string;
  source: { date: string; transcript: string } | null;
};

/** The person's most recent saved brief (free: nothing is re-researched), or null. */
export const getSavedResearch = (personId: string) =>
  teamFetch<ResearchResult | null>(`/research/people/${encodeURIComponent(personId)}`);

/** Paid: the research service calls search and AI providers. Can take up to ~100 seconds. */
export const runResearch = (input: {
  name: string;
  affiliation: string;
  goal: string;
  person_id: string;
  viewer_profile_id?: string;
  profileUrl?: string;
}) => teamFetch<ResearchResult>("/research", { method: "POST", body: JSON.stringify(input) }, 120000);

export const makeQuestions = (briefId: string, input: { viewer_profile_id: string; goal: string }) =>
  teamFetch<ResearchResult>(
    `/research/briefs/${encodeURIComponent(briefId)}/questions`,
    { method: "POST", body: JSON.stringify(input) },
    120000,
  );

/** The "About me" record the backend uses to personalise questions. Idempotent (PUT). */
export const putPersonalProfile = (
  profileId: string,
  data: { name: string; school: string; background: string; interests: string; goals: string; contribution: string },
) => teamFetch(`/my-profile/${encodeURIComponent(profileId)}`, { method: "PUT", body: JSON.stringify(data) });

export const practiceTurn = (input: { person_id: string; message: string; history: Chat[] }) =>
  teamFetch<{ reply: string; spoken_text: string }>("/copilot/practice/turn", { method: "POST", body: JSON.stringify(input) });

export const practiceFeedback = (input: { person_id: string; transcript: Chat[] }) =>
  teamFetch<{ topics_connected: string; missed_opportunity: string; suggested_follow_up: string; next_action: string }>(
    "/copilot/practice/feedback",
    { method: "POST", body: JSON.stringify(input) },
  );

export const extractBrainDump = (input: { person_id: string; transcript: string }) =>
  teamFetch<Extraction>("/brain-dumps/extract", { method: "POST", body: JSON.stringify(input) });

export const confirmBrainDump = (input: {
  person_id: string;
  transcript: string;
  cards: BrainDumpCard[];
  introductions: Introduction[];
}) =>
  teamFetch<{ reminders: Reminder[]; created_people: string[]; spoken_summary: string }>("/brain-dumps/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });

// ---- Phase 4: ask your network ----

export type CopilotTurn = {
  answer: string;
  spoken_text: string;
  cited_people: { id: string; node_id: string; name: string }[];
  /** node/edge highlights in the order the answer mentions them; edge_id is a relationship id. */
  highlight_events: { type: "node" | "edge"; node_id?: string; edge_id?: string }[];
};

/** Rule-based (no API key needed). With personIds, only those people are considered. */
export const askCopilot = (input: { question: string; history: Chat[]; personIds?: string[] }) =>
  teamFetch<CopilotTurn>("/copilot/turn", {
    method: "POST",
    body: JSON.stringify({ question: input.question, history: input.history, person_ids: input.personIds }),
  });

export const listFollowUps = () => teamFetch<FollowUp[]>("/follow-ups");

export const updateFollowUp = (reminderId: string, input: { action: string; days: number }) =>
  teamFetch<{ ok: boolean }>(`/follow-ups/${encodeURIComponent(reminderId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

// ---- Phase 5: meetings ----

export type Meeting = {
  id: string;
  title: string;
  meeting_type: string;
  person_ids: string[];
  person_names: string[];
  goal_id: string | null;
  goal_text: string;
  status: string;
  transcript: string;
  summary: string;
  cards: BrainDumpCard[];
  introductions: Introduction[];
  tags: string[];
  started_at: string;
  ended_at: string | null;
  confirmed_at: string | null;
};
export type MeetingLive = { meeting: Meeting; extraction: Extraction };
export type TimelineEvent = { id: string; kind: string; title: string; detail: string; at: string };

export const startMeeting = (input: {
  person_ids: string[];
  goal_id?: string;
  goal_text: string;
  meeting_type: string;
  title: string;
}) => teamFetch<Meeting>("/meetings", { method: "POST", body: JSON.stringify(input) });

export const listMeetings = () => teamFetch<Meeting[]>("/meetings");
export const getMeeting = (id: string) => teamFetch<Meeting>(`/meetings/${encodeURIComponent(id)}`);
export const updateMeetingTranscript = (id: string, text: string) =>
  teamFetch<MeetingLive>(`/meetings/${encodeURIComponent(id)}/chunks`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
export const changeMeetingState = (id: string, action: "pause" | "resume" | "end") =>
  teamFetch<Meeting | MeetingLive>(`/meetings/${encodeURIComponent(id)}/${action}`, { method: "POST" });
export const confirmMeeting = (id: string, input: { cards: BrainDumpCard[]; introductions: Introduction[] }) =>
  teamFetch<{ meeting: Meeting; reminders: Reminder[]; created_people: string[] }>(
    `/meetings/${encodeURIComponent(id)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const getPersonTimeline = (personId: string) =>
  teamFetch<TimelineEvent[]>(`/meetings/people/${encodeURIComponent(personId)}/timeline`);

/** Same normalisation the backend uses to decide two names are the same person. */
export const normalizeName = (name: string) => name.trim().split(/\s+/).join(" ").toLowerCase();
