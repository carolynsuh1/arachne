import { useEffect, useRef, useState } from "react"
import { askCopilot, fetchGraph } from "../api"
import { RelationshipGraph } from "../components/RelationshipGraph"
import { useVoiceCapture } from "../hooks/useVoiceCapture"
import type {
  ConversationMessage,
  CopilotTurn,
  GraphResponse,
  HighlightEvent,
} from "../types"

const DEMO_PROMPT =
  "I’m at HackMIT right now, and my goal is to find someone who can help me learn more about AI agents. Look through my network, figure out the best people I should talk to, explain how I’m connected to them, and give me a natural conversation starter for each person."

export function CopilotPage({
  onPractice,
}: {
  onPractice: (person: { id: string; name: string }) => void
}) {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const voice = useVoiceCapture(DEMO_PROMPT)
  const [history, setHistory] = useState<ConversationMessage[]>([])
  const [turn, setTurn] = useState<CopilotTurn | null>(null)
  const [activeEvent, setActiveEvent] = useState<HighlightEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    fetchGraph().then(setGraph).catch((reason) => setError(String(reason)))
    return () => stopPlayback()
  }, [])

  function stopPlayback() {
    voice.stop()
    audioRef.current?.pause()
    audioRef.current = null
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    setActiveEvent(null)
  }

  function animate(events: HighlightEvent[]) {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = events.flatMap((event) => [
      window.setTimeout(() => setActiveEvent(event), event.at_ms),
      window.setTimeout(
        () => setActiveEvent((current) => (current === event ? null : current)),
        event.at_ms + event.duration_ms,
      ),
    ])
  }

  function play(result: CopilotTurn) {
    animate(result.highlight_events)
    if (!result.audio_base64 || !result.audio_mime_type) return
    const audio = new Audio(
      `data:${result.audio_mime_type};base64,${result.audio_base64}`,
    )
    audioRef.current = audio
    audio.addEventListener("ended", () => {
      setActiveEvent(null)
      audioRef.current = null
    })
    void audio.play().catch(() => setError("Tap Ask again to allow audio playback."))
  }

  async function submit() {
    const prompt = voice.transcript.trim()
    if (!prompt) return
    stopPlayback()
    setLoading(true)
    setError("")
    try {
      const result = await askCopilot(prompt, history)
      setTurn(result)
      setHistory((current) => [
        ...current,
        { role: "user", content: prompt },
        { role: "assistant", content: result.answer },
      ].slice(-12) as ConversationMessage[])
      voice.setTranscript("")
      play(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The copilot could not answer.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-sm uppercase tracking-wide text-stone-500">
            Network Copilot
          </p>
          <h1 className="mt-2 text-4xl">Talk to your network</h1>
          <p className="mt-2 max-w-2xl text-stone-700">
            Ask for a path. YourWeb answers from SQLite while the people and
            introductions it cites come alive on the graph.
          </p>
        </div>
        <button
          type="button"
          onClick={stopPlayback}
          className="rounded-full border border-stone-400 px-4 py-2 font-sans text-sm"
        >
          Interrupt
        </button>
      </header>

      <section className="rounded-2xl border border-stone-300 bg-white p-4 sm:p-5">
        <textarea
          value={voice.transcript}
          onChange={(event) => voice.setTranscript(event.target.value)}
          rows={3}
          placeholder="Who should I talk to, and why?"
          className="w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void voice.toggle()}
            disabled={voice.isTranscribing}
            className={`rounded-full px-5 py-2.5 font-sans text-sm text-white ${
              voice.isRecording ? "animate-pulse bg-red-700" : "bg-stone-700"
            }`}
          >
            {voice.isTranscribing ? "Transcribing…" : voice.isRecording ? "Stop listening" : "Talk"}
          </button>
          <button
            type="button"
            disabled={loading || voice.isRecording || voice.isTranscribing || !voice.transcript.trim()}
            onClick={() => void submit()}
            className="rounded-full bg-stone-900 px-5 py-2.5 font-sans text-sm text-white disabled:opacity-50"
          >
            {loading ? "Searching your graph…" : "Ask YourWeb"}
          </button>
          <button
            type="button"
            onClick={() => voice.setTranscript(DEMO_PROMPT)}
            className="px-3 py-2 font-sans text-xs text-stone-600 underline"
          >
            Load HackMIT prompt
          </button>
        </div>
        {voice.isRecording || voice.status ? <p className="mt-3 font-sans text-xs text-stone-500">{voice.isRecording ? `Recording ${voice.elapsedSeconds}s` : voice.status}</p> : null}
        {voice.error ? <p className="mt-3 font-sans text-sm text-red-800">{voice.error}</p> : null}
        {error ? <p className="mt-3 font-sans text-sm text-red-800">{error}</p> : null}
        {turn ? (
          <p className="mt-3 font-sans text-xs text-stone-500">{turn.voice_status}</p>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {graph ? (
          <RelationshipGraph
            nodes={graph.nodes}
            edges={graph.edges}
            activeNodeId={activeEvent?.node_id}
            activeEdgeId={activeEvent?.edge_id}
            activeNote={activeEvent?.note}
            onSelect={(node) => {
              if (node.kind === "person") {
                onPractice({ id: node.id.replace(/^person:/, ""), name: node.name })
              }
            }}
          />
        ) : (
          <div className="h-[70vh] rounded-xl border border-dashed border-stone-400" />
        )}
        <aside className="rounded-xl border border-stone-300 bg-white p-5">
          <p className="font-sans text-xs uppercase tracking-wide text-stone-500">
            Spoken strategy
          </p>
          {turn ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-stone-700">{turn.answer}</p>
              <div className="mt-5 space-y-2">
                {turn.cited_people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => onPractice(person)}
                    className="block w-full rounded-lg border border-stone-200 px-3 py-2 text-left font-sans text-sm hover:bg-stone-50"
                  >
                    Practice with {person.name} →
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-stone-600">
              Your answer, conversation starters, and cited people will appear here.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
