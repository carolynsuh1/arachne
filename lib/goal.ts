import { prisma } from "@/lib/db";
import { TeamApiError, runGoalAgent } from "@/lib/team-api";

// Concurrent requests for the same user share one agent run instead of each creating a goal.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Makes sure the user's goal exists in the team backend (which also builds its plan) and returns its id.
 * Re-runs the agent only when the goal text changed, or with force (e.g. the backend database was reset).
 * Returns null when there is no goal yet or the backend is unreachable.
 */
export function ensureBackendGoal(userId: string, options: { force?: boolean } = {}): Promise<string | null> {
  const running = inFlight.get(userId);
  if (running && !options.force) return running;
  const run = createIfNeeded(userId, options.force ?? false).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

async function createIfNeeded(userId: string, force: boolean): Promise<string | null> {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const goal = profile?.goal.trim();
  if (!profile || !goal) return null;
  if (!force && profile.backendGoalId && profile.backendGoalText === goal) return profile.backendGoalId;

  try {
    const plan = await runGoalAgent(goal);
    await prisma.profile.update({ where: { userId }, data: { backendGoalId: plan.goal.id, backendGoalText: goal } });
    return plan.goal.id;
  } catch (error) {
    if (error instanceof TeamApiError) return null;
    throw error;
  }
}

/**
 * Runs `fn` with the user's backend goal id. If the backend no longer knows that goal (404, e.g. its
 * database was reset), recreates it once and retries. Returns null if there is no goal or no backend.
 * Network errors from `fn` propagate so callers can report "offline".
 */
export async function withBackendGoal<T>(userId: string, fn: (goalId: string) => Promise<T>): Promise<T | null> {
  const goalId = await ensureBackendGoal(userId);
  if (!goalId) return null;
  try {
    return await fn(goalId);
  } catch (error) {
    if (!(error instanceof TeamApiError) || error.status !== 404) throw error;
    const fresh = await ensureBackendGoal(userId, { force: true });
    return fresh ? await fn(fresh) : null;
  }
}
