import { NextResponse } from "next/server";
import { jsonError, zodFields } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { practiceTurn } from "@/lib/team-api";
import { practiceTurnSchema } from "@/lib/validation";

/** One line of a rehearsal chat with this person. Send the whole conversation so far as `history`. */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = practiceTurnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please fix the message.", 400, zodFields(parsed.error));

  try {
    const turn = await practiceTurn({ person_id: ctx.backendId, ...parsed.data });
    return NextResponse.json({ reply: turn.reply });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
