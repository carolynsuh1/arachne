import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { AskResponse, Cited } from "@/lib/ask";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { teamErrorResponse } from "@/lib/person-route";
import { askCopilot, listTeamPeople } from "@/lib/team-api";
import { askSchema } from "@/lib/validation";

/**
 * "Ask your network": the team's copilot answers from the relationship graph. By default it only considers the
 * people on the caller's own map; "network" widens it to everyone in the shared team network. Cited people are
 * mapped back to the caller's map so the UI can highlight and open them.
 */
export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please fix the question.", 400, zodFields(parsed.error));
  const { question, history, scope } = parsed.data;

  const rows = await prisma.person.findMany({ where: { userId: user.id, backendPersonId: { not: null } } });
  const onMap = new Map(rows.map((r) => [r.backendPersonId!, r]));

  if (scope === "map" && onMap.size === 0) {
    return NextResponse.json({
      answer:
        "Nobody on your map is in the team network yet, so there's nothing to search. Add someone, or switch to everyone in the network.",
      cited: [],
      edgeIds: [],
    } satisfies AskResponse);
  }

  try {
    const turn = await askCopilot({ question, history, personIds: scope === "map" ? [...onMap.keys()] : undefined });

    // Universities for people who aren't on the caller's map (only needed for the "network" scope).
    const known = turn.cited_people.some((c) => !onMap.has(c.id))
      ? new Map((await listTeamPeople().catch(() => [])).map((p) => [p.id, p.university]))
      : new Map<string, string>();

    const cited: Cited[] = turn.cited_people.map((c) => {
      const row = onMap.get(c.id);
      return { backendId: c.id, name: c.name, localId: row?.id ?? null, university: row?.university ?? known.get(c.id) ?? "" };
    });
    const edgeIds = turn.highlight_events.flatMap((e) => (e.type === "edge" && e.edge_id ? [e.edge_id] : []));
    return NextResponse.json({ answer: turn.answer, cited, edgeIds } satisfies AskResponse);
  } catch (error) {
    return teamErrorResponse(error);
  }
}
