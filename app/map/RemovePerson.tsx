"use client";

import { useState } from "react";
import type { MapPerson } from "@/lib/network";

export default function RemovePerson({ person }: { person: MapPerson }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(person.id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this person. Please try again.");
      }
      // Load a fresh graph, goal view and conversation state; stale requests cannot restore the node.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this person.");
      setBusy(false);
    }
  }

  return (
    <section className="remove-person" aria-label="Remove person">
      {!confirming ? (
        <button type="button" className="btn remove-person-button" onClick={() => setConfirming(true)}>
          Remove from my map
        </button>
      ) : (
        <>
          <p>Remove <strong>{person.name}</strong> from your map?</p>
          <p className="side-note">Shared research and other people's maps will be kept. You can add this person again later.</p>
          <div className="remove-person-actions">
            <button type="button" className="btn remove-person-button" disabled={busy} onClick={remove}>
              {busy ? "Removing…" : "Yes, remove"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
