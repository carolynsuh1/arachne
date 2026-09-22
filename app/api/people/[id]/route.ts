import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser } from "@/lib/http";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const { id } = await params;
  // Delete only this user's map membership. The shared backend record may belong to other maps.
  const result = await prisma.person.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return jsonError("This person is no longer on your map.", 404);
  return NextResponse.json({ ok: true });
}
