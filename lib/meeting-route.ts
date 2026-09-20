import { prisma } from "@/lib/db";
import { jsonError, requireApiUser } from "@/lib/http";
import { getMeeting } from "@/lib/team-api";

/** Ensures a shared-backend meeting contains only people on this user's map. */
export async function ownedMeeting(meetingId: string) {
  const { user, response } = await requireApiUser();
  if (!user) return { ok: false as const, response };
  const allowed = new Set(
    (
      await prisma.person.findMany({
        where: { userId: user.id, backendPersonId: { not: null } },
        select: { backendPersonId: true },
      })
    ).flatMap((person) => (person.backendPersonId ? [person.backendPersonId] : [])),
  );
  const meeting = await getMeeting(meetingId);
  if (!meeting.person_ids.length || meeting.person_ids.some((id) => !allowed.has(id))) {
    return { ok: false as const, response: jsonError("Meeting not found.", 404) };
  }
  return { ok: true as const, user, meeting };
}
