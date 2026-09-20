import { TeamApiError, createTeamPerson, listTeamPeople, normalizeName, type TeamPerson } from "@/lib/team-api";

export type Resolved =
  | { kind: "ok"; backendId: string }
  | { kind: "conflict"; existing: TeamPerson | null }
  | { kind: "offline" };

/**
 * Find or create a person in the team backend (the source of truth for the network).
 * - New name: created, returns its id.
 * - Name already in the network (backend 409): "conflict" with the existing record, so the caller can ask
 *   the user whether it is the same person. Never merged silently.
 * - `linkExistingId` is that explicit "yes"; the id must exist AND its name must match, so ids can't be forged.
 * - Backend unreachable: "offline" (caller saves locally and can sync later).
 */
export async function resolveBackendPerson(name: string, university: string, linkExistingId?: string): Promise<Resolved> {
  try {
    if (linkExistingId) {
      const match = (await listTeamPeople()).find(
        (p) => p.id === linkExistingId && normalizeName(p.name) === normalizeName(name),
      );
      if (!match) throw new TeamApiError(400, "That person record no longer matches.");
      return { kind: "ok", backendId: match.id };
    }
    const created = await createTeamPerson({ name, university });
    return { kind: "ok", backendId: created.id };
  } catch (error) {
    if (!(error instanceof TeamApiError)) throw error;
    if (error.status === 409) {
      const existing = (await listTeamPeople().catch(() => [])).find((p) => normalizeName(p.name) === normalizeName(name));
      return { kind: "conflict", existing: existing ?? null };
    }
    if (error.unreachable) return { kind: "offline" };
    throw error;
  }
}
