import type { GraphEdge, GraphNodeData } from "../types"

type PersonSelection = GraphNodeData & { id: string }

export function WhyPanel({
  person,
  edge,
}: {
  person?: PersonSelection | null
  edge?: GraphEdge | null
}) {
  if (edge) {
    const strength = edge.data.relationship_strength ?? edge.data.strength
    return (
      <div className="space-y-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-wide text-stone-500">Why this relationship?</p>
          <h2 className="mt-1 text-2xl">{edge.label}</h2>
        </div>
        <Metrics
          relevance={null}
          strength={strength}
          confidence={edge.data.confidence}
          intro={edge.data.intro_probability}
        />
        {edge.data.last_interaction_at ? (
          <p className="font-sans text-sm">Last interaction: {formatDate(edge.data.last_interaction_at)}</p>
        ) : null}
        <Reasons values={edge.data.score_explanation} />
        <Evidence
          fallback={edge.data.evidence}
          values={edge.data.structured_evidence}
        />
      </div>
    )
  }
  if (!person) return <p className="text-stone-600">Select a person or relationship.</p>
  return (
    <div className="space-y-4">
      <div>
        <p className="font-sans text-xs uppercase tracking-wide text-stone-500">Why this person?</p>
        <h2 className="mt-1 text-2xl">{person.name}</h2>
      </div>
      <Metrics
        relevance={person.goal_relevance}
        strength={person.relationship_strength}
        confidence={person.confidence}
        intro={person.intro_probability}
      />
      {person.last_interaction_at ? (
        <p className="font-sans text-sm">Last interaction: {formatDate(person.last_interaction_at)}</p>
      ) : null}
      <p className="text-sm text-stone-700">{person.why || person.bio || "No explanation recorded yet."}</p>
      <Reasons values={person.score_explanation} />
      {person.change_reason ? (
        <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{person.change_reason}</p>
      ) : null}
      {person.next_action ? (
        <div className="rounded-lg bg-stone-900 p-3 text-white">
          <p className="font-sans text-xs uppercase tracking-wide text-stone-300">Next best action</p>
          <p className="mt-1">{person.next_action}</p>
        </div>
      ) : null}
    </div>
  )
}

function Metrics({
  relevance,
  strength,
  confidence,
  intro,
}: {
  relevance?: number | null
  strength?: number | null
  confidence?: number | null
  intro?: number | null
}) {
  const rows = [
    ["Goal relevance", relevance],
    ["Relationship strength", strength],
    ["Confidence", confidence],
    ["Intro probability", intro],
  ] as const
  return (
    <dl className="space-y-2 font-sans text-sm">
      {rows.map(([label, value]) =>
        value == null ? null : (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-stone-600">{label}</dt>
            <dd>{Math.round(value * 100)}%</dd>
          </div>
        ),
      )}
    </dl>
  )
}

function Reasons({ values }: { values?: Record<string, string[]> }) {
  const reasons = Object.values(values ?? {}).flat()
  if (!reasons.length) return null
  return (
    <div>
      <p className="font-sans text-xs uppercase tracking-wide text-stone-500">Score explanation</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {[...new Set(reasons)].map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
    </div>
  )
}

function Evidence({
  fallback,
  values,
}: {
  fallback?: string
  values?: GraphEdge["data"]["structured_evidence"]
}) {
  if (!values?.length && !fallback) return null
  return (
    <div>
      <p className="font-sans text-xs uppercase tracking-wide text-stone-500">Evidence</p>
      <ul className="mt-2 space-y-2 text-sm">
        {values?.length
          ? values.map((item) => (
              <li key={`${item.type}-${item.id}-${item.event_type}`} className="rounded bg-stone-100 p-2">
                <strong>{item.type} {item.id}</strong>
                {item.excerpt ? <p>{item.excerpt}</p> : null}
              </li>
            ))
          : <li>{fallback}</li>}
      </ul>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
