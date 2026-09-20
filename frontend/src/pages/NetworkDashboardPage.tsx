import { useEffect, useMemo, useState } from "react"
import { fetchGoalGraph, fetchNetworkTracker, fetchUpcoming, listGoals } from "../api"
import { RelationshipGraph } from "../components/RelationshipGraph"
import type {
  Goal,
  GraphNodeData,
  GraphResponse,
  NetworkTracker,
  TrackerGroup,
  TrackerPerson,
  Reminder,
} from "../types"
import { PersonTimeline } from "../components/PersonTimeline"

type SortKey = "name" | "company" | "location"
type SortDirection = "asc" | "desc"

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Person" },
  { key: "company", label: "Company" },
  { key: "location", label: "Geographic area" },
]

type Props = {
  onResearch: (person: { id: string; name: string }) => void
  onBrainDump: (person: { id: string; name: string }) => void
  onMeeting: (person: { id: string; name: string }) => void
}

export function NetworkDashboardPage({ onResearch, onBrainDump, onMeeting }: Props) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState("")
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [tracker, setTracker] = useState<NetworkTracker | null>(null)
  const [selected, setSelected] = useState<(GraphNodeData & { id: string }) | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
  const [error, setError] = useState("")
  const [upcoming, setUpcoming] = useState<Reminder[]>([])

  useEffect(() => {
    Promise.all([listGoals(), fetchNetworkTracker(), fetchUpcoming()])
      .then(([savedGoals, trackerData, reminders]) => {
        setGoals(savedGoals)
        setTracker(trackerData)
        setSelectedGoalId((current) => current || savedGoals[0]?.id || "")
        setUpcoming(reminders)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load your dashboard.")
      })
  }, [])

  useEffect(() => {
    if (!selectedGoalId) {
      return
    }
    fetchGoalGraph(selectedGoalId)
      .then(setGraph)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not generate this goal view.")
      })
  }, [selectedGoalId])

  function selectGoal(goalId: string) {
    setSelectedGoalId(goalId)
    setGraph(null)
    setSelected(null)
  }

  function sortPeopleBy(key: SortKey) {
    if (key === sortKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
      return
    }
    setSortKey(key)
    setSortDirection("asc")
  }

  // The newest goal wins when the same goal was analyzed more than once.
  const uniqueGoals = useMemo(() => {
    const seen = new Set<string>()
    return goals.filter((goal) => {
      const key = goal.text.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [goals])

  const sortedPeople = useMemo(() => {
    const people = [...(tracker?.people ?? [])]
    return people.sort((left, right) => {
      const leftValue = sortValue(left, sortKey)
      const rightValue = sortValue(right, sortKey)
      // People with no company or location stay at the bottom either way.
      if (leftValue && !rightValue) return -1
      if (!leftValue && rightValue) return 1
      const ordered = compare(leftValue, rightValue)
      return (sortDirection === "asc" ? ordered : -ordered) || compare(left.name, right.name)
    })
  }, [sortDirection, sortKey, tracker])

  return (
    <div className="space-y-8">
      <header>
        <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
          Goal views
        </p>
        <h1 className="mt-2 text-4xl leading-tight">Your network, organized by intent</h1>
        <p className="mt-2 max-w-3xl text-stone-700">
          Pick a saved goal to generate its best people graph, then track where
          your network works, gathers, and lives.
        </p>
      </header>

      {error ? <p className="font-sans text-sm text-red-800">{error}</p> : null}

      <section className="rounded-xl border border-stone-300 bg-white p-5">
        <h2 className="text-2xl">Upcoming</h2>
        <p className="mt-1 text-sm text-stone-600">Who to contact next and why.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {upcoming.length ? upcoming.map((reminder) => {
            const person = tracker?.people.find((item) => item.id === reminder.person_id)
            return <article key={reminder.id} className="rounded-lg bg-stone-100 p-3">
              <strong>{person?.name ?? "Contact"}</strong><p className="text-sm">{reminder.action}</p>
              <p className="font-sans text-xs text-stone-500">{reminder.due_at ? `Due ${new Date(reminder.due_at).toLocaleDateString()}` : "No date"} · {reminder.status}</p>
            </article>
          }) : <p className="text-sm text-stone-500">Confirmed coffee-chat follow-ups will appear here.</p>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-stone-300 bg-white p-4">
          <h2 className="text-2xl">Saved goals</h2>
          <p className="mt-1 font-sans text-xs text-stone-500">
            Newest first. Repeated goals are collapsed.
          </p>
          {uniqueGoals.length ? (
            <div className="mt-3 space-y-2">
              {uniqueGoals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => selectGoal(goal.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    selectedGoalId === goal.id
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-stone-50 text-stone-800"
                  }`}
                >
                  {goal.text}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-600">
              Create a goal in the Goal agent first.
            </p>
          )}
        </aside>

        <div className="min-w-0">
          {graph?.goal_id === selectedGoalId ? (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl">People for this goal</h2>
                  <p className="font-sans text-sm text-stone-600">{graph.detail}</p>
                </div>
                <p className="font-sans text-sm text-stone-600">
                  {graph.nodes.length} matches
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <RelationshipGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onSelect={setSelected}
                />
                <PersonDetail selected={selected} onResearch={onResearch} onBrainDump={onBrainDump} onMeeting={onMeeting} />
              </div>
            </>
          ) : (
            <div className="flex h-[70vh] items-center justify-center rounded-xl border border-dashed border-stone-400">
              {selectedGoalId ? "Generating goal graph…" : "Choose or create a goal."}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
              Network tracker
            </p>
            <h2 className="mt-1 text-3xl">Coverage at a glance</h2>
          </div>
          <p className="font-sans text-sm text-stone-600">
            Groups run widest coverage first. Click a column to sort people.
          </p>
        </div>

        {tracker ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TrackerCard title="Companies" groups={tracker.companies} />
              <TrackerCard title="Clubs" groups={tracker.clubs} />
              <TrackerCard title="Organizations" groups={tracker.organizations} />
              <TrackerCard title="Geographic areas" groups={tracker.locations} />
            </div>
            <PeopleList
              people={sortedPeople}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={sortPeopleBy}
            />
          </>
        ) : (
          <p className="mt-4 text-stone-600">Loading network tracker…</p>
        )}
      </section>
    </div>
  )
}

function PersonDetail({
  selected,
  onResearch,
  onBrainDump,
  onMeeting,
}: {
  selected: (GraphNodeData & { id: string }) | null
  onResearch: Props["onResearch"]
  onBrainDump: Props["onBrainDump"]
  onMeeting: Props["onMeeting"]
}) {
  return (
    <aside className="rounded-xl border border-stone-300 bg-white p-4">
      {selected ? (
        <>
          <h3 className="text-2xl">{selected.name}</h3>
          <p className="mt-2 font-sans text-sm text-stone-700">
            {selected.why || selected.bio || "No match explanation yet."}
          </p>
          {selected.location ? (
            <p className="mt-3 font-sans text-sm">Location: {selected.location}</p>
          ) : null}
          {selected.affiliations?.length ? (
            <p className="mt-2 font-sans text-sm">
              Organizations: {selected.affiliations.join(", ")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() =>
              onResearch({
                id: selected.id.replace(/^person:/, ""),
                name: selected.name,
              })
            }
            className="mt-4 rounded-full bg-stone-900 px-4 py-2 font-sans text-sm text-white"
          >
            Prepare coffee chat
          </button>
          <button type="button" onClick={() => onBrainDump({id: selected.id.replace(/^person:/, ""), name: selected.name})} className="mt-2 rounded-full border border-stone-900 px-4 py-2 font-sans text-sm">Brain Dump</button>
          <button type="button" onClick={() => onMeeting({id: selected.id.replace(/^person:/, ""), name: selected.name})} className="mt-2 rounded-full bg-red-800 px-4 py-2 font-sans text-sm text-white">Start Meeting</button>
          <PersonTimeline personId={selected.id.replace(/^person:/, "")} />
        </>
      ) : (
        <p className="text-stone-600">Select a person to see why they match.</p>
      )}
    </aside>
  )
}

function TrackerCard({ title, groups }: { title: string; groups: TrackerGroup[] }) {
  return (
    <article className="rounded-xl border border-stone-300 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl">{title}</h3>
        <span className="font-sans text-sm text-stone-500">{groups.length}</span>
      </div>
      <div className="mt-3 space-y-3">
        {groups.length ? (
          groups.map((group) => (
            <div key={`${group.kind}-${group.name}`}>
              <p className="font-sans text-sm font-medium">
                {group.name} <span className="text-stone-500">({group.count})</span>
              </p>
              <p className="mt-0.5 text-xs text-stone-600">{group.people.join(", ")}</p>
            </div>
          ))
        ) : (
          <p className="font-sans text-sm text-stone-500">None tracked yet.</p>
        )}
      </div>
    </article>
  )
}

function PeopleList({
  people,
  sortKey,
  sortDirection,
  onSort,
}: {
  people: TrackerPerson[]
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-stone-300 bg-white">
      <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] gap-3 border-b border-stone-200 bg-stone-100 px-4 py-2 font-sans text-xs tracking-wide text-stone-500 uppercase">
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => onSort(column.key)}
            aria-sort={
              sortKey === column.key
                ? sortDirection === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
            className={`flex items-center gap-1 text-left uppercase ${
              sortKey === column.key ? "text-stone-900" : "text-stone-500"
            }`}
          >
            {column.label}
            <span aria-hidden="true">
              {sortKey === column.key ? (sortDirection === "asc" ? "↑" : "↓") : ""}
            </span>
          </button>
        ))}
      </div>
      {people.map((person) => (
        <div
          key={person.id}
          className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)] gap-3 border-b border-stone-100 px-4 py-3 text-sm last:border-0"
        >
          <span>{person.name}</span>
          <span className="font-sans text-stone-600">
            {person.companies.join(", ") || "—"}
          </span>
          <span className="font-sans text-stone-600">{person.location || "Unknown"}</span>
        </div>
      ))}
    </div>
  )
}

function sortValue(person: TrackerPerson, key: SortKey) {
  if (key === "company") return person.companies.join(", ")
  if (key === "location") return person.location
  return person.name
}

function compare(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" })
}
