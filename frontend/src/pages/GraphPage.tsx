import { useEffect, useState } from "react"
import { fetchGraph } from "../api"
import { RelationshipGraph } from "../components/RelationshipGraph"
import type { GraphNodeData, GraphResponse } from "../types"
import { PersonTimeline } from "../components/PersonTimeline"
import { WhyPanel } from "../components/WhyPanel"
import type { GraphEdge } from "../types"

export function GraphPage({
  onResearch,
  onPractice,
  onBrainDump,
  onMeeting,
}: {
  onResearch: (person: { id: string; name: string }) => void
  onPractice: (person: { id: string; name: string }) => void
  onBrainDump: (person: { id: string; name: string }) => void
  onMeeting: (person: { id: string; name: string }) => void
}) {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [selected, setSelected] = useState<(GraphNodeData & { id: string }) | null>(
    null,
  )
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchGraph()
      .then(setGraph)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load the graph.")
      })
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
          Relationship Knowledge Graph
        </p>
        <h1 className="mt-2 text-4xl leading-tight">Who can introduce you</h1>
        <p className="mt-2 max-w-2xl text-stone-700">
          Every name is a person in your network. A line means that person can
          recommend you chat with the person on the other end.
        </p>
      </div>
      {graph ? (
        <p className="font-sans text-sm text-stone-600">
          {graph.source}: {graph.detail}
        </p>
      ) : null}
      {error ? <p className="font-sans text-sm text-red-800">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        {graph ? (
          <RelationshipGraph
            nodes={graph.nodes}
            edges={graph.edges}
            onSelect={(node) => { setSelected(node); setSelectedEdge(null) }}
            onSelectEdge={(edge) => { setSelectedEdge(edge); setSelected(null) }}
          />
        ) : (
          <div className="flex h-[70vh] items-center justify-center rounded-xl border border-dashed border-stone-400">
            Loading graph…
          </div>
        )}
        <aside className="rounded-xl border border-stone-300 bg-white p-4">
          {selectedEdge ? (
            <WhyPanel edge={selectedEdge} />
          ) : selected ? (
            <>
              <WhyPanel person={selected} />
              {selected.kind === "person" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-red-800 px-4 py-2 text-sm text-white"
                    onClick={() => onMeeting({ id: selected.id.replace(/^person:/, ""), name: selected.name })}
                  >
                    Start Meeting
                  </button>
                  <button
                    className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white"
                    onClick={() => onPractice({ id: selected.id.replace(/^person:/, ""), name: selected.name })}
                  >
                    Practice conversation
                  </button>
                  <button
                    className="rounded-full border border-stone-400 px-4 py-2 text-sm"
                    onClick={() => onResearch({ id: selected.id.replace(/^person:/, ""), name: selected.name })}
                  >
                    Research
                  </button>
                  <button
                    className="rounded-full border border-stone-400 px-4 py-2 text-sm"
                    onClick={() => onBrainDump({ id: selected.id.replace(/^person:/, ""), name: selected.name })}
                  >
                    Brain Dump
                  </button>
                </div>
              ) : null}
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
              {selected.kind === "person" ? <PersonTimeline personId={selected.id.replace(/^person:/, "")} /> : null}
            </>
          ) : (
            <p className="text-stone-600">Select a person.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
