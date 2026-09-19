import { useEffect, useState } from "react"
import { fetchGraph, syncFromDropbox, syncFromSample } from "../api"
import { RelationshipGraph } from "../components/RelationshipGraph"
import type { GoalNetworkResult, GraphNodeData, GraphResponse } from "../types"

type Props = {
  plan: GoalNetworkResult | null
}

export function GraphPage({ plan }: Props) {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [selected, setSelected] = useState<(GraphNodeData & { id: string }) | null>(
    null,
  )
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  async function loadGraph() {
    setError("")
    const data = await fetchGraph(plan?.goal.id)
    setGraph(data)
    setStatus(`${data.source}: ${data.detail}`)
  }

  useEffect(() => {
    loadGraph().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load the graph.")
    })
  }, [plan?.goal.id])

  async function onDropboxSync() {
    setError("")
    try {
      const result = await syncFromDropbox()
      setStatus(
        `${result.source}: ${result.detail} (${result.people} people, ${result.organizations} orgs)`,
      )
      await loadGraph()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dropbox sync failed.")
    }
  }

  async function onSampleSync() {
    setError("")
    try {
      const result = await syncFromSample()
      setStatus(result.detail)
      await loadGraph()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sample data.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div>
          <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
            Relationship Knowledge Graph
          </p>
          <h1 className="mt-2 text-4xl leading-tight">Your contacts are a map</h1>
          <p className="mt-2 max-w-2xl text-stone-700">
            People, labs, clubs, and interests as nodes. Knows, member-of,
            interested-in, and introduced-by as edges.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDropboxSync}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 font-sans text-sm"
          >
            Sync Dropbox
          </button>
          <button
            type="button"
            onClick={onSampleSync}
            className="rounded-full border border-stone-400 bg-white px-4 py-2 font-sans text-sm"
          >
            Load sample
          </button>
        </div>
      </div>
      {status ? (
        <p className="font-sans text-sm text-stone-600">{status}</p>
      ) : null}
      {error ? <p className="font-sans text-sm text-red-800">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {graph ? (
          <RelationshipGraph
            nodes={graph.nodes}
            edges={graph.edges}
            onSelect={setSelected}
          />
        ) : (
          <div className="flex h-[70vh] items-center justify-center rounded-xl border border-dashed border-stone-400">
            Loading graph…
          </div>
        )}
        <aside className="space-y-4">
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            {selected ? (
              <>
                <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
                  {selected.kind}
                </p>
                <h2 className="mt-1 text-2xl">{selected.name}</h2>
                <p className="mt-3 text-sm text-stone-700">
                  {selected.why ||
                    selected.bio ||
                    selected.description ||
                    "No description yet."}
                </p>
                {selected.interests?.length ? (
                  <p className="mt-4 font-sans text-sm">
                    Interests: {selected.interests.join(", ")}
                  </p>
                ) : null}
                {selected.skills?.length ? (
                  <p className="mt-2 font-sans text-sm">
                    Skills: {selected.skills.join(", ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-stone-600">Select a person or organization.</p>
            )}
          </div>
          {graph?.ranked.length ? (
            <div className="rounded-xl border border-stone-300 bg-white p-4">
              <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
                Ranked for this goal
              </p>
              <ol className="mt-3 space-y-3">
                {graph.ranked.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <p>{item.name}</p>
                    <p className="font-sans text-sm text-stone-600">{item.why}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
