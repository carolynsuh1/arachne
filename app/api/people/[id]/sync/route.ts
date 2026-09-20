import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toMapPerson } from "@/lib/network";
import { resolveBackendPerson } from "@/lib/people";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";

/**
 * Adds a person who was saved locally only (the backend was offline at the time) to the team network.
 * Same rules as Add person: a name that already exists needs an explicit "yes, same person" (linkExistingId).
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req, { allowUnsynced: true });
  if (!ctx.ok) return ctx.response;
  if (ctx.person.backendPersonId) return NextResponse.json({ person: toMapPerson(ctx.person) });

  const body = await req.json().catch(() => null);
  const linkExistingId = typeof body?.linkExistingId === "string" ? body.linkExistingId.slice(0, 64) : undefined;

  let resolved;
  try {
    resolved = await resolveBackendPerson(ctx.person.name, ctx.person.university, linkExistingId);
  } catch (error) {
    return teamErrorResponse(error);
  }
  if (resolved.kind === "offline") {
    return NextResponse.json({ error: "The team backend is unreachable.", code: "offline" }, { status: 503 });
  }

  const backendId = resolved.kind === "ok" ? resolved.backendId : resolved.existing?.id;
  if (backendId) {
    const dup = await prisma.person.findFirst({ where: { userId: ctx.userId, backendPersonId: backendId, NOT: { id: ctx.person.id } } });
    if (dup) return jsonError(`${dup.name} is already on your map.`, 409);
  }
  if (resolved.kind === "conflict") {
    return NextResponse.json(
      { error: "A person with this name is already in the network.", existing: resolved.existing },
      { status: 409 },
    );
  }

  const person = await prisma.person.update({ where: { id: ctx.person.id }, data: { backendPersonId: resolved.backendId } });
  return NextResponse.json({ person: toMapPerson(person) });
}
