import { useState, type FormEvent } from "react"
import { analyzeGoal } from "../api"
import type { GoalNetworkResult } from "../types"

type Props = {
  onAnalyzed: (result: GoalNetworkResult) => void
}

export function GoalForm({ onAnalyzed }: Props) {
  const [text, setText] = useState(
    "I want to find a robotics research position at Berkeley.",
  )
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await analyzeGoal(text)
      onAnalyzed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The network agent failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block font-sans text-sm tracking-wide text-stone-600 uppercase">
        Your goal
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="mt-2 w-full rounded-md border border-stone-300 bg-white p-3 font-sans text-base text-stone-900 normal-case tracking-normal shadow-sm outline-none focus:border-stone-700"
          placeholder="What are you trying to accomplish?"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-full bg-stone-900 px-5 py-2.5 font-sans text-sm text-white disabled:opacity-60"
      >
        {loading ? "Thinking…" : "Ask the network agent"}
      </button>
      {error ? <p className="font-sans text-sm text-red-800">{error}</p> : null}
    </form>
  )
}
