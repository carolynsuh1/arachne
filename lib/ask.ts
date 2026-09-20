/** A person the copilot cited, mapped back to the caller's map when they are on it. */
export type Cited = { backendId: string; name: string; localId: string | null; university: string };
export type AskResponse = { answer: string; cited: Cited[]; edgeIds: string[] };
