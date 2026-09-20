import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { goalSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const parsed = goalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, goal: parsed.data.goal },
    update: { goal: parsed.data.goal },
  });
  return NextResponse.json({ redirect: "/map" });
}
