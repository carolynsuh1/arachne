import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { nextStep } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, zodFields } from "@/lib/http";
import { tooManyAttempts } from "@/lib/rateLimit";
import { getSession } from "@/lib/session";
import { credentialsSchema } from "@/lib/validation";

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("arachne-dummy-password", 12);

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));
  const { email, password } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (tooManyAttempts(`login:${ip}:${email}`, 8)) return jsonError("Too many attempts. Try again later.", 429);

  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return jsonError("Incorrect email or password.", 401);

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return NextResponse.json({ redirect: nextStep(user) });
}
