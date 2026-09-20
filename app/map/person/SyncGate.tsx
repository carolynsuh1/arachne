"use client";

import { useState } from "react";
import { postJson } from "@/components/api";
import type { Person } from "../SidePanel";

type Existing = { id: string; name: string; university: string };

/** Shown instead of a feature when the person was saved locally only (the team backend was offline when added). */
export default function SyncGate({ person, onSynced }: { person: Person; onSynced: (p: Person) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<Existing | null>(null);
  const [declined, setDeclined] = useState(false);

  async function sync(linkExistingId?: string) {
    setBusy(true);
    setError("");
    const res = await postJson<{ person: Person }>(`/api/people/${person.id}/sync`, { linkExistingId });
    setBusy(false);
    if (res.ok) return onSynced(res.data.person);
    if (res.status === 409 && res.body.existing) return setExisting(res.body.existing as Existing);
    setError(res.status === 503 ? "The team backend still isn't reachable. Try again in a moment." : res.error);
  }

  if (declined) {
    return (
      <p className="side-note">
        The team network can&apos;t hold two different people with the same name yet, so {person.name} can&apos;t be added
        while another {person.name} exists there.
      </p>
    );
  }

  return (
    <div className="panel-block">
      <p className="side-note">
        {person.name} is saved on this device only (the team backend was offline when they were added). Add them to the
        team network to use this.
      </p>

      {existing ? (
        <>
          <p className="side-blurb">
            <strong>{existing.name}</strong>
            {existing.university ? ` (${existing.university})` : ""} is already in the team network. Is that the same
            person?
          </p>
          <div className="panel-actions">
            <button type="button" className="btn btn-raised" onClick={() => setDeclined(true)}>
              No, different person
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sync(existing.id)}>
              {busy ? "Adding…" : "Yes, same person"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sync()}>
          {busy ? "Adding…" : "Add to the team network"}
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
