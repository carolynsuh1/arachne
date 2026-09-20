import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBackendGoal } from "@/lib/goal";
import { assertSameOrigin, requireApiUser } from "@/lib/http";
import { mintVoiceToken, voiceWebSocketUrl } from "@/lib/voice-token";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const people = await prisma.person.findMany({
    where: { userId: user.id, backendPersonId: { not: null } },
    select: { backendPersonId: true },
  });
  const goalId = (await ensureBackendGoal(user.id)) ?? "";
  try {
    const token = mintVoiceToken({
      sub: user.id,
      person_ids: people.flatMap((person) => (person.backendPersonId ? [person.backendPersonId] : [])),
      goal_id: goalId,
    });
    return NextResponse.json({ token, goalId, webSocketUrl: voiceWebSocketUrl() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice is not configured.", reconnectable: false },
      { status: 503 },
    );
  }
}
