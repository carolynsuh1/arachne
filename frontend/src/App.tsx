import { useState } from "react"
import { GoalPage } from "./pages/GoalPage"
import { GraphPage } from "./pages/GraphPage"
import type { GoalNetworkResult } from "./types"

import { ResearchPage } from "./pages/ResearchPage"
import type { ResearchTarget } from "./pages/ResearchPage"

type Page = "goal" | "graph" | "research"

export default function App() {
  const [target, setTarget] = useState<ResearchTarget | undefined>()
  const [page, setPage] = useState<Page>("goal")
  const [plan, setPlan] = useState<GoalNetworkResult | null>(null)

  return (
    <div className="min-h-svh">
      <header className="flex flex-wrap items-center gap-4 border-b border-stone-300 px-6 py-4">
        <p className="text-xl">YourWeb</p>
        <nav className="flex gap-2 font-sans text-sm">
          <button
            type="button"
            onClick={() => setPage("goal")}
            className={`rounded-full px-4 py-1.5 ${page === "goal" ? "bg-stone-900 text-white" : "text-stone-700"}`}
          >
            Goal agent
          </button>
          <button
            type="button"
            onClick={() => setPage("graph")}
            className={`rounded-full px-4 py-1.5 ${page === "graph" ? "bg-stone-900 text-white" : "text-stone-700"}`}
          >
            Knowledge graph
          </button>
          <button onClick={() => {setTarget(undefined);setPage("research")}} className={`rounded-full px-4 py-1.5 ${page === "research" ? "bg-stone-900 text-white" : "text-stone-700"}`}>Research</button>
        </nav>
      </header>
      <main className="px-6 py-10">
        {page === "goal" ? (
          <GoalPage
            plan={plan}
            onAnalyzed={setPlan}
            onOpenGraph={() => setPage("graph")}
          />
        ) : page === "research" ? (
          <ResearchPage key={target?.id ?? "search"} target={target} goal={plan?.goal.text} />
        ) : (
          <GraphPage onResearch={(person)=>{setTarget(person);setPage("research")}} />
        )}
      </main>
    </div>
  )
}
