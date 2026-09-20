import { useEffect, useState } from "react"

type FollowUp = {id:string;person_id:string;person:string;action:string;due_at:string|null;snoozed_until:string|null;bucket:string;why:string;source:{date:string;transcript:string}|null}
const base=import.meta.env.VITE_API_URL??"/api"
const date=(value:string)=>new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+"Z").toLocaleString()
export function FollowUpsPage({onResearch}:{onResearch:(person:{id:string;name:string})=>void}){
 const [rows,setRows]=useState<FollowUp[]>([])
 const [tab,setTab]=useState("active")
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 async function load(){
  const response=await fetch(base+"/follow-ups")
  if(!response.ok)throw Error("Could not load follow-ups. Try refreshing.")
  setRows(await response.json())
 }
 useEffect(()=>{void load().catch(e=>setError(e.message)).finally(()=>setLoading(false))},[])
 async function act(row:FollowUp,action:string){
  if(busy||loading)return
  setBusy(true);setError("");setNotice("")
  try{
   const response=await fetch(base+"/follow-ups/"+encodeURIComponent(row.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,days:1})})
   if(!response.ok)throw Error("Could not update follow-up. Please retry.")
   setRows(items=>items.map(item=>item.id===row.id?{...item,bucket:action==="done"?"done":action==="dismiss"?"dismissed":action==="snooze"?"snoozed":"active",snoozed_until:action==="snooze"?new Date(Date.now()+86400000).toISOString():null}:item))
   await load()
   setNotice(action==="snooze"?"Snoozed for 24 hours. The original due date is unchanged.":action==="restore"?"Follow-up restored.":"Saved. You can restore this action from History.")
  }catch(e){setError(e instanceof Error?e.message:"Update failed")}finally{setBusy(false)}
 }
 const visible=rows.filter(r=>tab==="history"?["done","dismissed"].includes(r.bucket):r.bucket===tab)
 return <div className="mx-auto max-w-4xl space-y-6">
  <header><p className="text-sm uppercase tracking-wide text-stone-500">Keep the conversation going</p><h1 className="mt-2 text-4xl">Your next moves</h1><p className="mt-3 text-stone-600">Saved commitments and follow-ups, ordered by overdue dates, upcoming dates, then undated actions.</p></header>
  <div className="flex flex-wrap gap-3">{[["active","To do"],["snoozed","Snoozed"],["history","History"]].map(([value,label])=><button key={value} onClick={()=>setTab(value)} aria-pressed={tab===value} className={`rounded-full border px-5 py-2 ${tab===value?"bg-stone-900 text-white":"border-stone-300"}`}>{label} · {rows.filter(r=>value==="history"?["done","dismissed"].includes(r.bucket):r.bucket===value).length}</button>)}<button disabled={busy||loading} className="underline" onClick={()=>{setError("");setLoading(true);void load().catch(e=>setError(e.message)).finally(()=>setLoading(false))}}>Refresh</button></div>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-green-50 p-4">{notice}</p>}
  {loading?<p role="status">Loading follow-ups…</p>:error&&!rows.length?<p>Follow-ups could not be loaded. Use Refresh to retry.</p>:!visible.length?<section className="rounded-xl border border-dashed border-stone-300 p-8"><h2 className="text-xl">{tab==="active"?"Nothing outstanding":"No actions here yet"}</h2><p className="mt-2 text-stone-600">Confirm a meeting or Brain Dump with a commitment or follow-up to add it here. We won’t invent tasks to fill this list.</p></section>:visible.map(row=><article key={row.id} className="space-y-4 rounded-xl border border-stone-300 bg-stone-50 p-6">
   <div className="flex flex-wrap justify-between gap-2"><button className="underline" onClick={()=>onResearch({id:row.person_id,name:row.person})}>{row.person}</button><span className="text-sm text-stone-600">{row.bucket==="done"?"Done":row.bucket==="dismissed"?"Not relevant":row.bucket==="snoozed"?`Returns ${date(row.snoozed_until!)}`:row.why}</span></div>
   <h2 className="text-2xl">{row.action}</h2><p className="text-sm text-stone-600">{row.due_at?`Saved reminder date: ${date(row.due_at)}. Review this date against the conversation.`:"No deadline set."}</p>
   {row.source?<details><summary className="cursor-pointer text-sm underline">Source conversation · {date(row.source.date)}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{row.source.transcript}</p></details>:<p className="text-sm text-stone-500">Saved reminder; no linked conversation available.</p>}
   <div className="flex flex-wrap gap-3">{["done","dismissed"].includes(row.bucket)?<button disabled={busy} onClick={()=>void act(row,"restore")} className="rounded-full border px-4 py-2">Restore</button>:<><button disabled={busy} onClick={()=>void act(row,"done")} className="rounded-full bg-stone-900 px-4 py-2 text-white">Done</button><button disabled={busy} onClick={()=>void act(row,row.bucket==="snoozed"?"restore":"snooze")} className="rounded-full border px-4 py-2">{row.bucket==="snoozed"?"Bring back now":"Snooze 1 day"}</button><button disabled={busy} onClick={()=>void act(row,"dismiss")} className="px-3 py-2 underline">Not relevant</button></>}</div>
  </article>)}
 </div>
}
