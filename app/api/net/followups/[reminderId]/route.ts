import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser } from "@/lib/http";
import { teamErrorResponse } from "@/lib/person-route";
import { listFollowUps, updateFollowUp } from "@/lib/team-api";
import { followUpActionSchema } from "@/lib/validation";

/** Mark a follow-up done, dismiss it, snooze it (1, 3 or 7 days) or restore it. Only for people on the caller's map. */
export async function PATCH(req: Request, { params }: { params: Promise<{ reminderId: string }> }) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const parsed = followUpActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action.", 400);
  const { reminderId } = await params;

  try {
    const mine = new Set(
      (await prisma.person.findMany({ where: { userId: user.id, backendPersonId: { not: null } } })).map((p) => p.backendPersonId!),
    );
    const followUp = (await listFollowUps()).find((f) => f.id === reminderId);
    if (!followUp || !mine.has(followUp.person_id)) return jsonError("Follow-up not found.", 404);
    return NextResponse.json(await updateFollowUp(reminderId, parsed.data));
  } catch (error) {
    return teamErrorResponse(error);
  }
}
