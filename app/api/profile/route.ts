import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { checkResume, deleteResume, saveResume } from "@/lib/uploads";
import { RESUME_MAX_BYTES, profileSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  // Cheap early rejection before buffering the body.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > RESUME_MAX_BYTES + 256 * 1024) return jsonError("Upload is too large (5 MB resume limit).", 413);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("Invalid form submission.", 400);

  const parsed = profileSchema.safeParse({
    fullName: form.get("fullName") ?? "",
    university: form.get("university") ?? "",
    workExperience: form.get("workExperience") ?? "",
    projects: form.get("projects") ?? "",
    education: form.get("education") ?? "",
    interests: form.get("interests") ?? "",
  });
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));

  const data: Record<string, unknown> = { ...parsed.data, profileDone: true };

  const file = form.get("resume");
  let newPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const check = await checkResume(file);
    if (!check.ok) return jsonError(check.error, 400, { resume: check.error });
    newPath = await saveResume(user.id, check.ext, check.bytes);
    data.resumePath = newPath;
    data.resumeName = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120);
    data.resumeMime = file.type || null;
  }

  const previousPath = user.profile?.resumePath;
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  if (newPath) await deleteResume(previousPath);

  return NextResponse.json({ redirect: user.profile?.goal ? "/map" : "/goal" });
}
