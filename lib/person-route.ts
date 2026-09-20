import { NextResponse } from "next/server";
import type { Person } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser } from "@/lib/http";
import { TeamApiError } from "@/lib/team-api";

type Params = { params: Promise<{ id: string }> };
export type { Params };

export type PersonRoute =
  | { ok: true; userId: string; person: Person; backendId: string }
  | { ok: false; response: NextResponse };

/**
 * Shared guard for every per-person API route: the caller must be logged in, own this person, and the
 * person must exist in the team network (have a backend id). Otherwise a ready-made response is returned.
 */
export async function personRoute(id: string, req?: Request, options: { allowUnsynced?: boolean } = {}): Promise<PersonRoute> {
  if (req) {
    const blocked = assertSameOrigin(req);
    if (blocked) return { ok: false, response: blocked };
  }
  const { user, response } = await requireApiUser();
  if (!user) return { ok: false, response };

  const person = await prisma.person.findFirst({ where: { id, userId: user.id } });
  if (!person) return { ok: false, response: jsonError("Person not found.", 404) };
  if (!person.backendPersonId && !options.allowUnsynced) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This person is saved locally only. Sync them to the team network first.", code: "not_synced" },
        { status: 409 },
      ),
    };
  }
  return { ok: true, userId: user.id, person, backendId: person.backendPersonId ?? "" };
}

/** Turns a failed backend call into a response the UI can explain; unexpected errors are rethrown. */
export function teamErrorResponse(error: unknown) {
  if (!(error instanceof TeamApiError)) throw error;
  if (error.status === 0) return NextResponse.json({ error: error.message, code: "offline" }, { status: 503 });
  if (error.status >= 500) {
    // The backend answered but a service behind it failed (e.g. research service down or out of credits).
    return NextResponse.json({ error: error.message, code: "backend_error" }, { status: 502 });
  }
  return NextResponse.json({ error: error.message, code: "rejected" }, { status: error.status });
}
