import { NextResponse } from "next/server";
import { jsonError, zodFields } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { confirmBrainDump } from "@/lib/team-api";
import { confirmSchema } from "@/lib/validation";

/**
 * Saves the reviewed cards as memory about this person, plus reminders for follow-ups. Note: this writes to the
 * shared team network (it can extend the person's notes, and, for introductions the user ticks, add new people).
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please review the notes and try again.", 400, zodFields(parsed.error));

  try {
    const saved = await confirmBrainDump({ person_id: ctx.backendId, ...parsed.data });
    return NextResponse.json({
      reminders: saved.reminders.length,
      createdPeople: saved.created_people,
      summary: saved.spoken_summary,
    });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
