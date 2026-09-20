"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/components/api";
import type { Person } from "../SidePanel";

type Message = { role: "user" | "assistant"; content: string };
type Feedback = { topics_connected: string; missed_opportunity: string; suggested_follow_up: string; next_action: string };

/** Rehearse a conversation with an AI stand-in for this person, then get feedback on how it went. */
export default function PracticePanel({ person }: { person: Person }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // The stand-in speaks first. The opener is asked for once, when the panel opens.
  useEffect(() => {
    let current = true;
    postJson<{ reply: string }>(`/api/net/people/${person.id}/practice/turn`, { message: "Hello", history: [] }).then((res) => {
      if (!current) return;
      setBusy(false);
      if (res.ok) setMessages([{ role: "assistant", content: res.data.reply }]);
      else setError(res.error);
    });
    return () => {
      current = false;
    };
  }, [person.id]);

  useEffect(() => {
    // Block body on purpose: an effect must not return anything but a cleanup function.
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, feedback]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setDraft("");
    setBusy(true);
    setError("");
    const res = await postJson<{ reply: string }>(`/api/net/people/${person.id}/practice/turn`, { message: text, history });
    setBusy(false);
    if (res.ok) setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    else setError(res.error);
  }

  async function finish() {
    setBusy(true);
    setError("");
    const res = await postJson<{ feedback: Feedback }>(`/api/net/people/${person.id}/practice/feedback`, { transcript: messages });
    setBusy(false);
    if (res.ok) setFeedback(res.data.feedback);
    else setError(res.error);
  }

  function restart() {
    setMessages([]);
    setFeedback(null);
    setError("");
    setBusy(true);
    postJson<{ reply: string }>(`/api/net/people/${person.id}/practice/turn`, { message: "Hello", history: [] }).then((res) => {
      setBusy(false);
      if (res.ok) setMessages([{ role: "assistant", content: res.data.reply }]);
      else setError(res.error);
    });
  }

  const hasUserMessage = messages.some((m) => m.role === "user");

  return (
    <div className="panel-block">
      <div className="chat" aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className={m.role === "user" ? "chat-line chat-user" : "chat-line chat-them"}>
            <span className="chat-who">{m.role === "user" ? "You" : person.name}</span>
            {m.content}
          </p>
        ))}
        {busy && messages.length > 0 && !feedback && <p className="side-note">{person.name} is thinking…</p>}
        <div ref={endRef} />
      </div>

      {feedback ? (
        <div className="feedback">
          <p className="side-label">How it went</p>
          <p className="side-blurb">{feedback.topics_connected}</p>
          <p className="side-label">Missed opportunity</p>
          <p className="side-blurb">{feedback.missed_opportunity}</p>
          <p className="side-label">Suggested follow-up</p>
          <p className="side-blurb">{feedback.suggested_follow_up}</p>
          <p className="side-label">Next action</p>
          <p className="side-blurb">{feedback.next_action}</p>
          <button type="button" className="btn btn-raised" onClick={restart}>
            Practice again
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="chat-form">
          <label className="field">
            <span className="sr-only">Your message</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Say something to ${person.name.split(" ")[0]}…`}
              disabled={busy && messages.length === 0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </label>
          <div className="panel-actions">
            <button type="button" className="btn btn-raised" disabled={busy || !hasUserMessage} onClick={() => void finish()}>
              End and get feedback
            </button>
            <button className="btn btn-primary" disabled={busy || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="side-note plan-provider">Practice replies are scripted from what the network knows about them; it&apos;s a warm-up, not a prediction.</p>
    </div>
  );
}
