"use client";

import { useEffect, useState } from "react";
import { getJson, postJson } from "@/components/api";
import type { ResearchResult } from "@/lib/team-api";
import type { Person } from "../SidePanel";

const httpsHref = (value?: string) => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

/** Public-web research on one person, plus conversation starters that use the user's own profile and goal. */
export default function ResearchPanel({ person }: { person: Person }) {
  const [saved, setSaved] = useState<ResearchResult | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState<"research" | "questions" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    getJson<{ saved: ResearchResult | null }>(`/api/net/people/${person.id}/research`).then((res) => {
      if (!current) return;
      if (res.ok) setSaved(res.data.saved);
      else {
        setSaved(null);
        setError(res.status === 503 ? "The team backend isn't reachable right now." : res.error);
      }
    });
    return () => {
      current = false;
    };
  }, [person.id]);

  async function run(profileUrl?: string) {
    setConfirming(false);
    setBusy("research");
    setError("");
    const res = await postJson<{ result: ResearchResult }>(`/api/net/people/${person.id}/research`, { profileUrl });
    setBusy(null);
    if (res.ok) {
      setSaved(res.data.result);
      if (res.data.result.status === "ready") window.dispatchEvent(new CustomEvent("person-researched", { detail: person.id }));
      return;
    }
    setError(
      res.body.code === "backend_error"
        ? `${res.error} The research service needs FIRECRAWL_API_KEY and OPENAI_API_KEY in research-service/.env; start it with "npm run dev:all -- --research".`
        : res.error,
    );
  }

  async function regenerateQuestions(briefId: string) {
    setBusy("questions");
    setError("");
    const res = await postJson<{ result: ResearchResult }>(`/api/net/people/${person.id}/questions`, { briefId });
    setBusy(null);
    if (res.ok) setSaved(res.data.result);
    else setError(res.error);
  }

  if (saved === undefined) return <p className="side-note">Loading saved research…</p>;

  return (
    <div className="panel-block">
      {saved?.status === "ready" ? (
        <ReadyBrief result={saved} busy={busy} onQuestions={regenerateQuestions} />
      ) : saved ? (
        <Candidates result={saved} busy={busy !== null} onPick={(url) => void run(url)} />
      ) : (
        <p className="side-note">No research on {person.name} yet.</p>
      )}

      {busy === "research" && (
        <p className="side-note" role="status">
          Checking public sources. This can take up to two minutes…
        </p>
      )}
      {busy === "questions" && (
        <p className="side-note" role="status">
          Writing questions that connect your background and goal…
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {!busy &&
        (confirming ? (
          <div className="confirm-box">
            <p className="side-note">
              Research uses paid search and AI providers and can take up to two minutes. It looks for {person.name} at{" "}
              {person.university || "their university"} using public sources only.
            </p>
            <div className="panel-actions">
              <button type="button" className="btn btn-raised" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void run()}>
                Run research
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-raised" onClick={() => setConfirming(true)}>
            {saved ? "Run research again" : "Run research"}
          </button>
        ))}
    </div>
  );
}

function ReadyBrief({
  result,
  busy,
  onQuestions,
}: {
  result: ResearchResult;
  busy: "research" | "questions" | null;
  onQuestions: (briefId: string) => void;
}) {
  return (
    <>
      <p className="side-plan-summary">
        {result.person}
        {result.saved ? " · saved brief" : ""}
      </p>

      {result.questions && result.questions.length > 0 && (
        <>
          <p className="side-label">Conversation starters</p>
          <ol className="plan-list">
            {result.questions.map((q, i) => (
              <li key={i}>
                <strong>{q.text}</strong>
                {q.viewerEvidence && <span>Why it fits you: {q.viewerEvidence}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {result.brief_id && (
        <button
          type="button"
          className="btn btn-raised"
          disabled={busy !== null}
          onClick={() => onQuestions(result.brief_id!)}
        >
          {result.questions?.length ? "Rewrite questions with my profile" : "Write questions with my profile"}
        </button>
      )}

      {result.facts && result.facts.length > 0 && (
        <>
          <p className="side-label">What we found</p>
          <ul className="plan-list plan-list-plain">
            {result.facts.map((f) => (
              <li key={f.id}>
                <strong>{f.claim}</strong>
                {f.evidence && (
                  <details>
                    <summary>Source passage</summary>
                    <span>{f.evidence}</span>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.sources && result.sources.length > 0 && (
        <>
          <p className="side-label">Sources</p>
          <ul className="source-list">
            {result.sources.map((s) => {
              const href = httpsHref(s.url);
              return (
                <li key={s.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {s.title || href}
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {[...(result.warnings ?? []), ...(result.uncertainties ?? [])].length > 0 && (
        <details className="side-note">
          <summary>Source availability and uncertainties</summary>
          <ul className="source-list">
            {[...(result.warnings ?? []), ...(result.uncertainties ?? [])].map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="side-note plan-provider">Claims come from public pages and aren&apos;t independently verified.</p>
    </>
  );
}

function Candidates({ result, busy, onPick }: { result: ResearchResult; busy: boolean; onPick: (url: string) => void }) {
  const candidates = result.candidates ?? [];
  return (
    <>
      <p className="side-blurb">
        {candidates.length > 0
          ? "There are several possible matches. Pick the right person and we'll build the brief from that page."
          : "Not enough public information was found to build a reliable brief."}
      </p>
      {candidates.map((c) => {
        const href = httpsHref(c.url);
        return (
          <div key={c.url} className="suggestion">
            <div>
              {href ? (
                <a className="suggestion-name" href={href} target="_blank" rel="noreferrer">
                  {c.title || href}
                </a>
              ) : (
                <p className="suggestion-name">{c.title}</p>
              )}
              {c.description && <p className="suggestion-why">{c.description}</p>}
            </div>
            <button type="button" className="btn btn-raised suggestion-add" disabled={busy || !href} onClick={() => onPick(c.url)}>
              This one
            </button>
          </div>
        );
      })}
      {(result.uncertainties ?? []).map((u, i) => (
        <p key={i} className="side-note">
          {u}
        </p>
      ))}
    </>
  );
}
