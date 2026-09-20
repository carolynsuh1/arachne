import { useEffect, useState } from "react"
import { GoalPage } from "./pages/GoalPage"
import { GraphPage } from "./pages/GraphPage"
import { NetworkDashboardPage } from "./pages/NetworkDashboardPage"
import type { GoalNetworkResult } from "./types"

import { ResearchPage } from "./pages/ResearchPage"
import type { ResearchTarget } from "./pages/ResearchPage"

import { ProfilesPage } from "./pages/ProfilesPage"
import type { SavedProfile } from "./pages/ProfilesPage"

type Page = "goal" | "dashboard" | "graph" | "research" | "profiles"

export default function App() {
  const [profiles,setProfiles]=useState<SavedProfile[]>([])
  const [profileError,setProfileError]=useState("")
  const [activeId,setActiveId]=useState<string|undefined>(()=>localStorage.getItem("yourweb-personal-profile")??undefined)
  const activeProfile=profiles.find(p=>p.id===activeId)
  function selectProfile(id:string){setActiveId(id);localStorage.setItem("yourweb-personal-profile",id)}
  useEffect(()=>{let current=true;fetch((import.meta.env.VITE_API_URL??"http://localhost:8000")+"/my-profile").then(async r=>{if(!r.ok)throw Error("Could not load profiles. Refresh to retry.");return r.json()}).then(p=>{if(current)setProfiles(p)}).catch(e=>{if(current)setProfileError(e.message)});return()=>{current=false}},[])
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
            onClick={() => setPage("dashboard")}
            className={`rounded-full px-4 py-1.5 ${page === "dashboard" ? "bg-stone-900 text-white" : "text-stone-700"}`}
          >
            Goal views
          </button>
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
          <button onClick={()=>setPage("profiles")} className={`rounded-full px-4 py-1.5 ${page === "profiles" ? "bg-stone-900 text-white" : "text-stone-700"}`}>Profiles{activeProfile?` · ${activeProfile.name}`:""}</button>
        </nav>
      </header>
      <main className="px-6 py-10">
        {profileError&&<p role="alert" className="mb-4 text-red-700">{profileError}</p>}
        {page === "profiles" ? <ProfilesPage profiles={profiles} activeId={activeId} onSelect={selectProfile} onSaved={p=>{setProfiles(items=>[...items.filter(x=>x.id!==p.id),p]);selectProfile(p.id)}} onResearch={()=>setPage("research")}/> : page === "goal" ? (
          <GoalPage
            plan={plan}
            onAnalyzed={setPlan}
            onOpenGraph={() => setPage("graph")}
          />
        ) : page === "dashboard" ? (
          <NetworkDashboardPage onResearch={(person)=>{setTarget(person);setPage("research")}} />
        ) : page === "research" ? (
          <ResearchPage key={target?.id ?? "search"} target={target} goal={plan?.goal.text} viewerId={activeProfile?.id} viewerName={activeProfile?.name} onOpenProfiles={()=>setPage("profiles")} />
        ) : (
          <GraphPage onResearch={(person)=>{setTarget(person);setPage("research")}} />
        )}
      </main>
    </div>
  )
}
