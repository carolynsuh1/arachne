import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { resolveBackendPerson, type Resolved } from "@/lib/people";
import { TeamApiError } from "@/lib/team-api";
import { personSchema } from "@/lib/validation";

/* ---------------------------------------------------------------------------
 * HOOK: AUTOMATIC ENRICHMENT AFTER A PERSON IS ADDED  (intentionally a no-op)
 *
 * Research on a person is now a deliberate, per-person "Research" button
 * (app/api/net/people/[id]/research), because it calls paid providers (Apify / Firecrawl / OpenAI) and
 * can take ~2 minutes. If you ever want research to start automatically on Add person, call it here.
 * ------------------------------------------------------------------------- */
async function callWebScraperStub(_person: { id: string; name: string; university: string }): Promise<void> {
  // Intentionally empty. See the note above.
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
