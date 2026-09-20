import { prisma } from "@/lib/db";
import { withBackendGoal } from "@/lib/goal";
import { TeamApiError, getGoalGraph, getGoalPlan, getTracker, teamHealthy, type GoalPlan } from "@/lib/team-api";

export type Group = { name: string; count: number; people: string[] };
export type GoalMatch = {
  personId: string;
  score: number;
  pct: number;
  why: string;
  goalRelevance?: number | null;
  relationshipStrength?: number | null;
  introProbability?: number | null;
  scoreDelta?: number | null;
  rankDelta?: number | null;
  changeReason?: string | null;
  nextAction?: string | null;
};
export type GoalViewData = {
  online: boolean;
  hasGoal: boolean;
  /** People saved locally only (backend was offline when added); the backend can't score them. */
  unscored: number;
  matches: GoalMatch[];
  groups: { universities: Group[]; companies: Group[]; clubs: Group[]; organizations: Group[]; locations: Group[] };
};

export type Suggestion = {
  backendPersonId: string;
  name: string;
  why: string;
  score: number;
  location: string;
  companies: string[];
};
export type PlanData =
  | { online: false; plan: null; suggestions: [] }
  | { online: true; plan: Omit<GoalPlan, "goal">; suggestions: Suggestion[] };

function toGroups(entries: [string, string][]): Group[] {
  const byName = new Map<string, Set<string>>();
  for (const [name, person] of entries) {
    if (!name.trim()) continue;
    byName.set(name, (byName.get(name) ?? new Set()).add(person));
  }
  return [...byName]
    .map(([name, people]) => ({ name, count: people.size, people: [...people].sort() }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * How the people on a user's map line up with their goal, using the team backend's goal matcher
 * (restricted to this user's people) and its network tracker (companies, clubs, organizations, places).
 */
export async function getGoalView(userId: string): Promise<GoalViewData> {
  const rows = await prisma.person.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const linked = rows.filter((r) => r.backendPersonId);

  const view: GoalViewData = {
    online: true,
    hasGoal: !!profile?.goal.trim(),
    unscored: rows.length - linked.length,
    matches: [],
    groups: {
      universities: toGroups(rows.map((r) => [r.university, r.name])),
      companies: [],
      clubs: [],
      organizations: [],
      locations: [],
    },
  };
  if (!view.hasGoal) return view;
  if (linked.length === 0) return { ...view, online: await teamHealthy() };

  const ids = linked.map((r) => r.backendPersonId!);
  try {
    const result = await withBackendGoal(userId, async (goalId) => {
      const [graph, tracker] = await Promise.all([getGoalGraph(goalId, ids), getTracker()]);
      return { graph, tracker };
    });
    if (!result) return { ...view, online: await teamHealthy() };

    const localByBackend = new Map(linked.map((r) => [r.backendPersonId!, r.id]));
    const maxScore = Math.max(0, ...result.graph.ranked.map((r) => r.score));
    view.matches = result.graph.ranked.flatMap((r) => {
      const personId = localByBackend.get(r.id);
      return personId
        ? [{
            personId,
            score: r.score,
            pct: maxScore > 0 ? r.score / maxScore : 0,
            why: r.why,
            goalRelevance: r.goal_relevance,
            relationshipStrength: r.relationship_strength,
            introProbability: r.intro_probability,
            scoreDelta: r.score_delta,
            rankDelta: r.rank_delta,
            changeReason: r.change_reason,
            nextAction: r.next_action,
          }]
        : [];
    });

    const mine = new Set(ids);
    const people = result.tracker.people.filter((p) => mine.has(p.id));
    view.groups.companies = toGroups(people.flatMap((p) => p.companies.map((c): [string, string] => [c, p.name])));
    view.groups.clubs = toGroups(people.flatMap((p) => p.clubs.map((c): [string, string] => [c, p.name])));
    view.groups.organizations = toGroups(
      people.flatMap((p) => p.organizations.map((o): [string, string] => [o, p.name])),
    );
    view.groups.locations = toGroups(people.map((p): [string, string] => [p.location, p.name]));
    return view;
  } catch (error) {
    if (error instanceof TeamApiError) return { ...view, online: false };
    throw error;
  }
}

/** The goal agent's plan plus people elsewhere in the shared network who fit the goal but aren't on this map yet. */
export async function getPlanView(userId: string): Promise<PlanData> {
  const offline: PlanData = { online: false, plan: null, suggestions: [] };
  const onMap = new Set(
    (await prisma.person.findMany({ where: { userId, backendPersonId: { not: null } } })).map((r) => r.backendPersonId!),
  );
  try {
    const result = await withBackendGoal(userId, async (goalId) => {
      const [plan, graph] = await Promise.all([getGoalPlan(goalId), getGoalGraph(goalId)]);
      return { plan, graph };
    });
    if (!result) return offline;

    const { goal: _goal, ...plan } = result.plan;
    const suggestions = result.graph.ranked
      .filter((r) => !onMap.has(r.id))
      .map((r) => {
        const node = result.graph.nodes.find((n) => n.id === `person:${r.id}`);
        return {
          backendPersonId: r.id,
          name: r.name,
          why: r.why,
          score: r.score,
          location: node?.data.location ?? "",
          companies: node?.data.companies ?? [],
        };
      });
    return { online: true, plan, suggestions };
  } catch (error) {
    if (error instanceof TeamApiError) return offline;
    throw error;
  }
}
