import { useEffect, useMemo, useState } from "react"
import {
  askMeetings, confirmMeeting, endMeeting, fetchNetworkTracker, ingestMeetingTranscript,
  listGoals, listMeetings, sendBrainDumpAction, setMeetingPaused, startMeeting,
} from "../api"
import { useVoiceCapture } from "../hooks/useVoiceCapture"
import type {
  BrainDumpCard, Goal, Meeting, MeetingCitation, Reminder, SuggestedIntroduction, TrackerPerson,
} from "../types"

const labels: Record<string, string> = {
  new_information: "Important information", topics: "Topics", personal_details: "Personal context",
  advice: "Advice & resources", opportunities: "Opportunities", recommended_people: "People mentioned",
  commitments: "Promises I made", follow_ups: "Follow-up items", next_conversation: "Questions for later",
  dates: "Dates & deadlines", current_projects: "Current projects", career_info: "Career information",
}

export function MeetingsPage({ initialPerson, onClearPerson }: {
  initialPerson?: {id: string; name: string} | null
  onClearPerson?: () => void
}) {
  const voice = useVoiceCapture()
  const [people, setPeople] = useState<TrackerPerson[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedPeople, setSelectedPeople] = useState<string[]>(initialPerson ? [initialPerson.id] : [])
  const [goalId, setGoalId] = useState("")
  const [meetingType, setMeetingType] = useState("coffee_chat")
  const [active, setActive] = useState<Meeting | null>(null)
  const [cards, setCards] = useState<BrainDumpCard[]>([])
  const [introductions, setIntroductions] = useState<SuggestedIntroduction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(0)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [topicFilter, setTopicFilter] = useState("")
  const [ask, setAsk] = useState("")
  const [answer, setAnswer] = useState("")
  const [citations, setCitations] = useState<MeetingCitation[]>([])
  const [action, setAction] = useState("")
  const [openDetail, setOpenDetail] = useState<Meeting | null>(null)
  const activeId = active?.id
  const activeStatus = active?.status

  useEffect(() => {
    Promise.all([fetchNetworkTracker(), listGoals(), listMeetings()])
      .then(([network, savedGoals, savedMeetings]) => {
        setPeople(network.people); setGoals(savedGoals); setMeetings(savedMeetings)
      })
      .catch((reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    if (!active || active.status === "review" || active.status === "confirmed") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (!activeId || activeStatus !== "live" || !voice.transcript.trim()) return
    const timer = window.setTimeout(() => {
      void ingestMeetingTranscript(activeId, voice.transcript).then((result) => {
        setActive(result.meeting); setCards(result.extraction.cards); setIntroductions(result.extraction.introductions)
      }).catch((reason: Error) => setError(reason.message))
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [activeId, activeStatus, voice.transcript])

  async function begin() {
    if (!selectedPeople.length) return
    setBusy(true); setError("")
    try {
      const meeting = await startMeeting({
        person_ids: selectedPeople, goal_id: goalId || undefined, meeting_type: meetingType,
      })
      setActive(meeting); setNow(new Date(meeting.started_at).getTime()); setCards([]); setIntroductions([]); setReminders([])
      onClearPerson?.()
      await voice.start()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start meeting.") }
    finally { setBusy(false) }
  }

  async function pauseResume() {
    if (!active) return
    const pausing = active.status === "live"
    if (pausing) voice.stop()
    setBusy(true)
    try {
      if (voice.transcript.trim()) await ingestMeetingTranscript(active.id, voice.transcript)
      const meeting = await setMeetingPaused(active.id, pausing)
      setActive(meeting)
      if (!pausing) await voice.start()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update meeting.") }
    finally { setBusy(false) }
  }

  async function finish() {
    if (!active || !voice.transcript.trim()) return
    voice.stop(); setBusy(true); setError("")
    try {
      await ingestMeetingTranscript(active.id, voice.transcript)
      const result = await endMeeting(active.id)
      setActive(result.meeting); setCards(result.extraction.cards); setIntroductions(result.extraction.introductions)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not end meeting.") }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (!active) return
    setBusy(true); setError("")
    try {
      const result = await confirmMeeting(active.id, cards, introductions)
      setActive(result.meeting); setReminders(result.reminders)
      setMeetings(await listMeetings())
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save meeting memory.") }
    finally { setBusy(false) }
  }

  async function askMemory() {
    if (!ask.trim()) return
    setBusy(true); setError("")
    try {
      const result = await askMeetings(ask)
      setAnswer(result.answer); setCitations(result.citations)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not search meeting memory.") }
    finally { setBusy(false) }
  }

  async function followUp() {
    if (!active || !action.trim()) return
    setBusy(true)
    try {
      const result = await sendBrainDumpAction({ person_id: active.person_ids[0], text: action })
      setAnswer(result.message); if (result.reminder) setReminders((items) => [...items, result.reminder!])
      setAction("")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create follow-up.") }
    finally { setBusy(false) }
  }

  const filtered = useMemo(() => meetings.filter((meeting) => {
    const haystack = `${meeting.title} ${meeting.summary} ${meeting.transcript} ${meeting.tags.join(" ")}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase()))
      && (!typeFilter || meeting.meeting_type === typeFilter)
      && (!topicFilter || haystack.includes(topicFilter.toLowerCase()))
  }), [meetings, search, typeFilter, topicFilter])

  if (active && active.status !== "confirmed") {
    const seconds = Math.max(0, Math.floor((now - new Date(active.started_at).getTime()) / 1000))
    const isReview = active.status === "review"
    return <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-sans text-sm uppercase tracking-wide text-stone-500">{isReview ? "Review Meeting Memory" : "Live Meeting Intelligence"}</p>
          <h1 className="mt-1 text-4xl">{active.title}</h1>
          <p className="mt-2 text-stone-600">{active.goal_text || "No goal selected"} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p></div>
        {!isReview ? <div className="flex gap-2">
          <button disabled={busy} onClick={() => void pauseResume()} className="min-h-14 rounded-full border-2 border-stone-900 px-7 text-lg">{active.status === "paused" ? "Resume" : "Pause"}</button>
          <button disabled={busy || !voice.transcript.trim()} onClick={() => void finish()} className="min-h-14 rounded-full bg-red-800 px-8 text-lg text-white disabled:opacity-40">End Meeting</button>
        </div> : null}
      </header>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <section className="rounded-2xl border border-stone-300 bg-white p-5">
          <h2 className="text-2xl">Live transcript</h2>
          <p className="mt-1 text-sm text-stone-500">Leave the device on the table. You can type or paste when microphone access is unavailable.</p>
          <textarea readOnly={isReview} rows={18} value={voice.transcript} onChange={(event) => voice.setTranscript(event.target.value)} placeholder="Conversation appears here…" className="mt-4 w-full rounded-xl border border-stone-300 bg-stone-50 p-4 leading-relaxed"/>
          {voice.interim ? <p className="mt-2 italic text-stone-500">{voice.interim}</p> : null}
          {voice.status || voice.error ? <p className="mt-2 text-sm text-stone-500">{voice.error || voice.status}</p> : null}
        </section>
        <section className="space-y-3">
          <div><h2 className="text-2xl">{isReview ? "Approve before saving" : "Intelligence as you talk"}</h2>
            <p className="text-sm text-stone-600">{isReview ? "Edit or uncheck anything that should not become relationship memory." : "These are suggestions, not saved facts."}</p></div>
          {cards.length ? cards.map((card, index) => <article key={`${card.category}-${index}`} className="rounded-xl border border-stone-300 bg-white p-4">
            <label className="flex gap-3">{isReview ? <input type="checkbox" checked={card.selected} onChange={(event) => setCards((items) => items.map((item, i) => i === index ? {...item, selected: event.target.checked} : item))}/> : null}
              <span className="min-w-0 flex-1"><span className="font-sans text-xs uppercase tracking-wide text-stone-500">{labels[card.category] ?? card.category}</span>
                {isReview ? <textarea value={card.text} onChange={(event) => setCards((items) => items.map((item, i) => i === index ? {...item, text: event.target.value} : item))} className="mt-1 w-full bg-transparent"/> : <p className="mt-1">{card.text}</p>}</span>
            </label>
          </article>) : <p className="rounded-xl border border-dashed border-stone-300 p-5 text-stone-500">Notes appear after conversation text arrives.</p>}
          {introductions.map((intro) => <article key={intro.name} className="rounded-xl border border-dashed border-sky-700 bg-sky-50 p-4">
            <strong>{intro.existing_person_id ? "Possible existing person detected" : "New person mentioned"}: {intro.name}</strong>
            <p className="text-sm">{intro.affiliation || intro.context} · You → {active.person_names[0]} → {intro.name}</p>
          </article>)}
          {isReview ? <button disabled={busy} onClick={() => void confirm()} className="w-full rounded-full bg-stone-900 px-6 py-4 text-lg text-white">{busy ? "Saving…" : "Confirm relationship memory"}</button> : null}
        </section>
      </div>
    </div>
  }

  return <div className="mx-auto max-w-6xl space-y-8">
    <header><p className="font-sans text-sm uppercase tracking-wide text-stone-500">Meetings</p><h1 className="mt-2 text-4xl">Your conversation memory</h1><p className="mt-2 text-stone-600">Put the device on the table. Talk normally. Approve what becomes memory afterward.</p></header>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p> : null}
    {active?.status === "confirmed" ? <section className="rounded-2xl bg-stone-900 p-6 text-white">
      <h2 className="text-3xl">Memory saved</h2><p className="mt-2">Profiles, relationship history, suggested introductions, and Upcoming now use this meeting.</p>
      {reminders.map((reminder) => <p key={reminder.id} className="mt-2">✓ {reminder.action}</p>)}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={action} onChange={(event) => setAction(event.target.value)} placeholder='“Remind me Tuesday”' className="flex-1 rounded-full px-4 py-2 text-stone-900"/><button onClick={() => void followUp()} className="rounded-full bg-white px-5 py-2 text-stone-900">Add spoken follow-up</button></div>
      <button onClick={() => {setActive(null); voice.setTranscript(""); setCards([])}} className="mt-4 underline">Return to meetings</button>
    </section> : null}
    {!active ? <section className="rounded-2xl border border-stone-300 bg-white p-5 sm:p-7">
      <h2 className="text-3xl">New Meeting</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="md:col-span-2">People <select multiple value={selectedPeople} onChange={(event) => setSelectedPeople(Array.from(event.target.selectedOptions, (option) => option.value))} className="mt-2 h-28 w-full rounded-lg border border-stone-300 p-2">{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><span className="text-xs text-stone-500">Hold Cmd/Ctrl to select multiple people.</span></label>
        <div className="space-y-3"><label className="block">Meeting type<select value={meetingType} onChange={(event) => setMeetingType(event.target.value)} className="mt-2 w-full rounded-lg border border-stone-300 p-2">{["coffee_chat","networking","mentor","club","professional_call","other"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label>
          <label className="block">Current goal<select value={goalId} onChange={(event) => setGoalId(event.target.value)} className="mt-2 w-full rounded-lg border border-stone-300 p-2"><option value="">No saved goal</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.text}</option>)}</select></label></div>
      </div>
      <button disabled={busy || !selectedPeople.length} onClick={() => void begin()} className="mt-5 w-full rounded-full bg-stone-900 px-6 py-4 text-lg text-white disabled:opacity-40">Start Meeting</button>
    </section> : null}
    <section className="rounded-2xl border border-stone-300 bg-white p-5">
      <h2 className="text-3xl">Ask your meetings…</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") void askMemory()}} placeholder="What did Sarah say about internships?" className="flex-1 rounded-full border border-stone-300 px-5 py-3"/><button disabled={busy || !ask.trim()} onClick={() => void askMemory()} className="rounded-full bg-stone-900 px-6 py-3 text-white">Ask</button></div>
      {answer ? <div className="mt-4 rounded-xl bg-stone-100 p-4"><p>{answer}</p>{citations.map((citation) => <button key={citation.meeting_id} onClick={() => setOpenDetail(meetings.find((item) => item.id === citation.meeting_id) ?? null)} className="mt-2 block text-left text-sm underline">{citation.title} · {new Date(citation.date).toLocaleDateString()} · {citation.person_names.join(", ")}</button>)}</div> : null}
    </section>
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-3xl">Recent meetings</h2><p className="text-sm text-stone-500">Search transcript, notes, people, topics, companies, or tags.</p></div>
        <div className="flex flex-wrap gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" className="rounded-full border px-4 py-2"/><input value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} placeholder="Topic or company" className="rounded-full border px-4 py-2"/><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-full border px-4 py-2"><option value="">All types</option>{["coffee_chat","networking","mentor","club","professional_call","other"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></div></div>
      <div className="mt-4 grid gap-3">{filtered.map((meeting) => <button key={meeting.id} onClick={() => setOpenDetail(meeting)} className="rounded-xl border border-stone-300 bg-white p-4 text-left"><h3 className="text-xl">{meeting.person_names.join(", ")}</h3><p className="text-sm">{meeting.meeting_type.replace("_", " ")} · {new Date(meeting.started_at).toLocaleDateString()} · {meeting.tags.join(" / ") || meeting.goal_text || "Conversation"}</p><p className="mt-2 line-clamp-2 text-stone-600">{meeting.summary}</p></button>)}</div>
    </section>
    {openDetail ? <section className="rounded-2xl border-2 border-stone-900 bg-white p-6"><button onClick={() => setOpenDetail(null)} className="float-right underline">Close</button><h2 className="text-3xl">{openDetail.title}</h2><p className="mt-2 text-stone-500">{new Date(openDetail.started_at).toLocaleString()} · {openDetail.goal_text}</p><h3 className="mt-5 text-xl">AI summary</h3><p>{openDetail.summary}</p><h3 className="mt-5 text-xl">Key takeaways & relationship updates</h3>{openDetail.cards.filter((card) => card.selected).map((card, index) => <p key={index} className="mt-2"><strong>{labels[card.category] ?? card.category}:</strong> {card.text}</p>)}<details className="mt-5"><summary className="cursor-pointer text-xl">Transcript</summary><p className="mt-3 whitespace-pre-wrap">{openDetail.transcript}</p></details></section> : null}
  </div>
}
