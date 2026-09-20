import { NextResponse } from "next/server";
import { jsonError, zodFields } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { extractBrainDump } from "@/lib/team-api";
import { extractSchema } from "@/lib/validation";

/** Turns free text about a conversation into reviewable cards. Saves nothing until confirmed. */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = extractSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Write a few words first.", 400, zodFields(parsed.error));

  try {
    return NextResponse.json({ extraction: await extractBrainDump({ person_id: ctx.backendId, transcript: parsed.data.transcript }) });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
