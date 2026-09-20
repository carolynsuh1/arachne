import { useEffect, useState } from "react"
import { fetchPersonTimeline } from "../api"

type Event = {id: string; kind: string; title: string; detail: string; at: string}

export function PersonTimeline({ personId }: {personId: string}) {
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    let current = true
    fetchPersonTimeline(personId).then((items) => {
      if (current) setEvents(items)
    }).catch(() => {
      if (current) setEvents([])
    })
    return () => { current = false }
  }, [personId])

  if (!events.length) return null
  return <div className="mt-5 border-t border-stone-200 pt-4">
    <h4 className="font-sans text-xs uppercase tracking-wide text-stone-500">Relationship history</h4>
    <ol className="mt-3 space-y-3">
      {events.slice(0, 8).map((event) => <li key={`${event.kind}-${event.id}`} className="border-l-2 border-stone-300 pl-3">
        <p className="text-sm font-medium">{event.title}</p>
        <p className="font-sans text-xs text-stone-500">{new Date(event.at).toLocaleDateString()} · {event.kind}</p>
      </li>)}
    </ol>
  </div>
}
