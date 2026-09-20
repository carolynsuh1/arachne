import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureBackendGoal } from "@/lib/goal";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { teamErrorResponse } from "@/lib/person-route";
import { listMeetings, startMeeting } from "@/lib/team-api";

const startSchema = z.object({
  personIds: z.array(z.string().min(1)).min(1).max(20),
  meetingType: z.string().max(40).default("coffee_chat"),
  title: z.string().max(200).default(""),
});

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const allowed = new Set(
    (
      await prisma.person.findMany({
        where: { userId: user.id, backendPersonId: { not: null } },
        select: { backendPersonId: true },
      })
    ).flatMap((person) => (person.backendPersonId ? [person.backendPersonId] : [])),
  );
  try {
    const meetings = await listMeetings();
    return NextResponse.json({
      meetings: meetings.filter(
        (meeting) => meeting.person_ids.length > 0 && meeting.person_ids.every((id) => allowed.has(id)),
      ),
    });
  } catch (error) {
    return teamErrorResponse(error);
  }
}

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Choose at least one person.", 400, zodFields(parsed.error));

  const rows = await prisma.person.findMany({
    where: { userId: user.id, id: { in: parsed.data.personIds }, backendPersonId: { not: null } },
  });
  if (rows.length !== new Set(parsed.data.personIds).size) {
    return jsonError("One or more people are unavailable or not synced.", 404);
  }
  try {
    const goalId = await ensureBackendGoal(user.id);
    const meeting = await startMeeting({
      person_ids: rows.map((row) => row.backendPersonId!),
      goal_id: goalId ?? undefined,
      goal_text: user.profile?.goal ?? "",
      meeting_type: parsed.data.meetingType,
      title: parsed.data.title,
    });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    return teamErrorResponse(error);
  }
}
