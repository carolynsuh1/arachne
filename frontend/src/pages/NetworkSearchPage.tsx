import { useState } from "react"
import { searchNetwork } from "../api"
import type { NetworkSearchResult } from "../types"

const DEMO_QUERY = "Who do I know who could introduce me to someone working in robotics?"

export function NetworkSearchPage({
  onResearch,
  onPractice,
}: {
  onResearch: (person: { id: string; name: string }) => void
  onPractice: (person: { id: string; name: string }) => void
}) {
  const [query, setQuery] = useState(DEMO_QUERY)
  const [results, setResults] = useState<NetworkSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    const value = query.trim()
    if (!value) return
    setLoading(true)
    setError("")
    try {
      setResults((await searchNetwork(value)).results)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="font-sans text-sm uppercase tracking-wide text-stone-500">Natural-language search</p>
        <h1 className="mt-2 text-4xl">Find the strongest path through your network</h1>
        <p className="mt-2 max-w-2xl text-stone-700">
          Search understands your goal, then ranks people using semantic relevance, relationship strength, and conversation recency.
        </p>
      </header>

      <section className="rounded-2xl border border-stone-300 bg-white p-4 sm:p-5">
        <label className="font-sans text-sm text-stone-700" htmlFor="network-search">What are you trying to do?</label>
        <textarea
          id="network-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={loading || query.trim().length < 2} onClick={() => void submit()} className="rounded-full bg-stone-900 px-5 py-2.5 font-sans text-sm text-white disabled:opacity-50">
            {loading ? "Ranking your network…" : "Search network"}
          </button>
          <button type="button" onClick={() => setQuery(DEMO_QUERY)} className="rounded-full border border-stone-400 px-4 py-2.5 font-sans text-sm">
            Load robotics example
          </button>
        </div>
        {error ? <p role="alert" className="mt-3 font-sans text-sm text-red-800">{error}</p> : null}
      </section>

      {results.length ? (
        <section className="space-y-3">
          <p className="font-sans text-sm text-stone-600">{results.length} ranked connections</p>
          {results.map((result, index) => (
            <article key={result.person_id} className="rounded-2xl border border-stone-300 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-sans text-xs uppercase tracking-wide text-stone-500">#{index + 1} · {result.score}/100 match</p>
                  <h2 className="mt-1 text-2xl">{result.name}</h2>
                  {result.bio ? <p className="mt-1 text-stone-700">{result.bio}</p> : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onResearch({ id: result.person_id, name: result.name })} className="rounded-full border border-stone-400 px-3 py-2 font-sans text-sm">Research</button>
                  <button type="button" onClick={() => onPractice({ id: result.person_id, name: result.name })} className="rounded-full bg-stone-900 px-3 py-2 font-sans text-sm text-white">Practice chat</button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-xl bg-amber-50 p-3"><p className="font-sans text-xs uppercase tracking-wide text-stone-500">Why this person</p><p className="mt-1 text-stone-800">{result.why}</p></div>
                <div className="rounded-xl bg-stone-50 p-3"><p className="font-sans text-xs uppercase tracking-wide text-stone-500">Next best action</p><p className="mt-1 text-stone-800">{result.suggested_action}</p></div>
              </div>
            </article>
          ))}
        </section>
      ) : !loading ? <p className="text-stone-600">Run a search to see people ranked with clear reasons.</p> : null}
    </div>
  )
}
