import { useRef, useState } from "react"
import { practiceFeedback, practiceTurn } from "../api"
import { useVoiceCapture } from "../hooks/useVoiceCapture"
import type {
  ConversationMessage,
  PracticeFeedback,
  PracticeTurn,
} from "../types"

export function PracticePage({
  person,
  onBack,
}: {
  person: { id: string; name: string }
  onBack: () => void
}) {
  const [message, setMessage] = useState("")
  const [history, setHistory] = useState<ConversationMessage[]>([])
  const [context, setContext] = useState<PracticeTurn["person"] | null>(null)
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voice = useVoiceCapture("", { mode: "practice" })

  async function send() {
    const text = message.trim()
    if (!text) return
    setLoading(true)
    setError("")
    audioRef.current?.pause()
    try {
      const result = await practiceTurn(person.id, text, history)
      setContext(result.person)
      setHistory((current) => [
        ...current,
        { role: "user", content: text },
        { role: "assistant", content: result.reply },
      ])
      setMessage("")
      if (result.audio_base64 && result.audio_mime_type) {
        const audio = new Audio(
          `data:${result.audio_mime_type};base64,${result.audio_base64}`,
        )
        audioRef.current = audio
        void audio.play()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Practice turn failed.")
    } finally {
      setLoading(false)
    }
  }

  async function finish() {
    if (!history.length) return
    setLoading(true)
    try {
      setFeedback(await practiceFeedback(person.id, history))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Feedback failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="font-sans text-sm underline">
            ← Back to copilot
          </button>
          <p className="mt-5 font-sans text-sm uppercase tracking-wide text-stone-500">
            Coffee chat rehearsal
          </p>
          <h1 className="mt-2 text-4xl">Practice with {person.name}</h1>
          <p className="mt-2 text-stone-700">
            The roleplay uses this person’s graph profile, research, and interaction memories.
          </p>
        </div>
        <button
          type="button"
          disabled={!history.length || loading}
          onClick={() => void finish()}
          className="rounded-full border border-stone-800 px-5 py-2.5 font-sans text-sm disabled:opacity-40"
        >
          End and get feedback
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-stone-300 bg-white p-4 sm:p-6">
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {!history.length ? (
              <p className="rounded-xl bg-stone-100 p-4 text-stone-600">
                Open naturally—introduce yourself, explain why their work stood out,
                or ask a specific question.
              </p>
            ) : null}
            {history.map((item, index) => (
              <div
                key={`${index}-${item.role}`}
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  item.role === "user"
                    ? "ml-auto bg-stone-900 text-white"
                    : "bg-amber-50 text-stone-800"
                }`}
              >
                {item.content}
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={2}
              placeholder={`Say something to ${person.name.split(" ")[0]}…`}
              className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 px-4 py-3"
            />
            <button
              type="button"
              disabled={loading || !message.trim()}
              onClick={() => void send()}
              className="self-end rounded-full bg-stone-900 px-5 py-3 font-sans text-sm text-white disabled:opacity-40"
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void voice.toggle()}
              className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            >
              {voice.isRecording ? "Stop voice prep" : "Start voice prep"}
            </button>
            {voice.isRecording ? (
              <button type="button" onClick={voice.toggleMute} className="text-sm underline">
                {voice.isMuted ? "Unmute" : "Mute"}
              </button>
            ) : null}
            <span className="text-xs text-stone-500">{voice.status}</span>
          </div>
          {voice.lastAgentText ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">{voice.lastAgentText}</p> : null}
          {voice.error ? <p className="mt-3 text-sm text-red-800">{voice.error}</p> : null}
          {error ? <p className="mt-3 font-sans text-sm text-red-800">{error}</p> : null}
        </section>

        <aside className="space-y-4">
          {context ? (
            <section className="rounded-xl border border-stone-300 bg-white p-4">
              <p className="font-sans text-xs uppercase tracking-wide text-stone-500">
                Grounding
              </p>
              <p className="mt-2 text-sm text-stone-700">{context.bio}</p>
              {context.affiliations?.length ? (
                <p className="mt-3 font-sans text-xs text-stone-500">
                  {context.affiliations.join(" · ")}
                </p>
              ) : null}
            </section>
          ) : null}
          {feedback ? (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-sans text-xs uppercase tracking-wide text-amber-800">
                Coach feedback
              </p>
              {Object.entries(feedback).map(([key, value]) => (
                <div key={key} className="mt-4">
                  <h2 className="font-sans text-xs font-semibold uppercase text-stone-500">
                    {key.replaceAll("_", " ")}
                  </h2>
                  <p className="mt-1 text-sm text-stone-800">{value}</p>
                </div>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
