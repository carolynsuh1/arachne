"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, patchJson, postJson } from "@/components/api";
import type { BrainDumpCard, FollowUp, Introduction } from "@/lib/team-api";
import type { Person } from "../SidePanel";

const label = (category: string) => {
  const text = category.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type Step =
  | { name: "write" }
  | { name: "review"; cards: BrainDumpCard[]; introductions: (Introduction & { include: boolean })[]; provider: string }
  | { name: "saved"; summary: string; reminders: number; createdPeople: string[] };

/** Type what you remember about a conversation; review what it found; save it as notes and follow-ups. */
export default function BrainDumpPanel({ person }: { person: Person }) {
  const [step, setStep] = useState<Step>({ name: "write" });
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  const loadFollowUps = useCallback(async () => {
    const res = await getJson<{ followUps: FollowUp[] }>(`/api/net/people/${person.id}/followups`);
    if (res.ok) setFollowUps(res.data.followUps);
  }, [person.id]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  async function extract() {
    setBusy(true);
    setError("");
    const res = await postJson<{ extraction: { cards: BrainDumpCard[]; introductions: Introduction[]; provider: string } }>(
      `/api/net/people/${person.id}/brain-dump/extract`,
      { transcript },
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const { cards, introductions, provider } = res.data.extraction;
    // Introductions can create new people in the shared network, so they start unticked.
    setStep({ name: "review", cards, introductions: introductions.map((i) => ({ ...i, include: false })), provider });
  }

  async function save() {
    if (step.name !== "review") return;
    setBusy(true);
    setError("");
    const res = await postJson<{ reminders: number; createdPeople: string[]; summary: string }>(
      `/api/net/people/${person.id}/brain-dump/confirm`,
      {
        transcript,
        cards: step.cards,
        introductions: step.introductions
          .filter((i) => i.include)
          .map(({ include: _include, ...rest }) => rest),
      },
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setStep({ name: "saved", summary: res.data.summary, reminders: res.data.reminders, createdPeople: res.data.createdPeople });
    setTranscript("");
    void loadFollowUps();
  }

  async function act(id: string, action: "done" | "dismiss" | "snooze", days = 1) {
    const res = await patchJson(`/api/net/followups/${id}`, { action, days });
    if (res.ok) void loadFollowUps();
    else setError(res.error);
  }

  return (
    <div className="panel-block">
      {step.name === "write" && (
        <>
          <label className="field">
            <span>What do you remember about your conversation with {person.name}?</span>
            <textarea
              rows={6}
              maxLength={10000}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. She told me she's working on robot navigation. I should talk to her friend Priya. I promised to send her my project."
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || !transcript.trim()} onClick={() => void extract()}>
            {busy ? "Reading your notes…" : "Find the important parts"}
          </button>
        </>
      )}

      {step.name === "review" && (
        <>
          <p className="side-note">
            Untick anything that isn&apos;t right. Nothing is saved until you press Save.{" "}
            {step.provider === "openai" ? "" : "(Extracted by the built-in reader.)"}
          </p>
          <ul className="card-list">
            {step.cards.map((card, i) => (
              <li key={i}>
                <label className="check-card">
                  <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={(e) =>
                      setStep({ ...step, cards: step.cards.map((c, j) => (j === i ? { ...c, selected: e.target.checked } : c)) })
                    }
                  />
                  <span>
                    <small>{label(card.category)}</small>
                    {card.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {step.introductions.length > 0 && (
            <>
              <p className="side-label">People they mentioned</p>
              <p className="side-note">Ticking one adds them to the shared team network and links them to {person.name}.</p>
              <ul className="card-list">
                {step.introductions.map((intro, i) => (
                  <li key={intro.name + i}>
                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={intro.include}
                        onChange={(e) =>
                          setStep({
                            ...step,
                            introductions: step.introductions.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)),
                          })
                        }
                      />
                      <span>
                        <small>{intro.affiliation || "Introduction"}</small>
                        {intro.name}: {intro.context}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="panel-actions">
            <button type="button" className="btn btn-raised" disabled={busy} onClick={() => setStep({ name: "write" })}>
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !step.cards.some((c) => c.selected)} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}

      {step.name === "saved" && (
        <>
          <p className="side-blurb">{step.summary}</p>
          <p className="side-note">
            Saved.{" "}
            {step.reminders > 0 ? `${step.reminders} follow-up${step.reminders === 1 ? "" : "s"} added below. ` : ""}
            {step.createdPeople.length > 0 ? `Added to the network: ${step.createdPeople.join(", ")}.` : ""}
          </p>
          <button type="button" className="btn btn-raised" onClick={() => setStep({ name: "write" })}>
            Add another note
          </button>
        </>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {followUps.length > 0 && (
        <>
          <p className="side-label">Follow-ups for {person.name}</p>
          <ul className="card-list">
            {followUps.map((f) => (
              <li key={f.id} className="followup">
                <p>{f.action}</p>
                <small>
                  {f.bucket === "snoozed" ? "Snoozed. " : ""}
                  {f.due_at ? `Due ${new Date(f.due_at).toLocaleDateString()}. ` : ""}
                  {f.why}
                </small>
                <div className="followup-actions">
                  <button type="button" onClick={() => void act(f.id, "done")}>
                    Done
                  </button>
                  <button type="button" onClick={() => void act(f.id, "snooze", 1)}>
                    Snooze 1 day
                  </button>
                  <button type="button" onClick={() => void act(f.id, "dismiss")}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
