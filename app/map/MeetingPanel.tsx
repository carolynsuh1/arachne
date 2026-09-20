"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "@/components/api";
import type { BrainDumpCard, Introduction, Meeting, TimelineEvent } from "@/lib/team-api";
import type { MapPerson } from "@/lib/network";
import VoicePanel from "./VoicePanel";

type ReviewIntro = Introduction & { include: boolean };

export default function MeetingPanel({ people, fixedPerson }: { people: MapPerson[]; fixedPerson?: MapPerson }) {
  const available = fixedPerson ? [fixedPerson] : people;
  const [selected, setSelected] = useState<string[]>(fixedPerson ? [fixedPerson.id] : []);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("coffee_chat");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState("");
  const [cards, setCards] = useState<BrainDumpCard[]>([]);
  const [introductions, setIntroductions] = useState<ReviewIntro[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [useVoice, setUseVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    const listed = await getJson<{ meetings: Meeting[] }>("/api/net/meetings");
    if (listed.ok) setMeetings(listed.data.meetings);
    if (fixedPerson) {
      const history = await getJson<{ events: TimelineEvent[] }>(`/api/net/people/${fixedPerson.id}/timeline`);
      if (history.ok) setTimeline(history.data.events);
    }
  }, [fixedPerson]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function start() {
    setBusy(true);
    setError("");
    const res = await postJson<{ meeting: Meeting }>("/api/net/meetings", {
      personIds: selected,
      meetingType,
      title,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMeeting(res.data.meeting);
    setTranscript("");
    setCards([]);
    setIntroductions([]);
  }

  async function saveNotes() {
    if (!meeting || !transcript.trim()) return false;
    const res = await postJson<{ meeting: Meeting; extraction: { cards: BrainDumpCard[]; introductions: Introduction[] } }>(
      `/api/net/meetings/${meeting.id}/chunks`,
      { text: transcript },
    );
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setMeeting(res.data.meeting);
    setCards(res.data.extraction.cards);
    setIntroductions(res.data.extraction.introductions.map((intro) => ({ ...intro, include: false })));
    return true;
  }

  async function change(action: "pause" | "resume" | "end") {
    if (!meeting) return;
    setBusy(true);
    setError("");
    if (action === "end" && transcript.trim() && !(await saveNotes())) {
      setBusy(false);
      return;
    }
    const res = await postJson<Meeting | { meeting: Meeting; extraction: { cards: BrainDumpCard[]; introductions: Introduction[] } }>(
      `/api/net/meetings/${meeting.id}/${action}`,
      {},
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if ("meeting" in res.data) {
      setMeeting(res.data.meeting);
      setCards(res.data.extraction.cards);
      setIntroductions(res.data.extraction.introductions.map((intro) => ({ ...intro, include: false })));
    } else {
      setMeeting(res.data);
    }
  }

  async function confirm() {
    if (!meeting) return;
    setBusy(true);
    const res = await postJson<{ meeting: Meeting }>(`/api/net/meetings/${meeting.id}/confirm`, {
      cards,
      introductions: introductions
        .filter((intro) => intro.include)
        .map(({ include: _include, ...intro }) => intro),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMeeting(res.data.meeting);
    setUseVoice(false);
    void loadHistory();
  }

  return (
    <div className="panel-block">
      {!meeting && (
        <>
          {!fixedPerson && (
            <>
              <p className="side-label">People in this meeting</p>
              <div className="meeting-people">
                {available.filter((person) => person.synced).map((person) => (
                  <label className="check-card" key={person.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(person.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                        )
                      }
                    />
                    <span>{person.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <label className="field">
            <span>Meeting type</span>
            <select value={meetingType} onChange={(event) => setMeetingType(event.target.value)}>
              <option value="coffee_chat">Coffee chat</option>
              <option value="networking">Networking</option>
              <option value="mentor">Mentor</option>
              <option value="professional_call">Professional call</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Title (optional)</span>
            <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || selected.length === 0} onClick={() => void start()}>
            {busy ? "Starting…" : "Start meeting"}
          </button>
        </>
      )}

      {meeting && ["live", "paused"].includes(meeting.status) && (
        <>
          <p className="side-note">{meeting.title} · {meeting.status}</p>
          <label className="field">
            <span>Live notes or transcript</span>
            <textarea rows={7} maxLength={50_000} value={transcript} onChange={(event) => setTranscript(event.target.value)} />
          </label>
          <label className="check-card">
            <input type="checkbox" checked={useVoice} onChange={(event) => setUseVoice(event.target.checked)} />
            <span>Use the microphone with this meeting</span>
          </label>
          {useVoice && <VoicePanel meetingId={meeting.id} />}
          <div className="panel-actions">
            <button type="button" className="btn btn-raised" disabled={busy || !transcript.trim()} onClick={() => void saveNotes()}>
              Update notes
            </button>
            {meeting.status === "live" ? (
              <button type="button" className="btn btn-raised" disabled={busy} onClick={() => void change("pause")}>Pause</button>
            ) : (
              <button type="button" className="btn btn-raised" disabled={busy} onClick={() => void change("resume")}>Resume</button>
            )}
            <button type="button" className="btn btn-primary" disabled={busy || (!transcript.trim() && !useVoice)} onClick={() => void change("end")}>
              End & review
            </button>
          </div>
        </>
      )}

      {meeting?.status === "review" && (
        <>
          <p className="side-note">Review before saving. Nothing updates the network until you confirm.</p>
          <ul className="card-list">
            {cards.map((card, index) => (
              <li key={`${card.category}-${index}`}>
                <label className="check-card">
                  <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={(event) =>
                      setCards((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, selected: event.target.checked } : item,
                      ))
                    }
                  />
                  <span><small>{card.category.replaceAll("_", " ")}</small>{card.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {introductions.map((intro, index) => (
            <label className="check-card" key={`${intro.name}-${index}`}>
              <input
                type="checkbox"
                checked={intro.include}
                onChange={(event) =>
                  setIntroductions((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, include: event.target.checked } : item,
                  ))
                }
              />
              <span><small>Add suggested person</small>{intro.name}: {intro.context}</span>
            </label>
          ))}
          <button type="button" className="btn btn-primary" disabled={busy || !cards.some((card) => card.selected)} onClick={() => void confirm()}>
            {busy ? "Saving…" : "Confirm & save"}
          </button>
        </>
      )}

      {meeting?.status === "confirmed" && (
        <div className="voice-latest">
          <small>Saved to your network</small>
          <p>{meeting.summary || "Meeting memory confirmed."}</p>
          <button type="button" className="btn btn-raised" onClick={() => setMeeting(null)}>Log another meeting</button>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      {meetings.length > 0 && (
        <>
          <p className="side-label">Meetings</p>
          <ul className="card-list">
            {meetings.slice(0, 8).map((item) => (
              <li className="followup" key={item.id}>
                <p>{item.title}</p>
                <small>{new Date(item.started_at).toLocaleDateString()} · {item.status}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      {fixedPerson && timeline.length > 0 && (
        <>
          <p className="side-label">{fixedPerson.name}&apos;s timeline</p>
          <ul className="card-list">
            {timeline.slice(0, 12).map((event) => (
              <li className="followup" key={`${event.kind}-${event.id}`}>
                <p>{event.title}</p>
                <small>{new Date(event.at).toLocaleDateString()} · {event.kind}</small>
                {event.detail && <p>{event.detail}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
