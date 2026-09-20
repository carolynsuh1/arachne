import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, zodFields } from "@/lib/http";
import { tooManyAttempts } from "@/lib/rateLimit";
import { getSession } from "@/lib/session";
import { credentialsSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (tooManyAttempts(`signup:${ip}`, 10)) return jsonError("Too many attempts. Try again later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));
  const { email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return jsonError("An account with that email already exists. Try logging in.", 409, {
      email: "An account with that email already exists.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({ data: { email, passwordHash, profile: { create: {} } } });
  } catch {
    // Lost a race with another signup for the same email (unique constraint).
    return jsonError("An account with that email already exists. Try logging in.", 409);
  }

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return NextResponse.json({ redirect: "/profile" }, { status: 201 });
}
