"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/components/api";

type Person = { id: string; name: string; university: string };

const RING_STEP = 110;
const FIRST_RING = 210;
const X_STRETCH = 1.5; // the canvas is wider than tall
const Y_SQUASH = 0.8;

// Rounded so server and client render identical style strings (avoids hydration mismatches).
const round = (n: number) => Math.round(n * 100) / 100;

/** Deterministic spot for the nth person: rings of 6 around "Me", starting at the top. */
function positionFor(index: number) {
  const ring = Math.floor(index / 6);
  const slot = index % 6;
  const radius = FIRST_RING + ring * RING_STEP;
  const angle = ((-90 + slot * 60 + ring * 30) * Math.PI) / 180;
  const x = round(Math.cos(angle) * radius * X_STRETCH);
  const y = round(Math.sin(angle) * radius * Y_SQUASH);
  return { x, y, ring: radius };
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
  initialPeople,
}: {
  me: { name: string; university: string };
  goal: string;
  initialPeople: Person[];
}) {
  const [people, setPeople] = useState(initialPeople);
  const [open, setOpen] = useState(false);
  const rings = Array.from(new Set(people.map((_, i) => positionFor(i).ring)));

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

      <div className="map-canvas" style={{ minHeight: Math.max(560, Math.ceil(2 * (Math.max(0, ...rings) * Y_SQUASH + 60))) }}>
        <div className="map-origin">
          <div className="map-ring" style={{ width: 220, height: 220 }} />
          {rings.map((r) => (
            <div key={r} className="map-ring" style={{ width: r * 2 * X_STRETCH, height: r * 2 * Y_SQUASH }} />
          ))}

          {people.map((p, i) => {
            const { x, y } = positionFor(i);
            return (
              <div
                key={`t-${p.id}`}
                className="map-thread"
                style={{ width: round(Math.hypot(x, y)), transform: `rotate(${round((Math.atan2(y, x) * 180) / Math.PI)}deg)` }}
              />
            );
          })}

          <div className="node node-me" style={{ left: "50%", top: "50%" }}>
            <span className="node-avatar node-avatar-me">{initials(me.name) || "Me"}</span>
            <span className="node-info">
              <span className="node-name">{me.name}</span>
              <span className="node-sub">Me (You)</span>
            </span>
          </div>

          {people.map((p, i) => {
            const { x, y } = positionFor(i);
            return (
              <div key={p.id} className="node node-new" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}>
                <span className="node-avatar">{initials(p.name)}</span>
                <span className="node-info">
                  <span className="node-name">{p.name}</span>
                  <span className="node-sub">{p.university}</span>
                </span>
              </div>
            );
          })}
        </div>

        {people.length === 0 && (
          <p className="map-empty">This is you. Add a person to start growing your web.</p>
        )}
      </div>

      {open && <AddPersonModal onClose={() => setOpen(false)} onAdded={(p) => { setPeople((prev) => [...prev, p]); setOpen(false); }} />}
    </main>
  );
}

function AddPersonModal({ onClose, onAdded }: { onClose: () => void; onAdded: (p: Person) => void }) {
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setFields({});
    const res = await postJson<{ person: Person }>("/api/people", {
      name: data.get("name"),
      university: data.get("university"),
    });
    if (res.ok) return onAdded(res.data.person);
    setError(res.error);
    setFields(res.fields);
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-person-title">
        <h2 id="add-person-title">Add person</h2>
        <p className="modal-sub">They will appear on your map, linked to you.</p>
        <form onSubmit={onSubmit} noValidate className="form">
          <label className="field">
            <span>Name</span>
            <input ref={nameRef} name="name" required maxLength={100} placeholder="e.g. Elena Rostova" aria-invalid={!!fields.name} />
            {fields.name && <small className="field-error">{fields.name}</small>}
          </label>
          <label className="field">
            <span>University</span>
            <input name="university" required maxLength={120} placeholder="e.g. UC Berkeley" aria-invalid={!!fields.university} />
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
      </div>
    </div>
  );
}
