"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/components/api";
import { GLOBAL_FEATURES } from "@/lib/features";
import type { GoalViewData } from "@/lib/goal-view";
import type { MapEdge, MapPerson, UserNetwork } from "@/lib/network";
import SidePanel, { type PanelView } from "./SidePanel";

const RING_STEP = 110;
const FIRST_RING = 210;
const MAX_X_STRETCH = 1.5; // the canvas is wider than tall
const Y_SQUASH = 0.8;
const NODE_HALF_WIDTH = 110; // room to keep a whole pill inside the canvas

// Rounded so server and client render identical style strings (avoids hydration mismatches).
const round = (n: number) => Math.round(n * 100) / 100;

/** Deterministic spot for the nth person: rings of 6 around "Me", starting at the top. */
function positionFor(index: number, xStretch: number) {
  const ring = Math.floor(index / 6);
  const slot = index % 6;
  const radius = FIRST_RING + ring * RING_STEP;
  const angle = ((-90 + slot * 60 + ring * 30) * Math.PI) / 180;
  const x = round(Math.cos(angle) * radius * xStretch);
  const y = round(Math.sin(angle) * radius * Y_SQUASH);
  return { x, y, ring: radius };
}

/** A line from (x1,y1) to (x2,y2), drawn as a rotated element like the Figma connection threads. */
function lineStyle(x1: number, y1: number, x2: number, y2: number) {
  return {
    left: x1,
    top: y1,
    width: round(Math.hypot(x2 - x1, y2 - y1)),
    transform: `rotate(${round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI)}deg)`,
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function MapClient({
  me,
  goal,
  initial,
}: {
  me: { name: string; university: string };
  goal: string;
  initial: UserNetwork;
}) {
  const [people, setPeople] = useState<MapPerson[]>(initial.people);
  const [edges, setEdges] = useState<MapEdge[]>(initial.edges);
  const [online, setOnline] = useState(initial.online);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelView | null>(null);
  const [goalView, setGoalView] = useState<GoalViewData | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Keep the outermost ring inside the canvas: squeeze the horizontal spread on narrow windows.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const outerRadius = FIRST_RING + Math.floor(Math.max(0, people.length - 1) / 6) * RING_STEP;
  const xStretch = canvasWidth
    ? Math.max(0.5, Math.min(MAX_X_STRETCH, (canvasWidth / 2 - NODE_HALF_WIDTH) / outerRadius))
    : MAX_X_STRETCH;
  const rings = Array.from(new Set(people.map((_, i) => positionFor(i, xStretch).ring)));
  const unsynced = people.filter((p) => !p.synced).length;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/net/graph").catch(() => null);
    if (!res?.ok) return setOnline(false);
    const network: UserNetwork = await res.json();
    setPeople(network.people);
    setEdges(network.edges);
    setOnline(network.online);
  }, []);

  // How well each person fits the goal (from the team backend). Runs on load and after the map changes.
  const refreshGoalView = useCallback(async () => {
    const res = await fetch("/api/net/goal-view").catch(() => null);
    if (res?.ok) setGoalView(await res.json());
  }, []);
  useEffect(() => {
    void refreshGoalView();
  }, [refreshGoalView]);

  const matchById = new Map((goalView?.matches ?? []).map((m) => [m.personId, m]));
  const strongMatchIds = new Set(
    (goalView?.matches ?? []).filter((m) => m.score > 0).slice(0, 3).map((m) => m.personId),
  );

  function personUpdated(p: MapPerson) {
    setPeople((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setPanel((prev) => (prev && prev.kind === "feature" && prev.person?.id === p.id ? { ...prev, person: p } : prev));
    void refresh();
    void refreshGoalView();
  }

  function addedPerson(p: MapPerson) {
    setPeople((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    void refresh();
    void refreshGoalView();
  }

  const spot = new Map(people.map((p, i) => [p.id, positionFor(i, xStretch)]));

  return (
    <main className="map-main">
      <div className="map-toolbar">
        <div>
          <p className="map-eyebrow">Your goal</p>
          <p className="map-goal">{goal}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          + Add person
        </button>
      </div>

      <div className="feature-bar" role="toolbar" aria-label="Network tools">
        {GLOBAL_FEATURES.map((f) => (
          <button
            key={f.id}
            type="button"
            className={f.id === "talk" ? "feature-btn feature-btn-talk" : "feature-btn"}
            aria-pressed={panel?.kind === "feature" && panel.feature.id === f.id}
            onClick={() => setPanel({ kind: "feature", feature: f })}
          >
            {f.id === "talk" && <span className="talk-dot" aria-hidden />}
            {f.label}
          </button>
        ))}
      </div>

      {!online && (
        <p className="map-notice" role="status">
          The team backend is offline, so the map is showing your saved people without their relationships. Anyone you
          add now is saved locally.
        </p>
      )}
      {online && unsynced > 0 && (
        <p className="map-notice" role="status">
          {unsynced} {unsynced === 1 ? "person is" : "people are"} saved locally only (added while the team backend was
          offline).
        </p>
      )}

      <div ref={canvasRef} className="map-canvas" style={{ minHeight: Math.max(560, Math.ceil(2 * (Math.max(0, ...rings) * Y_SQUASH + 60))) }}>
        <div className="map-origin">
          <div className="map-ring" style={{ width: 220, height: 220 }} />
          {rings.map((r) => (
            <div key={r} className="map-ring" style={{ width: round(r * 2 * xStretch), height: r * 2 * Y_SQUASH }} />
          ))}

          {people.map((p) => {
            const { x, y } = spot.get(p.id)!;
            return <div key={`t-${p.id}`} className="map-thread" style={lineStyle(0, 0, x, y)} />;
          })}

          {edges.map((e) => {
            const a = spot.get(e.source);
            const b = spot.get(e.target);
            if (!a || !b) return null;
            return <div key={e.id} className="map-link" style={lineStyle(a.x, a.y, b.x, b.y)} />;
          })}

          <div className="node node-me" style={{ left: "50%", top: "50%" }}>
            <span className="node-avatar node-avatar-me">{initials(me.name) || "Me"}</span>
            <span className="node-info">
              <span className="node-name">{me.name}</span>
              <span className="node-sub">Me (You)</span>
            </span>
          </div>

          {people.map((p) => {
            const { x, y } = spot.get(p.id)!;
            const match = matchById.get(p.id);
            const matchClass = strongMatchIds.has(p.id) ? " node-match-strong" : match && match.score > 0 ? " node-match" : "";
            return (
              <button
                key={p.id}
                type="button"
                className={`node node-person node-new${matchClass}${panel && "person" in panel && panel.person?.id === p.id ? " node-selected" : ""}`}
                style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
                onClick={() => setPanel({ kind: "person", person: p })}
                title={match && match.score > 0 ? `Goal match: ${match.why}` : undefined}
                aria-label={`${p.name}, ${p.university}.${match && match.score > 0 ? ` Goal match: ${match.why}` : ""} Open actions`}
              >
                <span className="node-avatar">{initials(p.name)}</span>
                <span className="node-info">
                  <span className="node-name">{p.name}</span>
                  <span className="node-sub">{p.university}</span>
                </span>
              </button>
            );
          })}
        </div>

        {people.length === 0 && <p className="map-empty">This is you. Add a person to start growing your web.</p>}
        {(edges.length > 0 || strongMatchIds.size > 0) && (
          <p className="map-legend">
            <span className="legend-line legend-thread" /> your contacts
            {edges.length > 0 && (
              <>
                <span className="legend-line legend-link" /> relationships in the team network
              </>
            )}
            {strongMatchIds.size > 0 && (
              <>
                <span className="legend-dot" /> closest to your goal
              </>
            )}
          </p>
        )}
      </div>

      {panel && (
        <SidePanel
          view={panel}
          onClose={() => setPanel(null)}
          onOpen={setPanel}
          goalView={goalView}
          people={people}
          onAdded={addedPerson}
          onPersonUpdated={personUpdated}
        />
      )}

      {open && (
        <AddPersonModal
          onClose={() => setOpen(false)}
          onAdded={(p) => {
            addedPerson(p);
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

type Existing = { id: string; name: string; university: string };

function AddPersonModal({ onClose, onAdded }: { onClose: () => void; onAdded: (p: MapPerson) => void }) {
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Existing | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(linkExistingId?: string) {
    setBusy(true);
    setError("");
    setFields({});
    const res = await postJson<{ person: MapPerson }>("/api/people", { name, university, linkExistingId });
    if (res.ok) return onAdded(res.data.person);
    if (res.status === 409 && res.body.existing) {
      setExisting(res.body.existing as Existing);
    } else {
      setError(res.error);
      setFields(res.fields);
    }
    setBusy(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-person-title">
        <h2 id="add-person-title">Add person</h2>

        {existing ? (
          <div className="form">
            <p className="modal-sub">
              <strong>{existing.name}</strong>
              {existing.university ? ` (${existing.university})` : ""} is already in the team&apos;s network. Is this the
              same person you mean?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-raised"
                onClick={() => {
                  setExisting(null);
                  nameRef.current?.focus();
                }}
              >
                No, different person
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit(existing.id)}>
                {busy ? "Adding…" : "Yes, add them"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="modal-sub">They will appear on your map, linked to you.</p>
            <form onSubmit={onSubmit} noValidate className="form">
              <label className="field">
                <span>Name</span>
                <input
                  ref={nameRef}
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="e.g. Elena Rostova"
                  aria-invalid={!!fields.name}
                />
                {fields.name && <small className="field-error">{fields.name}</small>}
              </label>
              <label className="field">
                <span>University</span>
                <input
                  name="university"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="e.g. UC Berkeley"
                  aria-invalid={!!fields.university}
                />
                {fields.university && <small className="field-error">{fields.university}</small>}
              </label>
              {error && !fields.name && !fields.university && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-raised" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Adding…" : "Add to map"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
