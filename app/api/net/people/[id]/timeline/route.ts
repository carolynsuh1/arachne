import { NextResponse } from "next/server";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { getPersonTimeline } from "@/lib/team-api";

export async function GET(_req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json({ events: await getPersonTimeline(ctx.backendId) });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
