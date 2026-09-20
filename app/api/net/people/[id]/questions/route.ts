import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { personRoute, teamErrorResponse, type Params } from "@/lib/person-route";
import { tooManyAttempts } from "@/lib/rateLimit";
import { getSavedResearch, makeQuestions } from "@/lib/team-api";
import { questionsSchema } from "@/lib/validation";
import { ensureViewerProfile } from "@/lib/viewer-profile";

/** (Re)writes conversation starters for a saved brief, using the user's own profile and goal. Uses an AI provider. */
export async function POST(req: Request, { params }: Params) {
  const ctx = await personRoute((await params).id, req);
  if (!ctx.ok) return ctx.response;

  const parsed = questionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Missing brief.", 400);
  if (tooManyAttempts(`questions:${ctx.userId}`, 20, 60 * 60 * 1000)) {
    return jsonError("You've regenerated a lot of questions this hour. Try again later.", 429);
  }

  try {
    // The brief must be this person's latest one, so a brief id from someone else can't be used here.
    const latest = await getSavedResearch(ctx.backendId);
    if (!latest?.brief_id || latest.brief_id !== parsed.data.briefId) {
      return jsonError("That research is out of date. Reopen this panel and try again.", 409);
    }
    const profile = await prisma.profile.findUnique({ where: { userId: ctx.userId } });
    const viewer = await ensureViewerProfile(ctx.userId);
    if (!viewer) return jsonError("Your profile couldn't be sent to the team backend. Try again in a moment.", 503);
    const result = await makeQuestions(parsed.data.briefId, {
      viewer_profile_id: viewer,
      goal: profile?.goal.trim().slice(0, 700) || "Prepare a professional coffee chat.",
    });
    return NextResponse.json({ result });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
