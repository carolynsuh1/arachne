"use client";

import type { Group, GoalViewData } from "@/lib/goal-view";
import type { Person } from "./SidePanel";

const SECTIONS: { key: keyof GoalViewData["groups"]; title: string }[] = [
  { key: "universities", title: "Universities" },
  { key: "companies", title: "Companies" },
  { key: "clubs", title: "Clubs" },
  { key: "organizations", title: "Other organizations" },
  { key: "locations", title: "Places" },
];

/** "Goal views": how the people on your map line up with your goal, and who they group by. */
export default function GoalViewPanel({
  data,
  people,
  onSelect,
}: {
  data: GoalViewData | null;
  people: Person[];
  onSelect: (p: Person) => void;
}) {
  if (!data) return <p className="side-note">Scoring your network…</p>;
  if (!data.hasGoal) return <p className="side-note">Set a goal first, and matches will show up here.</p>;

  const byId = new Map(people.map((p) => [p.id, p]));
  const ranked = data.matches.flatMap((m) => (byId.has(m.personId) ? [{ ...m, person: byId.get(m.personId)! }] : []));

  return (
    <>
      {!data.online && (
        <p className="side-note" role="status">
          The team backend isn&apos;t reachable, so match scores are unavailable. Groups below come from what&apos;s saved
          locally.
        </p>
      )}

      {data.online && (
        <>
          <p className="side-label">Closest to your goal</p>
          {ranked.length === 0 ? (
            <p className="side-note">Add people to your map to see how they match.</p>
          ) : (
            <ul className="match-list">
              {ranked.map(({ person, score, pct, why }) => (
                <li key={person.id}>
                  <button type="button" className="match-row" onClick={() => onSelect(person)}>
                    <span className="match-top">
                      <span className="match-name">{person.name}</span>
                      <span className="match-score">{score > 0 ? `${Math.round(pct * 100)}%` : "—"}</span>
                    </span>
                    <span className="match-bar" aria-hidden>
                      <span style={{ width: `${Math.max(score > 0 ? 6 : 0, Math.round(pct * 100))}%` }} />
                    </span>
                    <span className="match-why">{why}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ranked.length > 0 && (
            <p className="side-note">Each percentage compares a person to your best match.</p>
          )}
          {data.unscored > 0 && (
            <p className="side-note">
              {data.unscored} {data.unscored === 1 ? "person is" : "people are"} saved locally only and can&apos;t be scored yet.
            </p>
          )}
        </>
      )}

      {SECTIONS.map(({ key, title }) => {
        const groups: Group[] = data.groups[key];
        if (groups.length === 0) return null;
        return (
          <div key={key}>
            <p className="side-label">{title}</p>
            <ul className="group-list">
              {groups.map((g) => (
                <li key={g.name}>
                  <span className="group-name">{g.name}</span>
                  <span className="group-count">{g.count}</span>
                  <span className="group-people">{g.people.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
