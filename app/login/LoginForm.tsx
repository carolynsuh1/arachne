"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/components/api";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setFields({});
    const res = await postJson(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
      email: data.get("email"),
      password: data.get("password"),
      ...(mode === "signup" ? { linkedinUrl: data.get("linkedinUrl") || "" } : {}),
    });
    if (res.ok) {
      router.push(res.data.redirect ?? "/profile");
      router.refresh();
      return;
    }
    setError(res.error);
    setFields(res.fields);
    setBusy(false);
  }

  const isLogin = mode === "login";

  return (
    <div className="auth-card">
      <h1 className="auth-title">{isLogin ? "Welcome back" : "Create your account"}</h1>
      <p className="auth-sub">
        {isLogin ? "Log in to keep mapping your network." : "Sign up to start mapping your network."}
      </p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? "tab active" : "tab"} onClick={() => { setMode("login"); setError(""); setFields({}); }}>
          Log in
        </button>
        <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? "tab active" : "tab"} onClick={() => { setMode("signup"); setError(""); setFields({}); }}>
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate className="form">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" aria-invalid={!!fields.email} />
          {fields.email && <small className="field-error">{fields.email}</small>}
        </label>
        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={8}
            maxLength={72}
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            aria-invalid={!!fields.password}
          />
          {fields.password && <small className="field-error">{fields.password}</small>}
        </label>
        {!isLogin && <label className="field">
          <span>Your LinkedIn (optional)</span>
          <input name="linkedinUrl" type="url" maxLength={1500} placeholder="https://www.linkedin.com/in/your-name/" aria-invalid={!!fields.linkedinUrl} />
          <small className="field-hint">Import your public experience and education on the next step. You can review everything before saving.</small>
          {fields.linkedinUrl && <small className="field-error">{fields.linkedinUrl}</small>}
        </label>}
        {error && !fields.email && !fields.password && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary full" disabled={busy}>
          {busy ? "One moment…" : isLogin ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
