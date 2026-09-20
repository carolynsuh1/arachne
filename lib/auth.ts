import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { profile: true },
  });
  if (!user) {
    // Stale cookie (e.g. DB reset): drop it.
    session.destroy();
    return null;
  }
  return user;
}

/** For server components: send logged-out visitors to /login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

type UserWithProfile = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Where a logged-in user should be in the onboarding flow: profile -> goal -> map. */
export function nextStep(user: UserWithProfile): "/profile" | "/goal" | "/map" {
  if (!user.profile?.profileDone) return "/profile";
  if (!user.profile.goal) return "/goal";
  return "/map";
}
