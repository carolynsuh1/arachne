import { useEffect, useState } from "react"
import type { ResearchResult } from "../api"

type Person = {id:string; name:string}
type Entry<T> = {id:string; created_at:string; result:T}
type Resume = {supportedFields:number; profile:unknown; verification:string}
type History = {research:Entry<ResearchResult>[]; resumes:Entry<Resume>[]}
const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
async function call<T>(path:string, options?:RequestInit):Promise<T> {
 const response = await fetch(base + "/person-data" + path, options)
 const body = await response.json()
 if(!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not save person data")
 return body
}
function Fields({value}:{value:unknown}) {
 if(value == null) return null
 if(Array.isArray(value)) return <div className="space-y-3">{value.map((v,i)=><div key={i} className="border-l border-stone-300 pl-3"><Fields value={v}/></div>)}</div>
 if(typeof value === "object") {
  const item=value as Record<string,unknown>
  if("value" in item) return item.value == null ? null : <span>{String(item.value)}{Array.isArray(item.evidence)&&<details className="text-xs text-stone-500"><summary>Document evidence</summary>{item.evidence.map((e,i)=><p key={i}>Page {e.page}: {e.text}</p>)}</details>}</span>
  return <dl className="space-y-2">{Object.entries(item).map(([k,v])=><div key={k}><dt className="font-medium capitalize">{k}</dt><dd><Fields value={v}/></dd></div>)}</dl>
 }
 return <span>{String(value)}</span>
}
export function PersonDataPanel({target,onSelect,name,result,onBrief,loadingBrief=false}:{target?:Person;onSelect:(p:Person)=>void;name:string;result:ResearchResult|null;onBrief:(r:ResearchResult)=>void;loadingBrief?:boolean}) {
 const [people,setPeople]=useState<Person[]>([])
 const [history,setHistory]=useState<History|null>(null)
 const [error,setError]=useState("")
 const [busy,setBusy]=useState(false)
 const [version,setVersion]=useState(0)
 useEffect(()=>{let active=true;call<Person[]>("").then(p=>{if(active)setPeople(p)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[version])
 useEffect(()=>{let active=true;setHistory(null);if(target)call<History>("/"+target.id).then(h=>{if(active)setHistory(h)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[target?.id,version,result?.brief_id])
 async function perform(action:()=>Promise<void>) {setBusy(true);setError("");try{await action();setVersion(v=>v+1)}catch(e){setError(e instanceof Error?e.message:"Save failed")}finally{setBusy(false)}}
 return <section className="space-y-4 rounded-xl border border-stone-300 p-5">
  <h2 className="text-2xl">Saved person data</h2>
  <p className="text-sm text-stone-600">Choose the person who owns this research and resume. Saved records stay available when you reopen them.</p>
  <select aria-label="Saved person" disabled={busy} value={target?.id??""} onChange={e=>{const p=people.find(p=>p.id===e.target.value);if(p){setError("");onSelect(p)}}} className="w-full rounded border p-2"><option value="" disabled>Select a person</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
  {!target&&<button disabled={busy||!name.trim()} className="rounded border px-3 py-2" onClick={()=>void perform(async()=>{
   const p=await call<Person>("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})})
   if(result?.brief_id)await call(`/${p.id}/research/${result.brief_id}`,{method:"POST"})
   onSelect(p)
  })}>Create person from entered name and save brief</button>}
  {target&&<>
   {result?.brief_id&&<button disabled={busy} className="rounded border px-3 py-2" onClick={()=>void perform(async()=>{await call(`/${target.id}/research/${result.brief_id}`,{method:"POST"})})}>Save current brief to {target.name}</button>}
   <label className="block">Add resume for {target.name}<input type="file" accept="application/pdf,.pdf" disabled={busy} className="mt-2 block text-sm" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;void perform(async()=>{
    if(file.size>10000000)throw new Error("PDF must be under 10 MB")
    await call(`/${target.id}/resume`,{method:"POST",headers:{"Content-Type":"application/pdf"},body:file})
   })}}/></label>
   <p className="text-xs text-stone-500">Text PDFs, up to 10 MB / 12 pages. Parsed fields and document evidence are saved in SQLite; the original PDF is not retained.</p>
  </>}
  {busy&&<p role="status">Saving / parsing. Resume parsing may take a few minutes.</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {history&&<div className="space-y-3">
   <h3>Research history ({history.research.length})</h3>
   {history.research.map(entry=><button key={entry.id} disabled={busy||loadingBrief} className="mr-3 underline disabled:opacity-50" onClick={()=>onBrief({...entry.result,brief_id:entry.id,saved:true})}>Open brief · {new Date(entry.created_at+"Z").toLocaleString()}</button>)}
   <h3>Resumes ({history.resumes.length})</h3>
   {history.resumes.map(entry=><details key={entry.id} className="rounded border p-3"><summary className="cursor-pointer">Resume · {new Date(entry.created_at+"Z").toLocaleString()} · {entry.result.supportedFields} supported fields</summary><p className="my-3 text-xs text-stone-500">{entry.result.verification}</p><Fields value={entry.result.profile}/></details>)}
  </div>}
 </section>
}
