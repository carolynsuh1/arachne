"use client";
import { useState } from "react";
import type { MapPerson } from "@/lib/network";

export default function PhotoUpload({ person }: { person: MapPerson }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="person-photo-upload">
    <label>Set profile photo
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e => {
        const file=e.target.files?.[0]; if (!file) return;
        setError(""); if(file.size>1024*1024){setError("Choose a photo under 1 MB.");return;}
        setBusy(true);
        try {
          const body=new FormData(); body.set("photo",file);
          const res=await fetch(`/api/people/${encodeURIComponent(person.id)}/photo`,{method:"POST",body});
          if(!res.ok) throw new Error((await res.json()).error || "Could not save photo.");
          window.location.reload();
        } catch(err){setError(err instanceof Error?err.message:"Could not save photo.");setBusy(false);}
      }} />
    </label>
    <p className="side-note">{busy ? "Saving photo…" : "JPG, PNG or WebP, up to 1 MB. LinkedIn photos appear when available from research."}</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
