import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { TeamApiError, putPersonalProfile } from "@/lib/team-api";

/** A stable UUID per user, so no extra database column is needed to remember their backend profile. */
export function viewerProfileId(userId: string): string {
  const hash = createHash("sha1").update(`arachne-viewer-profile:${userId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Copies the user's own profile (from /profile and /goal) into the team backend's "About me" record, which
 * it uses to personalise research and conversation starters. Idempotent. Returns the backend profile id,
 * or null if the backend is unreachable (callers continue without personalisation).
 */
export async function ensureViewerProfile(userId: string): Promise<string | null> {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return null;
  const id = viewerProfileId(userId);
  const background = [
    profile.workExperience && `Work: ${profile.workExperience}`,
    profile.projects && `Projects: ${profile.projects}`,
    profile.education && `Education: ${profile.education}`,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    await putPersonalProfile(id, {
      name: clip(profile.fullName, 120),
      school: clip(profile.university, 180),
      background: clip(background, 1200),
      interests: clip(profile.interests, 700),
      goals: clip(profile.goal, 700),
      contribution: "",
    });
    return id;
  } catch (error) {
    if (error instanceof TeamApiError) return null;
    throw error;
  }
}
