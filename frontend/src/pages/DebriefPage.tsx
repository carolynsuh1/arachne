import { useEffect, useState } from "react"
import {
  createInteraction,
  fetchNetworkTracker,
  listInteractions,
} from "../api"
import { useVoiceCapture } from "../hooks/useVoiceCapture"
import type { InteractionMemory, TrackerPerson } from "../types"

const PROMPTS = [
  "What stood out?",
  "What did you promise?",
  "What are they interested in?",
  "What happens next?",
]

function localDateTime() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

type Props = {
  person?: { id: string; name: string }
}

export function DebriefPage({ person }: Props) {
  const [people, setPeople] = useState<TrackerPerson[]>([])
  const [personId, setPersonId] = useState(person?.id ?? "")
  const [guestName, setGuestName] = useState(person?.id ? "" : person?.name ?? "")
  const [happenedAt, setHappenedAt] = useState(localDateTime)
  const [memories, setMemories] = useState<InteractionMemory[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const voice = useVoiceCapture("", { mode: "follow_up" })

  useEffect(() => {
    Promise.all([fetchNetworkTracker(), listInteractions()])
      .then(([tracker, saved]) => {
        setPeople(tracker.people)
        setMemories(saved)
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Could not load debriefs.")
      })
  }, [])

  async function saveDebrief() {
    const selected = people.find((person) => person.id === personId)
    const personName = selected?.name ?? guestName.trim()
    if (!personName || !voice.transcript.trim()) {
      setError("Choose who you met and record or type a debrief first.")
      return
    }

    voice.stop()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const saved = await createInteraction({
        ...(selected ? { person_id: selected.id } : {}),
        person_name: personName,
        transcript: voice.transcript.trim(),
        happened_at: new Date(happenedAt).toISOString(),
      })
      setMemories((current) => [saved, ...current])
      voice.setTranscript("")
      setMessage(`Saved your conversation with ${personName}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this debrief.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="font-sans text-sm uppercase tracking-wide text-stone-500">
          Interaction memory
        </p>
        <h1 className="mt-2 text-4xl leading-tight">Talk it out while you walk away</h1>
        <p className="mt-3 max-w-2xl text-stone-700">
          Debrief the coffee chat before the details fade. Your voice becomes an
          editable memory attached to the person.
        </p>
      </header>

      <section className="rounded-2xl border border-stone-300 bg-white p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="font-sans text-sm">
            Who did you meet?
            <select
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base"
            >
              <option value="">Someone else</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>
          <label className="font-sans text-sm">
            When?
            <input
              type="datetime-local"
              value={happenedAt}
              onChange={(event) => setHappenedAt(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base"
            />
          </label>
        </div>

        {!personId ? (
          <label className="mt-4 block font-sans text-sm">
            Their name
            <input
              value={guestName}
              maxLength={120}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Who was the conversation with?"
              className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-3 text-base"
            />
          </label>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {PROMPTS.map((prompt) => (
            <span
              key={prompt}
              className="rounded-full bg-stone-100 px-3 py-1.5 font-sans text-xs text-stone-600"
            >
              {prompt}
            </span>
          ))}
        </div>

        <div className="mt-7 text-center">
          <button
            type="button"
            onClick={() => void voice.toggle()}
            disabled={voice.isTranscribing}
            aria-pressed={voice.isRecording}
            className={`mx-auto flex size-24 items-center justify-center rounded-full font-sans text-sm font-medium text-white shadow-sm transition disabled:opacity-50 ${
              voice.isRecording ? "animate-pulse bg-red-700" : "bg-stone-900"
            }`}
          >
            {voice.isTranscribing ? "Working…" : voice.isRecording ? "Stop" : "Start talking"}
          </button>
          <p className="mt-3 font-sans text-sm text-stone-500" aria-live="polite">
            {voice.isRecording
              ? `Recording ${Math.floor(voice.elapsedSeconds / 60)}:${String(voice.elapsedSeconds % 60).padStart(2, "0")} · tap when done`
              : voice.status || "Nothing is saved until you review and tap Save."}
          </p>
        </div>

        <label className="mt-6 block font-sans text-sm">
          Your debrief
          <textarea
            value={voice.transcript}
            onChange={(event) => voice.setTranscript(event.target.value)}
            rows={7}
            maxLength={10_000}
            placeholder="What happened? Include promises, interests you discovered, and next steps."
            className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base leading-relaxed"
          />
        </label>
        {voice.interim ? (
          <p className="mt-2 font-sans text-sm italic text-stone-500" aria-live="polite">
            {voice.interim}
          </p>
        ) : null}

        {voice.error ? <p role="alert" className="mt-4 font-sans text-sm text-red-800">{voice.error}</p> : null}
        {error ? <p role="alert" className="mt-4 font-sans text-sm text-red-800">{error}</p> : null}
        {message ? <p role="status" className="mt-4 font-sans text-sm text-green-800">{message}</p> : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveDebrief()}
          className="mt-5 w-full rounded-full bg-stone-900 px-5 py-3 font-sans text-base text-white disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Saving…" : "Save interaction memory"}
        </button>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-sans text-sm uppercase tracking-wide text-stone-500">History</p>
            <h2 className="mt-1 text-3xl">Recent conversations</h2>
          </div>
          <span className="font-sans text-sm text-stone-500">{memories.length} saved</span>
        </div>
        <div className="mt-4 grid gap-3">
          {memories.length ? memories.map((memory) => (
            <article key={memory.id} className="rounded-xl border border-stone-300 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xl">{memory.person_name}</h3>
                <time className="font-sans text-xs text-stone-500">
                  {new Date(memory.happened_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                {memory.transcript}
              </p>
            </article>
          )) : (
            <p className="rounded-xl border border-dashed border-stone-300 p-6 text-stone-600">
              Your saved coffee-chat debriefs will appear here.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
