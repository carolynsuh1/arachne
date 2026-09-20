"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/components/api";

const EXAMPLES = [
  "Get into a Berkeley consulting club",
  "Land an internship",
  "Meet a mentor in venture capital",
  "Find a co-founder for my startup",
  "Break into machine learning research",
];

export default function GoalForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [goal, setGoal] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await postJson("/api/goal", { goal });
    if (res.ok) {
      router.push(res.data.redirect ?? "/map");
      router.refresh();
      return;
    }
    setError(res.fields.goal ?? res.error);
    setBusy(false);
  }

  return (
    <div className="auth-card wide">
      <p className="step-label">Step 2 of 3</p>
      <h1 className="auth-title">What do you want to accomplish with your web?</h1>
      <p className="auth-sub">Your goal shapes the paths Arachne looks for. Write it in your own words.</p>

      <form onSubmit={onSubmit} noValidate className="form">
        <label className="field">
          <span className="sr-only">Your goal</span>
          <textarea
            name="goal"
            rows={4}
            maxLength={1000}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Get into a Berkeley consulting club"
            aria-invalid={!!error}
          />
        </label>

        <div className="chips" aria-label="Example goals">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setGoal(ex)}>
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary full" disabled={busy}>
          {busy ? "Saving…" : "Build my map"}
        </button>
      </form>
    </div>
  );
}
