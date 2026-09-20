import { PersonDataPanel } from "./PersonDataPanel"
import { useEffect, useState } from "react"
import { latestResearch, researchPerson, personalizeQuestions } from "../api"
import type { ResearchInput, ResearchResult } from "../api"
export type ResearchTarget = { id:string; name:string }
function safeUrl(url:string) { try { return new URL(url).protocol === "https:" ? url : undefined } catch { return undefined } }
const inputStyle="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm"
export function ResearchPage({target:initialTarget,goal,viewerId,viewerName,onOpenProfiles,onDebrief,onBrainDump}:{target?:ResearchTarget;goal?:string;viewerId?:string;viewerName?:string;onOpenProfiles:()=>void;onDebrief?:(person:ResearchTarget)=>void;onBrainDump?:(person:ResearchTarget)=>void}) {
 const profileDirty=false
 const [target,setTarget]=useState(initialTarget)
 const [name,setName]=useState(target?.name ?? "")
 const [school,setSchool]=useState("")
 const [profile,setProfile]=useState("")
 const [meeting,setMeeting]=useState(goal || "Learn about professional experience, projects and potential collaboration.")
 const [result,setResult]=useState<ResearchResult|null>(null)
 const [busy,setBusy]=useState(false)
 const [questionBusy,setQuestionBusy]=useState(false)
 const [error,setError]=useState("")
 useEffect(()=>{let active=true;if(target){setName(target.name)};setResult(null);if(target)latestResearch(target.id).then(r=>{if(active)setResult(r)}).catch(()=>{});return()=>{active=false}},[target])
 async function run(url?:string) {
  if(busy||profileDirty)return
  setBusy(true);setError("");setResult(null)
  const input:ResearchInput={viewer_profile_id:viewerId,name,affiliation:school,goal:meeting,...(url?{profileUrl:url}:{}),...(target?{person_id:target.id}:{})}
  try {setResult(await researchPerson(input))}catch(e){setError(e instanceof Error?e.message:"Research failed")}
  finally {setBusy(false)}
 }
 return <div className="mx-auto max-w-4xl space-y-6">
  <header><p className="font-sans text-sm uppercase tracking-wide text-stone-500">Coffee-chat research</p><h1 className="mt-2 text-4xl">Know who you are meeting</h1><p className="mt-3 text-stone-600">Find a public profile, confirm the person, and prepare with sourced experience and conversation starters.</p></header>
  <section className="flex items-center justify-between rounded-xl border border-stone-300 bg-stone-50 p-5"><p>{viewerId?`Personalizing questions for ${viewerName || "your saved profile"}`:"Select your profile to personalize questions."}</p><button disabled={busy} onClick={onOpenProfiles} className="underline">{viewerId?"Manage profiles":"Choose profile"}</button></section>
  <fieldset disabled={busy}><PersonDataPanel target={target} onSelect={setTarget} name={name} result={result} onBrief={setResult}/></fieldset>
  {target && onBrainDump ? <button type="button" onClick={() => onBrainDump(target)} className="rounded-full bg-stone-900 px-5 py-2.5 text-white">Brain Dump after your chat</button> : null}
  <form onSubmit={e=>{e.preventDefault();void run(profile||undefined)}} className="rounded-xl border border-stone-300 bg-stone-50 p-5">
   <fieldset disabled={busy||profileDirty} className="space-y-4 disabled:opacity-60"><div className="grid gap-4 md:grid-cols-2">
    <label>Name<input required maxLength={120} readOnly={!!target} value={name} onChange={e=>setName(e.target.value)} className={inputStyle}/></label>
    <label>School or organization<input required maxLength={180} value={school} onChange={e=>setSchool(e.target.value)} className={inputStyle} placeholder="e.g. UC Berkeley"/></label>
   </div><label className="block">Meeting goal<textarea required maxLength={700} value={meeting} onChange={e=>setMeeting(e.target.value)} className={inputStyle}/></label>
   <label className="block">Known profile URL (optional)<input type="url" value={profile} onChange={e=>setProfile(e.target.value)} className={inputStyle} placeholder="https://www.linkedin.com/in/..."/></label>
   <button className="rounded-full bg-stone-900 px-5 py-2.5 font-sans text-sm text-white" type="submit">{busy?"Researching...":"Find and research"}</button></fieldset>
  </form>
  <p role="status" className="font-sans text-sm text-stone-600">{questionBusy?"Writing and reviewing questions against both profiles...":busy?"Checking sources. New profile scrapes can take up to 90 seconds.":result?.status==='ready'?"Brief ready. Profile claims are not independently verified.":""}</p>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
  {result&&<div className="space-y-5">
   {result.coverage==='indexed_only'&&<p className="rounded-lg bg-amber-50 p-4">Limited brief: only search-index excerpts were available.</p>}
   {result.status!=='ready'&&result.candidates?.map(c=><article key={c.url} className="rounded-xl border border-stone-300 p-4"><a href={safeUrl(c.url)} target="_blank" rel="noreferrer" className="font-medium underline">{c.title}</a><p className="my-3 text-sm text-stone-600">{c.description}</p><button disabled={busy} onClick={()=>void run(c.url)} className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white">Build brief from this match</button></article>)}
   {result.status==='ready'&&<><h2 className="text-2xl">{result.person}</h2>{result.brief_id&&<p className="font-sans text-xs text-stone-500">Saved brief{target?" for this person":""}</p>}
    {result.brief_id&&<button disabled={busy||profileDirty||!viewerId} className="rounded-full border border-stone-400 px-4 py-2 disabled:opacity-50" onClick={()=>{if(!result.brief_id||!viewerId)return;setBusy(true);setQuestionBusy(true);setError("");void personalizeQuestions(result.brief_id,viewerId,meeting).then(setResult).catch(e=>setError(e.message)).finally(()=>{setBusy(false);setQuestionBusy(false)})}}>Regenerate questions using my saved details</button>}
    <p className="text-xs text-stone-500">Saved questions reflect the details used when they were generated. Regenerate after changing your profile or meeting goal.</p>
    {onDebrief&&target?<button type="button" onClick={()=>onDebrief(target)} className="mt-3 rounded-full border border-stone-900 px-4 py-2 font-sans text-sm">Walk away and debrief</button>:null}
    {result.questions?.length?<section className="rounded-xl bg-stone-900 p-5 text-white"><h3 className="text-xl">Conversation starters</h3><ol className="mt-3 list-decimal space-y-3 pl-5">{result.questions.map((q,i)=><li key={i}>{q.text}{q.viewerEvidence&&<details className="mt-2 text-xs font-normal text-stone-300"><summary className="cursor-pointer">Why this fits you</summary><p className="mt-1">{q.viewerEvidence}</p></details>}</li>)}</ol></section>:null}
    {result.profile&&<section className="space-y-4"><p>{result.profile.headline}</p><p className="font-sans text-sm text-stone-500">{result.profile.experience.length} experience entries / {result.profile.education.length} education entries - retrieved {new Date(result.profile.retrievedAt).toLocaleString()}</p><details><summary className="cursor-pointer">About</summary><p className="mt-3 whitespace-pre-wrap">{result.profile.about}</p></details><h3 className="text-2xl">Experience</h3>{result.profile.experience.map((x,i)=><article key={i} className="rounded-xl border border-stone-300 p-4"><h4 className="text-lg">{x.position||"Title unavailable"}</h4><p>{x.company}</p><p className="font-sans text-sm text-stone-500">{[x.starts_at,x.ends_at].filter(Boolean).join(" - ")}</p>{x.summary&&<details className="mt-3"><summary className="cursor-pointer text-sm">Description</summary><p className="mt-2 whitespace-pre-wrap text-sm">{x.summary}</p></details>}</article>)}<h3 className="text-2xl">Education</h3>{result.profile.education.map((x,i)=><article key={i} className="rounded-xl border border-stone-300 p-4"><h4>{x.school}</h4><p>{[x.degree,x.field_of_study].filter(Boolean).join(" / ")}</p><p className="text-sm text-stone-500">{[x.starts_at,x.ends_at].filter(Boolean).join(" - ")}</p></article>)}</section>}
    <details><summary className="cursor-pointer">Sourced brief ({result.facts?.length||0} facts)</summary>{result.facts?.map(f=>{const s=result.sources?.find(s=>s.id===f.sourceId);return <article key={f.id} className="my-3 rounded-lg border border-stone-200 p-4"><p>{f.claim}</p>{s&&<a className="text-sm underline" href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title}</a>}<details><summary className="text-sm">Evidence</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{f.evidence}</pre></details></article>})}</details>
   </>}
   {result.discovery&&<details className="rounded-xl border border-stone-300 p-4"><summary className="cursor-pointer">Web coverage: {result.researchStats?.retrieved??0} pages retrieved / {result.researchStats?.discovered??result.discovery.length} links discovered</summary><p className="my-3 text-sm text-stone-500">Retrieved does not mean verified as the same person. Only accepted facts appear in the brief; these links are research leads.</p>{result.discovery.map(d=><div key={d.url} className="my-2"><a href={safeUrl(d.url)} target="_blank" rel="noreferrer" className="underline">{d.title}</a><span className="ml-2 text-xs">{d.status.replace('_',' ')}</span></div>)}</details>}
   {!!result.uncertainties?.length&&<section className="rounded-lg bg-amber-50 p-4"><h3>Still needs checking</h3><ul className="list-disc pl-5">{result.uncertainties.map((s,i)=><li key={i}>{s}</li>)}</ul></section>}
   {!!result.warnings?.length&&<details><summary className="cursor-pointer">Source availability</summary><ul className="list-disc pl-5 text-sm">{result.warnings.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}
  </div>}
 </div>
}
