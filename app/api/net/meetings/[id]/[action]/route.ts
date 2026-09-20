import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, jsonError, zodFields } from "@/lib/http";
import { ownedMeeting } from "@/lib/meeting-route";
import { teamErrorResponse } from "@/lib/person-route";
import {
  changeMeetingState,
  confirmMeeting,
  updateMeetingTranscript,
} from "@/lib/team-api";

type Params = { params: Promise<{ id: string; action: string }> };
const card = z.object({ category: z.string(), text: z.string(), selected: z.boolean() });
const introduction = z.object({
  name: z.string(),
  affiliation: z.string().default(""),
  context: z.string(),
  existing_person_id: z.string().nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { id, action } = await params;
  try {
    const access = await ownedMeeting(id);
    if (!access.ok) return access.response;

    if (action === "chunks") {
      const parsed = z.object({ text: z.string().trim().min(1).max(50_000) }).safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError("Add meeting notes first.", 400, zodFields(parsed.error));
      return NextResponse.json(await updateMeetingTranscript(id, parsed.data.text));
    }
    if (action === "confirm") {
      const parsed = z.object({ cards: z.array(card), introductions: z.array(introduction).default([]) })
        .safeParse(await req.json().catch(() => null));
      if (!parsed.success) return jsonError("Review the meeting cards.", 400, zodFields(parsed.error));
      return NextResponse.json(await confirmMeeting(id, parsed.data));
    }
    if (action === "pause" || action === "resume" || action === "end") {
      return NextResponse.json(await changeMeetingState(id, action));
    }
    return jsonError("Unknown meeting action.", 404);
  } catch (error) {
    return teamErrorResponse(error);
  }
}
