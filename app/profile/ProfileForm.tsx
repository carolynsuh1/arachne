"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postForm } from "@/components/api";

type Initial = {
  fullName: string;
  university: string;
  workExperience: string;
  projects: string;
  education: string;
  interests: string;
  resumeName: string | null;
};

const MAX_BYTES = 5 * 1024 * 1024;

export default function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setFileName("");
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") {
      setFields((f) => ({ ...f, resume: "Resume must be a PDF or DOCX file." }));
      e.target.value = "";
      return setFileName("");
    }
    if (file.size > MAX_BYTES) {
      setFields((f) => ({ ...f, resume: "Resume must be 5 MB or smaller." }));
      e.target.value = "";
      return setFileName("");
    }
    setFields((f) => ({ ...f, resume: "" }));
    setFileName(file.name);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    const res = await postForm("/api/profile", new FormData(e.currentTarget));
    if (res.ok) {
      router.push(res.data.redirect ?? "/goal");
      router.refresh();
      return;
    }
    setError(res.error);
    setFields(res.fields);
    setBusy(false);
  }

  const text = (name: keyof Initial, label: string, placeholder: string, rows = 4) => (
    <label className="field">
      <span>{label}</span>
      <textarea name={name} rows={rows} maxLength={4000} defaultValue={initial[name] ?? ""} placeholder={placeholder} aria-invalid={!!fields[name]} />
      {fields[name] && <small className="field-error">{fields[name]}</small>}
    </label>
  );

  return (
    <div className="auth-card wide">
      <p className="step-label">Step 1 of 3</p>
      <h1 className="auth-title">Tell us about you</h1>
      <p className="auth-sub">Your profile is the first node on your map. Everything here stays private to your account.</p>

      <form onSubmit={onSubmit} noValidate className="form" encType="multipart/form-data">
        <div className="row">
          <label className="field">
            <span>Full name</span>
            <input name="fullName" defaultValue={initial.fullName} required maxLength={100} autoComplete="name" aria-invalid={!!fields.fullName} />
            {fields.fullName && <small className="field-error">{fields.fullName}</small>}
          </label>
          <label className="field">
            <span>University</span>
            <input name="university" defaultValue={initial.university} maxLength={120} aria-invalid={!!fields.university} />
            {fields.university && <small className="field-error">{fields.university}</small>}
          </label>
        </div>

        <label className="field">
          <span>Resume (PDF or DOCX, up to 5 MB)</span>
          <input name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} className="file-input" />
          {fileName ? (
            <small className="field-hint">Selected: {fileName}</small>
          ) : initial.resumeName ? (
            <small className="field-hint">On file: {initial.resumeName} (choose a new file to replace it)</small>
          ) : null}
          {fields.resume && <small className="field-error">{fields.resume}</small>}
        </label>

        {text("workExperience", "Work experience", "Company, role, dates, and what you did…")}
        {text("projects", "Projects", "Things you have built or led…")}
        {text("education", "Education", "Schools, degrees, coursework, clubs…", 3)}
        {text("interests", "Interests", "Topics, industries, and hobbies you care about…", 3)}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary full" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
