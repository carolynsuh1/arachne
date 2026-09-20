"use client";

import type { Feature } from "@/lib/features";
import type { Person } from "../SidePanel";
import BrainDumpPanel from "./BrainDumpPanel";
import MeetingPanel from "../MeetingPanel";
import PracticePanel from "./PracticePanel";
import ResearchPanel from "./ResearchPanel";
import SyncGate from "./SyncGate";

/** Features that are live for a person; anything else keeps the "not connected yet" placeholder. */
export const LIVE_PERSON_FEATURES = new Set(["research", "practice", "person-braindump", "person-meeting"]);

export default function PersonFeaturePanel({
  feature,
  person,
  onPersonUpdated,
}: {
  feature: Feature;
  person: Person;
  onPersonUpdated: (p: Person) => void;
}) {
  if (!person.synced) return <SyncGate person={person} onSynced={onPersonUpdated} />;
  if (feature.id === "research") return <ResearchPanel person={person} />;
  if (feature.id === "practice") return <PracticePanel person={person} />;
  if (feature.id === "person-meeting") return <MeetingPanel people={[person]} fixedPerson={person} />;
  return <BrainDumpPanel person={person} />;
}
