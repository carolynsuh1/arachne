import { useState, type FormEvent } from "react"
import { createGoal } from "../api"
import type { Goal } from "../types"

export function GoalForm() {
  const [text, setText] = useState(
    "I want to get involved in AI research at Berkeley.",
  )
  const [saved, setSaved] = useState<Goal | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const goal = await createGoal(text)
      setSaved(goal)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the goal.")
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
        {loading ? "Saving…" : "Save goal"}
      </button>
      {error ? <p className="font-sans text-sm text-red-800">{error}</p> : null}
      {saved ? (
        <div className="rounded-md border border-stone-300 bg-white p-4">
          <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
            Saved
          </p>
          <p className="mt-2 text-lg">{saved.text}</p>
          <p className="mt-2 font-sans text-xs text-stone-500">id: {saved.id}</p>
        </div>
      ) : null}
    </form>
  )
}
