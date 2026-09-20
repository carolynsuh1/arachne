import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, zodFields } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { tooManyAttempts } from "@/lib/rateLimit";
import { getSavedResearch, runResearch } from "@/lib/team-api";
import { ensureViewerProfile } from "@/lib/viewer-profile";
import { researchSchema } from "@/lib/validation";

const DEFAULT_GOAL = "Prepare a professional coffee chat about experience, projects and collaboration.";

/** The latest saved brief for this person. Free: nothing is re-researched. */
export async function GET(_req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json({ saved: await getSavedResearch(ctx.backendId) });
  } catch (error) {
    return teamErrorResponse(error);
  }
}

/** Runs research on this person. PAID (search + AI providers), slow (up to ~2 min), so it is capped per user. */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = researchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("Please use an https profile link.", 400, zodFields(parsed.error));
  if (tooManyAttempts(`research:${ctx.userId}`, 10, 60 * 60 * 1000)) {
    return jsonError("You've run a lot of research this hour. Try again later.", 429);
  }

  const profile = await prisma.profile.findUnique({ where: { userId: ctx.userId } });
  const viewer = await ensureViewerProfile(ctx.userId);
  try {
    const result = await runResearch({
      name: ctx.person.name,
      affiliation: ctx.person.university || "Unknown",
      goal: profile?.goal.trim().slice(0, 700) || DEFAULT_GOAL,
      person_id: ctx.backendId,
      viewer_profile_id: viewer ?? undefined,
      profileUrl: parsed.data.profileUrl,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
