"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/components/api";
import type { Cited } from "@/lib/ask";
import type { Person } from "./SidePanel";

export type AskMessage = { role: "user" | "assistant"; content: string; cited?: Cited[]; edgeIds?: string[] };
export type AskState = { messages: AskMessage[]; scope: "map" | "network" };
export const EMPTY_ASK: AskState = { messages: [], scope: "map" };

/** "Ask your network": chat with the team's copilot about the relationships on your map. */
export default function AskPanel({
  state,
  onChange,
  people,
  goal,
  onOpenPerson,
  onAdded,
}: {
  state: AskState;
  onChange: (next: AskState | ((prev: AskState) => AskState)) => void;
  people: Person[];
  goal: string;
  onOpenPerson: (p: Person) => void;
  onAdded: (p: Person) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const byId = new Map(people.map((p) => [p.id, p]));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history = state.messages.slice(-20).map(({ role, content }) => ({ role, content }));
    onChange((s) => ({ ...s, messages: [...s.messages, { role: "user", content: text }] }));
    setDraft("");
    setBusy(true);
    setError("");
    const res = await postJson<{ answer: string; cited: Cited[]; edgeIds: string[] }>("/api/net/ask", {
      question: text,
      history,
      scope: state.scope,
    });
    setBusy(false);
    if (!res.ok) {
      return setError(res.status === 503 ? "The team backend isn't reachable right now." : res.error);
    }
    onChange((s) => ({
      ...s,
      messages: [...s.messages, { role: "assistant", content: res.data.answer, cited: res.data.cited, edgeIds: res.data.edgeIds }],
    }));
  }

  async function addToMap(c: Cited) {
    setAddingId(c.backendId);
    setError("");
    const res = await postJson<{ person: Person }>("/api/people", {
      name: c.name,
      university: c.university || "Not specified",
      linkExistingId: c.backendId,
    });
    setAddingId(null);
    if (!res.ok) return setError(res.error);
    const person = res.data.person;
    onAdded(person);
    // The chip now points at the person on the map.
    onChange((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        cited: m.cited?.map((x) => (x.backendId === c.backendId ? { ...x, localId: person.id } : x)),
      })),
    }));
  }

  const prompts = [
    "Who should I talk to first?",
    `Who can help me with my goal: ${goal}?`,
    "How are the people on my map connected?",
  ];

  return (
    <div className="panel-block">
      <div className="scope" role="group" aria-label="Who to search">
        {(
          [
            ["map", "People on my map"],
            ["network", "Everyone in the network"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            aria-pressed={state.scope === value}
            className={state.scope === value ? "scope-btn active" : "scope-btn"}
            onClick={() => onChange((s) => ({ ...s, scope: value }))}
          >
            {text}
          </button>
        ))}
      </div>
      {state.scope === "network" && (
        <p className="side-note">
          This also searches people other users added to the shared network, including notes saved about them.
        </p>
      )}

      {state.messages.length === 0 && (
        <div className="chips">
          {prompts.map((p) => (
            <button key={p} type="button" className="chip" disabled={busy} onClick={() => void ask(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="chat" aria-live="polite">
        {state.messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "chat-line chat-user" : "chat-line chat-them"}>
            <span className="chat-who">{m.role === "user" ? "You" : "Your network"}</span>
            {m.content}
            {m.cited && m.cited.length > 0 && (
              <span className="cite-row">
                {m.cited.map((c) => {
                  const person = c.localId ? byId.get(c.localId) : undefined;
                  return person ? (
                    <button key={c.backendId} type="button" className="cite" onClick={() => onOpenPerson(person)}>
                      {c.name}
                    </button>
                  ) : (
                    <button
                      key={c.backendId}
                      type="button"
                      className="cite cite-add"
                      disabled={addingId === c.backendId}
                      onClick={() => void addToMap(c)}
                      title="Not on your map yet"
                    >
                      {addingId === c.backendId ? "Adding…" : `+ ${c.name}`}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
        ))}
        {busy && <p className="side-note">Looking through your network…</p>}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label className="field">
          <span className="sr-only">Your question</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about the people you know…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>
        <div className="panel-actions">
          {state.messages.length > 0 && (
            <button type="button" className="btn btn-raised" disabled={busy} onClick={() => onChange((s) => ({ ...s, messages: [] }))}>
              Clear
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !draft.trim()}>
            Ask
          </button>
        </div>
      </form>
      <p className="side-note plan-provider">
        Answers are built from the relationships and notes in the network, not from the internet. Cited people glow on the map.
      </p>
    </div>
  );
}
