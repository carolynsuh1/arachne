import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import {
  TeamApiError,
  createTeamPerson,
  listTeamPeople,
  normalizeName,
  type TeamPerson,
} from "@/lib/team-api";
import { personSchema } from "@/lib/validation";

/* ---------------------------------------------------------------------------
 * STUB: BACKEND WEB-SCRAPER HOOK  (NOT IMPLEMENTED)
 *
 * After a person is saved, public-web research on them can run here. The backend already exposes it:
 *   POST {TEAM_API_URL}/research  { name, affiliation: <university>, person_id: <backendPersonId> }
 * (it calls research-service and uses paid providers: Apify / Firecrawl / OpenAI).
 * It is deliberately NOT called automatically on every Add person; it becomes the per-person
 * "Research" button in phase 3 of INTEGRATION_PLAN.md.
 * ------------------------------------------------------------------------- */
async function callWebScraperStub(_person: { id: string; name: string; university: string }): Promise<void> {
  // TODO(scraper): invoke the backend research/scraper for `_person` here.
}

type Resolved =
  | { kind: "ok"; backendId: string }
  | { kind: "conflict"; existing: TeamPerson | null }
  | { kind: "offline" };

/** Find or create the person in the team backend (the source of truth for the network). */
async function resolveBackendPerson(name: string, university: string, linkExistingId?: string): Promise<Resolved> {
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

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const people = await prisma.person.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ people });
}

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const parsed = personSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));
  const { name, university, linkExistingId } = parsed.data;

  let resolved: Resolved;
  try {
    resolved = await resolveBackendPerson(name, university, linkExistingId);
  } catch (error) {
    const message = error instanceof TeamApiError ? error.message : "Could not save this person.";
    return jsonError(message, 400);
  }

  if (resolved.kind === "conflict") {
    // Someone with this name is already in the shared network: let the user decide, never merge silently.
    const onMap = resolved.existing
      ? await prisma.person.findFirst({ where: { userId: user.id, backendPersonId: resolved.existing.id } })
      : null;
    if (onMap) return jsonError(`${onMap.name} is already on your map.`, 409, { name: "Already on your map." });
    return NextResponse.json(
      {
        error: "A person with this name is already in the network.",
        existing: resolved.existing,
      },
      { status: 409 },
    );
  }

  const backendPersonId = resolved.kind === "ok" ? resolved.backendId : null;
  if (backendPersonId) {
    const dup = await prisma.person.findFirst({ where: { userId: user.id, backendPersonId } });
    if (dup) return jsonError(`${dup.name} is already on your map.`, 409, { name: "Already on your map." });
  }

  const person = await prisma.person.create({ data: { name, university, userId: user.id, backendPersonId } });

  await callWebScraperStub(person); // <-- scraper hook (see STUB above)

  return NextResponse.json(
    { person: { id: person.id, name: person.name, university: person.university, synced: backendPersonId !== null } },
    { status: 201 },
  );
}
