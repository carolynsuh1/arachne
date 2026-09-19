import { GoalForm } from "../components/GoalForm"
import type { GoalNetworkResult } from "../types"

type Props = {
  plan: GoalNetworkResult | null
  onAnalyzed: (result: GoalNetworkResult) => void
  onOpenGraph: () => void
}

export function GoalPage({ plan, onAnalyzed, onOpenGraph }: Props) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
        Goal → Network Agent
      </p>
      <h1 className="mt-2 text-4xl leading-tight">Who should you know next?</h1>
      <p className="mt-4 max-w-xl text-lg text-stone-700">
        Instead of searching for people, you tell the agent what you are trying
        to accomplish.
      </p>
      <div className="mt-8">
        <GoalForm onAnalyzed={onAnalyzed} />
      </div>
      {plan ? (
        <div className="mt-8 space-y-6">
          <div className="rounded-md border border-stone-300 bg-white p-4">
            <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
              Agent plan · {plan.provider}
            </p>
            <p className="mt-2 text-lg">{plan.summary}</p>
          </div>
          <section>
            <h2 className="text-2xl">Subgoals</h2>
            <ol className="mt-3 space-y-3">
              {plan.subgoals.map((item) => (
                <li key={item.text} className="rounded-md border border-stone-200 bg-white p-4">
                  <p>{item.text}</p>
                  <p className="mt-1 font-sans text-sm text-stone-600">{item.why}</p>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2 className="text-2xl">Who to know next</h2>
            <ul className="mt-3 space-y-3">
              {plan.needed_connections.map((item) => (
                <li key={item.kind + item.query} className="rounded-md border border-stone-200 bg-white p-4">
                  <p className="font-sans text-xs tracking-wide text-stone-500 uppercase">
                    {item.kind}
                  </p>
                  <p className="mt-1">{item.query}</p>
                  <p className="mt-1 font-sans text-sm text-stone-600">{item.why}</p>
                </li>
              ))}
            </ul>
          </section>
          <button
            type="button"
            onClick={onOpenGraph}
            className="rounded-full bg-stone-900 px-5 py-2.5 font-sans text-sm text-white"
          >
            Open relationship graph
          </button>
        </div>
      ) : null}
    </div>
  )
}
