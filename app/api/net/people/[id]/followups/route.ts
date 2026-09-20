import { NextResponse } from "next/server";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { listFollowUps } from "@/lib/team-api";

/** Open and snoozed follow-ups for this person (finished and dismissed ones are hidden). */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id);
  if (!ctx.ok) return ctx.response;
  try {
    const all = await listFollowUps();
    const mine = all.filter((f) => f.person_id === ctx.backendId && (f.bucket === "active" || f.bucket === "snoozed"));
    return NextResponse.json({ followUps: mine });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
