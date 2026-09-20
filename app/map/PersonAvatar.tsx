"use client";
import { useState } from "react";
import type { MapPerson } from "@/lib/network";

export default function PersonAvatar({ person }: { person: MapPerson }) {
  const [failed, setFailed] = useState(false);
  return <span className="node-avatar">
    {!failed ? <img src={`/api/people/${encodeURIComponent(person.id)}/photo`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : person.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase()}
  </span>;
}
