"use client";
import { useEffect, useState } from "react";
import type { MapPerson } from "@/lib/network";

export default function PersonAvatar({ person }: { person: MapPerson }) {
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== person.id) return;
      setFailed(false); setVersion(v => v + 1);
    };
    window.addEventListener("person-researched", refresh);
    return () => window.removeEventListener("person-researched", refresh);
  }, [person.id]);
  return <span className="node-avatar">
    {!failed ? <img src={`/api/people/${encodeURIComponent(person.id)}/photo?v=${version}`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : person.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase()}
  </span>;
}
