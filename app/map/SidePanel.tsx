"use client";

import { useEffect } from "react";
import { PERSON_FEATURES, type Feature } from "@/lib/features";
import type { GoalViewData } from "@/lib/goal-view";
import type { MapPerson } from "@/lib/network";
import GoalViewPanel from "./GoalViewPanel";
import PlanPanel from "./PlanPanel";
import PersonFeaturePanel, { LIVE_PERSON_FEATURES } from "./person/PersonFeaturePanel";

export type Person = MapPerson;

export type PanelView =
  | { kind: "person"; person: Person }
  | { kind: "feature"; feature: Feature; person?: Person };

const TEAM_APP_URL = process.env.NEXT_PUBLIC_TEAM_APP_URL || "http://localhost:5173";

export default function SidePanel({
  view,
  onClose,
  onOpen,
  goalView,
  people,
  onAdded,
  onPersonUpdated,
}: {
  view: PanelView;
  onClose: () => void;
  onOpen: (v: PanelView) => void;
  goalView: GoalViewData | null;
  people: Person[];
  /** A person was added from a suggestion; the map should show them. */
  onAdded: (p: Person) => void;
  /** A person changed (e.g. was synced to the team network); the map and this panel should reflect it. */
  onPersonUpdated: (p: Person) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = view.kind === "person" ? view.person.name : view.feature.label;

  return (
    <aside className="side-panel" role="dialog" aria-label={title}>
      <div className="side-head">
        <div>
          {view.kind === "feature" && view.person ? (
            <button type="button" className="side-back" onClick={() => onOpen({ kind: "person", person: view.person! })}>
              ← {view.person.name}
            </button>
          ) : (
            <p className="side-eyebrow">{view.kind === "person" ? "Person" : "Feature"}</p>
          )}
          <h2>{title}</h2>
          {view.kind === "person" && <p className="side-sub">{view.person.university}</p>}
          {view.kind === "feature" && view.person && <p className="side-sub">For {view.person.name}</p>}
        </div>
        <button type="button" className="side-close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      {view.kind === "person" ? (
        <div className="side-body">
          <p className="side-label">What would you like to do?</p>
          <div className="side-actions">
            {PERSON_FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                className="side-action"
                onClick={() => onOpen({ kind: "feature", feature: f, person: view.person })}
              >
                <span>{f.label}</span>
                <small>{f.blurb}</small>
              </button>
            ))}
          </div>
        </div>
      ) : view.feature.id === "suggest" ? (
        <div className="side-body">
          <p className="side-blurb">{view.feature.blurb}</p>
          <PlanPanel onAdded={onAdded} />
        </div>
      ) : view.feature.id === "braindump" ? (
        <div className="side-body">
          <p className="side-blurb">{view.feature.blurb}</p>
          <p className="side-label">Who was it with?</p>
          {people.length === 0 ? (
            <p className="side-note">Add someone to your map first.</p>
          ) : (
            <div className="side-actions">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="side-action"
                  onClick={() =>
                    onOpen({
                      kind: "feature",
                      feature: PERSON_FEATURES.find((f) => f.id === "person-braindump")!,
                      person: p,
                    })
                  }
                >
                  <span>{p.name}</span>
                  <small>{p.university}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : view.feature.id === "goalviews" ? (
        <div className="side-body">
          <p className="side-blurb">{view.feature.blurb}</p>
          <GoalViewPanel data={goalView} people={people} onSelect={(p) => onOpen({ kind: "person", person: p })} />
        </div>
      ) : view.person && LIVE_PERSON_FEATURES.has(view.feature.id) ? (
        <div className="side-body">
          <p className="side-blurb">{view.feature.blurb}</p>
          <PersonFeaturePanel feature={view.feature} person={view.person} onPersonUpdated={onPersonUpdated} />
        </div>
      ) : (
        <div className="side-body">
          <p className="side-blurb">{view.feature.blurb}</p>

          <div className="side-status">
            <span className="status-pill">Backend ready · not connected yet</span>
            <p>Arrives in phase {view.feature.phase} of the integration plan.</p>
          </div>

          <p className="side-label">Will use</p>
          <ul className="endpoint-list">
            {view.feature.endpoints.map((e) => (
              <li key={e}>
                <code>{e}</code>
              </li>
            ))}
          </ul>

          <p className="side-label">Try it today</p>
          <p className="side-note">
            The team&apos;s app already runs this. Open it and choose <strong>{view.feature.teamNav}</strong>.
          </p>
          <a className="btn btn-raised" href={TEAM_APP_URL} target="_blank" rel="noreferrer">
            Open team app
          </a>
        </div>
      )}
    </aside>
  );
}
