"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/components/api";
import type { PlanData, Suggestion } from "@/lib/goal-view";
import type { Person } from "./SidePanel";

type State = { status: "loading" } | { status: "error" } | { status: "done"; data: PlanData };

/** "Suggest people": the goal agent's plan, plus people in the shared network who fit the goal. */
export default function PlanPanel({ onAdded }: { onAdded: (p: Person) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    fetch("/api/net/plan")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: PlanData) => current && setState({ status: "done", data }))
      .catch(() => current && setState({ status: "error" }));
    return () => {
      current = false;
    };
  }, []);

  async function add(s: Suggestion) {
    setBusyId(s.backendPersonId);
    setErrors(({ [s.backendPersonId]: _gone, ...rest }) => rest);
    // Linking to the existing record is the explicit "yes, that person" answer for a duplicate name.
    const res = await postJson<{ person: Person }>("/api/people", {
      name: s.name,
      university: s.location || "Not specified",
      linkExistingId: s.backendPersonId,
    });
    setBusyId(null);
    if (!res.ok) return setErrors((e) => ({ ...e, [s.backendPersonId]: res.error }));
    onAdded(res.data.person);
    setState((prev) =>
      prev.status === "done" && prev.data.online
        ? { status: "done", data: { ...prev.data, suggestions: prev.data.suggestions.filter((x) => x.backendPersonId !== s.backendPersonId) } }
        : prev,
    );
  }

  if (state.status === "loading") return <p className="side-note">Building your plan…</p>;
  if (state.status === "error" || !state.data.online) {
    return (
      <p className="side-note" role="status">
        The team backend isn&apos;t reachable right now, so there&apos;s no plan yet. It will build automatically once it&apos;s back.
      </p>
    );
  }

  const { plan, suggestions } = state.data;
  return (
    <>
      <p className="side-plan-summary">{plan.summary}</p>

      <p className="side-label">Next steps</p>
      <ol className="plan-list">
        {plan.subgoals.map((s) => (
          <li key={s.text}>
            <strong>{s.text}</strong>
            <span>{s.why}</span>
          </li>
        ))}
      </ol>

      <p className="side-label">Kinds of people to meet</p>
      <ul className="plan-list plan-list-plain">
        {plan.needed_connections.map((c) => (
          <li key={c.kind + c.query}>
            <strong>{c.kind}</strong>
            <span>{c.why}</span>
          </li>
        ))}
      </ul>

      <p className="side-label">In the network, not on your map yet</p>
      {suggestions.length === 0 ? (
        <p className="side-note">Everyone the network suggests for this goal is already on your map.</p>
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((s) => (
            <li key={s.backendPersonId} className="suggestion">
              <div>
                <p className="suggestion-name">{s.name}</p>
                <p className="suggestion-why">{s.why}</p>
                {(s.location || s.companies.length > 0) && (
                  <p className="suggestion-meta">{[s.location, ...s.companies].filter(Boolean).join(" · ")}</p>
                )}
                {errors[s.backendPersonId] && <p className="field-error">{errors[s.backendPersonId]}</p>}
              </div>
              <button type="button" className="btn btn-raised suggestion-add" disabled={busyId === s.backendPersonId} onClick={() => void add(s)}>
                {busyId === s.backendPersonId ? "Adding…" : "Add to my map"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="side-note plan-provider">
        Plan written by {plan.provider === "openai" ? "an AI model" : "the built-in planner"}.
      </p>
    </>
  );
}
