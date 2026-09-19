import { useEffect, useState } from "react"
import { fetchGraph } from "../api"
import { RelationshipGraph } from "../components/RelationshipGraph"
import type { GraphNodeData, GraphResponse } from "../types"

export function GraphPage({onResearch}:{onResearch:(person:{id:string;name:string})=>void}) {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [selected, setSelected] = useState<(GraphNodeData & { id: string }) | null>(
    null,
  )
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
        <h1 className="mt-2 text-4xl leading-tight">Your contacts are a map</h1>
        <p className="mt-2 max-w-2xl text-stone-700">
          Full network from SQLite. Goal-specific views and Elastic search
          are owned by teammates and are not run from this page.
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
            onSelect={setSelected}
          />
        ) : (
          <div className="flex h-[70vh] items-center justify-center rounded-xl border border-dashed border-stone-400">
            Loading graph…
          </div>
        )}
        <aside className="rounded-xl border border-stone-300 bg-white p-4">
          {selected ? (
            <>
              <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
                {selected.kind}
              </p>
              <h2 className="mt-1 text-2xl">{selected.name}</h2>
              <p className="mt-3 text-sm text-stone-700">
                {selected.bio || selected.description || "No description yet."}
              </p>
              {selected.kind === "person" && <button className="mt-4 rounded-full bg-stone-900 px-4 py-2 text-sm text-white" onClick={()=>onResearch({id:selected.id.replace(/^person:/,""),name:selected.name})}>Prepare coffee chat</button>}
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
        </aside>
      </div>
    </div>
  )
}
