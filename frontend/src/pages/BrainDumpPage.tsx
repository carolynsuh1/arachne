import { useState } from "react"
import { confirmBrainDump, extractBrainDump, fetchWhoNext, sendBrainDumpAction } from "../api"
import { useVoiceCapture } from "../hooks/useVoiceCapture"
import type { BrainDumpCard, Reminder, SuggestedIntroduction, WhoNext } from "../types"

const labels: Record<string, string> = {
  new_information: "New information", topics: "Interests & topics",
  personal_details: "Personal details", advice: "Advice", opportunities: "Opportunities",
  recommended_people: "People to meet", commitments: "Promises I made",
  follow_ups: "Follow-up actions", next_conversation: "Next conversation", dates: "Dates & deadlines",
}

export function BrainDumpPage({ person, onDone }: { person: {id: string; name: string}; onDone: () => void }) {
  const voice = useVoiceCapture()
  const [cards, setCards] = useState<BrainDumpCard[]>([])
  const [introductions, setIntroductions] = useState<SuggestedIntroduction[]>([])
  const [summary, setSummary] = useState("")
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [recommendations, setRecommendations] = useState<WhoNext[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [action, setAction] = useState("")
  const [interactionId, setInteractionId] = useState<string>()
  const [error, setError] = useState("")

  async function structure() {
    if (!voice.transcript.trim()) return
    setBusy(true); setError(""); setMessage("")
    try {
      const result = await extractBrainDump({ person_id: person.id, transcript: voice.transcript })
      setCards(result.cards); setIntroductions(result.introductions); setSummary(result.spoken_summary)
      setMessage(result.provider === "heuristic" ? "Structured locally. Add OPENAI_API_KEY for richer extraction." : "Structured with AI. Review every card before saving.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not structure this conversation.")
    } finally { setBusy(false) }
  }

  async function confirm() {
    setBusy(true); setError("")
    try {
      const result = await confirmBrainDump({ person_id: person.id, transcript: voice.transcript, cards, introductions })
      setSummary(result.spoken_summary); setReminders(result.reminders)
      setInteractionId(result.interaction.id)
      setMessage("Memory saved. Profile, graph, and upcoming actions are updated.")
      if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.spoken_summary))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this brain dump.")
    } finally { setBusy(false) }
  }

  async function runAction() {
    if (!action.trim()) return
    setBusy(true); setError("")
    try {
      const result = await sendBrainDumpAction({person_id: person.id, text: action, interaction_id: interactionId})
      setMessage(result.message)
      if (result.reminder) setReminders((items) => [...items, result.reminder!])
      if (result.recommendations.length) setRecommendations(result.recommendations)
      if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.message))
      setAction("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete that action.")
    } finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <button onClick={onDone} className="font-sans text-sm underline">← Back to {person.name}</button>
    <header>
      <p className="font-sans text-sm uppercase tracking-wide text-stone-500">Post-coffee-chat brain dump</p>
      <h1 className="mt-2 text-4xl">What did you learn from {person.name}?</h1>
      <p className="mt-2 text-stone-600">Talk naturally. Nothing updates your network until you confirm the cards.</p>
    </header>
    <section className="rounded-2xl border border-stone-300 bg-white p-5 sm:p-7">
      <button type="button" disabled={voice.isTranscribing} onClick={() => void voice.toggle()} className={`mx-auto flex size-24 items-center justify-center rounded-full text-white disabled:opacity-50 ${voice.isRecording ? "animate-pulse bg-red-700" : "bg-stone-900"}`}>
        {voice.isTranscribing ? "Working…" : voice.isRecording ? "Stop" : "Talk"}
      </button>
      <p className="mt-3 text-center font-sans text-sm text-stone-500">{voice.isRecording ? `Recording ${Math.floor(voice.elapsedSeconds / 60)}:${String(voice.elapsedSeconds % 60).padStart(2, "0")}` : voice.status}</p>
      <textarea aria-label="Brain dump transcript" rows={7} value={voice.transcript} onChange={(event) => voice.setTranscript(event.target.value)} placeholder={`I just talked to ${person.name}…`} className="mt-6 w-full rounded-xl border border-stone-300 bg-stone-50 p-4 text-base" />
      {voice.interim ? <p className="mt-2 text-sm italic text-stone-500">{voice.interim}</p> : null}
      {voice.error ? <p role="alert" className="mt-3 text-sm text-red-800">{voice.error}</p> : null}
      {!cards.length ? <button disabled={busy || !voice.transcript.trim()} onClick={() => void structure()} className="mt-4 w-full rounded-full bg-stone-900 px-5 py-3 text-white disabled:opacity-40">{busy ? "Structuring…" : "Turn this into memories"}</button> : null}
    </section>
    {message ? <p role="status" className="rounded-lg bg-stone-100 p-3 text-sm">{message}</p> : null}
    {error ? <p role="alert" className="text-red-800">{error}</p> : null}
    {cards.length ? <section className="space-y-3">
      <div><h2 className="text-3xl">Review before saving</h2><p className="text-sm text-stone-600">Uncheck or edit anything the agent misunderstood.</p></div>
      {cards.map((card, index) => <article key={`${card.category}-${index}`} className={`rounded-xl border p-4 ${card.selected ? "border-stone-400 bg-white" : "border-stone-200 bg-stone-100 opacity-60"}`}>
        <label className="flex gap-3">
          <input type="checkbox" checked={card.selected} onChange={(event) => setCards((items) => items.map((item, itemIndex) => itemIndex === index ? {...item, selected: event.target.checked} : item))} />
          <span className="w-full"><span className="font-sans text-xs uppercase tracking-wide text-stone-500">{labels[card.category] ?? card.category}</span>
          <textarea aria-label={labels[card.category] ?? card.category} value={card.text} onChange={(event) => setCards((items) => items.map((item, itemIndex) => itemIndex === index ? {...item, text: event.target.value} : item))} className="mt-1 w-full resize-y bg-transparent text-base" /></span>
        </label>
      </article>)}
      {introductions.map((intro) => <p key={intro.name} className="rounded-xl border border-dashed border-sky-700 bg-sky-50 p-4"><strong>Suggested connection:</strong> {intro.name}{intro.affiliation ? ` · ${intro.affiliation}` : ""}<br/><span className="text-sm">{person.name} → {intro.name}. Created only when you confirm.</span></p>)}
      <button disabled={busy} onClick={() => void confirm()} className="w-full rounded-full bg-stone-900 px-5 py-3 text-white">{busy ? "Saving…" : "Confirm and update my network"}</button>
    </section> : null}
    {reminders.length ? <section className="rounded-2xl bg-stone-900 p-6 text-white"><h2 className="text-3xl">Next Steps · {person.name}</h2>{reminders.map((reminder) => <p key={reminder.id} className="mt-3">✓ {reminder.action} <span className="text-stone-300">→ {reminder.due_at ? new Date(reminder.due_at).toLocaleDateString() : "No date"}</span></p>)}</section> : null}
    {summary ? <section className="rounded-xl border border-stone-300 p-5"><h2 className="text-xl">Agent follow-up</h2><p className="mt-2">{summary}</p><p className="mt-2 text-xs text-stone-500">Spoken with browser audio. ElevenLabs remains available through Network Copilot when configured.</p>
      {interactionId ? <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input aria-label="Action for agent" value={action} onChange={(event) => setAction(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") void runAction()}} placeholder='“Yes, remind me Tuesday”' className="min-w-0 flex-1 rounded-full border border-stone-300 px-4 py-2"/><button disabled={busy || !action.trim()} onClick={() => void runAction()} className="rounded-full bg-stone-900 px-5 py-2 text-white disabled:opacity-40">Do it</button></div> : null}
    </section> : null}
    {reminders.length ? <section><button onClick={() => void fetchWhoNext().then(setRecommendations).catch((reason: Error) => setError(reason.message))} className="rounded-full border border-stone-900 px-5 py-2.5">Who should I talk to next?</button>
      {recommendations.map((item) => <article key={item.person_id} className="mt-3 rounded-xl border border-stone-300 p-4"><h3 className="text-xl">{item.name}</h3><p>{item.reason}</p><p className="mt-2 font-sans text-sm">{item.path.join(" → ")}</p><p className="mt-1 text-sm"><strong>Do:</strong> {item.suggested_action}</p></article>)}
    </section> : null}
  </div>
}
