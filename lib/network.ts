import { prisma } from "@/lib/db";
import { getTeamGraph, teamHealthy } from "@/lib/team-api";

export type MapPerson = { id: string; name: string; university: string; synced: boolean };
export type MapEdge = { id: string; source: string; target: string; label: string };
export type UserNetwork = { people: MapPerson[]; edges: MapEdge[]; online: boolean };

export const toMapPerson = (p: { id: string; name: string; university: string; backendPersonId: string | null }): MapPerson => ({
  id: p.id,
  name: p.name,
  university: p.university,
  synced: p.backendPersonId !== null,
});

/**
 * A user's map is a view onto the shared team network: only the people this user added are shown,
 * plus whatever relationships the backend knows about between them. If the backend is down the
 * people still appear (they are also saved locally); only the relationship threads are missing.
 */
export async function getUserNetwork(userId: string): Promise<UserNetwork> {
  const rows = await prisma.person.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const people: MapPerson[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    university: p.university,
    synced: p.backendPersonId !== null,
  }));

  const online = await teamHealthy();
  const localByBackendNode = new Map(
    rows.filter((p) => p.backendPersonId).map((p) => [`person:${p.backendPersonId}`, p.id]),
  );
  if (!online || localByBackendNode.size < 2) return { people, edges: [], online };

  try {
    const graph = await getTeamGraph();
    const edges = graph.edges.flatMap((e) => {
      const source = localByBackendNode.get(e.source);
      const target = localByBackendNode.get(e.target);
      return source && target ? [{ id: e.id, source, target, label: e.label }] : [];
    });
    return { people, edges, online };
  } catch {
    return { people, edges: [], online: false };
  }
}
