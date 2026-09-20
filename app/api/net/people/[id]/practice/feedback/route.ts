import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { practiceFeedback } from "@/lib/team-api";
import { feedbackSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("There's nothing to give feedback on yet.", 400);

  try {
    return NextResponse.json({ feedback: await practiceFeedback({ person_id: ctx.backendId, transcript: parsed.data.transcript }) });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
