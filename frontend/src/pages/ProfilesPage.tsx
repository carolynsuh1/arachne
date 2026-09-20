import {useState} from "react"

type LinkedInData={url:string;retrievedAt:string;name:string;headline:string;about:string;experience:{company:string;position:string;summary:string;starts_at:string;ends_at:string}[];education:{school:string;degree:string;field_of_study:string}[]}
export type SavedProfile={id:string;name:string;school:string;background:string;interests:string;goals:string;contribution:string;linkedin?:LinkedInData|null}
const empty=():SavedProfile=>({id:crypto.randomUUID(),name:"",school:"",background:"",interests:"",goals:"",contribution:""})
const fields:{key:Exclude<keyof SavedProfile,"id"|"linkedin">;label:string;max:number}[]=[
 {key:"name",label:"Name",max:120},{key:"school",label:"School / current role",max:180},
 {key:"background",label:"Background and experience",max:1200},{key:"interests",label:"Interests",max:700},
 {key:"goals",label:"Goals",max:700},{key:"contribution",label:"What I can offer",max:700},
]
export function ProfilesPage({profiles,activeId,onSelect,onSaved,onResearch}:{profiles:SavedProfile[];activeId?:string;onSelect:(id:string)=>void;onSaved:(p:SavedProfile)=>void;onResearch:()=>void}){
 const [draft,setDraft]=useState<SavedProfile|null>(null)
 const [linkedinUrl,setLinkedinUrl]=useState("")
 const [imported,setImported]=useState<LinkedInData|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 async function importLinkedIn(){
  setBusy(true);setError("");setImported(null)
  try{
   const response=await fetch((import.meta.env.VITE_API_URL??"http://localhost:8000")+"/my-profile/import-linkedin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profileUrl:linkedinUrl})})
   const data=await response.json()
   if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Import failed')
   setImported(data)
  }catch(e){setError(e instanceof Error?e.message:"Import failed")}finally{setBusy(false)}
 }
 async function save(){
  if(!draft||!draft.name.trim())return
  setBusy(true);setError("")
  try{
   const {id,...details}=draft
   const response=await fetch((import.meta.env.VITE_API_URL??"http://localhost:8000")+"/my-profile/"+id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(details)})
   if(!response.ok)throw Error("Could not save your profile. Please retry.")
   const profile={id,...await response.json()}
   onSaved(profile);setDraft(null);setNotice(`${profile.name}'s profile saved and selected. Research will use these details.`)
  }catch(e){setError(e instanceof Error?e.message:"Save failed")}finally{setBusy(false)}
 }
 return <div className="mx-auto max-w-5xl space-y-6">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm uppercase tracking-wide text-stone-500">Your identity in YourWeb</p><h1 className="mt-2 text-4xl">Profiles</h1><p className="mt-3 text-stone-600">Save your details once. Choose a profile to make your research and coffee-chat questions personal.</p></div><button disabled={!!draft} onClick={()=>{setDraft(empty());setImported(null);setLinkedinUrl("");setError("");setNotice("")}} className="rounded-full bg-stone-900 px-5 py-3 text-white">Create profile</button></header>
  <p className="text-xs text-stone-500">Local team workspace: profiles are shared here, without private accounts or sign-in. Profile details are sent to AI for question generation.</p>
  {notice&&<p role="status" className="rounded-lg bg-green-50 p-4">{notice}</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {draft?<form onSubmit={e=>{e.preventDefault();void save()}} className="space-y-4 rounded-xl border border-stone-300 p-6"><h2 className="text-2xl">{profiles.some(p=>p.id===draft.id)?"Edit profile":"Create your profile"}</h2><section className="space-y-3 rounded-lg bg-stone-50 p-4"><h3 className="text-lg">Start with your LinkedIn</h3><p className="text-sm text-stone-600">Import your public experience and education, then review before adding it. Your goals, interests and contribution stay yours to write.</p><label className="block text-sm">Your LinkedIn URL<input type="url" value={linkedinUrl} disabled={busy} onChange={e=>setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/your-name/" className="mt-2 w-full rounded border p-2"/></label><button type="button" disabled={busy||!linkedinUrl.trim()} onClick={()=>void importLinkedIn()} className="rounded-full border border-stone-400 px-4 py-2">{busy?"Working...":"Import my LinkedIn"}</button>{busy&&<p role="status" className="text-sm">Imports can take up to 95 seconds. Leave this form open.</p>}{imported&&<div className="space-y-2 rounded-lg border p-4"><h4 className="text-xl">{imported.name}</h4><p>{imported.headline}</p><p className="text-sm">{imported.experience.length} experience entries / {imported.education.length} education entries</p><details><summary>Review experience and education</summary>{imported.experience.map((x,i)=><p key={'job'+i} className="my-2 text-sm">{x.position} · {x.company} · {[x.starts_at,x.ends_at].filter(Boolean).join(' - ')}</p>)}{imported.education.map((x,i)=><p key={'edu'+i} className="my-2 text-sm">{x.school} · {x.degree}</p>)}</details><button type="button" onClick={()=>{setDraft({...draft,linkedin:imported,name:draft.name||imported.name,school:draft.school||(imported.education[0]?.school??'').slice(0,180),background:draft.background||imported.headline.slice(0,1200)});setImported(null)}} className="rounded-full bg-stone-900 px-4 py-2 text-white">This is me - add to profile</button><button type="button" onClick={()=>setImported(null)} className="ml-3 underline">Discard</button></div>}{draft.linkedin&&<div className="text-sm"><p>LinkedIn attached: {draft.linkedin.name} · {draft.linkedin.experience.length} experience entries · {draft.linkedin.education.length} education entries</p><button type="button" disabled={busy} onClick={()=>setDraft({...draft,linkedin:null})} className="underline">Remove imported data</button></div>}</section><fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">{fields.map(f=><label key={f.key}>{f.label}<textarea required={f.key==='name'} maxLength={f.max} rows={f.key==='background'?4:2} value={draft[f.key]} onChange={e=>setDraft({...draft,[f.key]:e.target.value})} className="mt-2 w-full rounded-lg border border-stone-300 p-3"/></label>)}</fieldset><div className="flex gap-3"><button disabled={busy||!draft.name.trim()} className="rounded-full bg-stone-900 px-5 py-2 text-white" type="submit">{busy?"Saving…":"Save profile"}</button><button disabled={busy} type="button" onClick={()=>setDraft(null)}>Cancel</button></div></form>:<>
   {!profiles.length&&<div className="rounded-xl border border-dashed border-stone-300 p-10 text-center">No profiles yet. Create yours to get started.</div>}
   <div className="grid gap-5 md:grid-cols-2">{profiles.map(p=><article key={p.id} className={`space-y-3 rounded-xl border p-6 ${activeId===p.id?"border-stone-900 bg-stone-50":"border-stone-300"}`}><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-900 text-white">{(p.name||"?").split(" ").filter(Boolean).slice(0,2).map(n=>n[0]).join("")}</span><div><h2 className="text-2xl">{p.name||"Unnamed profile"}</h2><p className="text-sm text-stone-500">{p.school}</p></div></div>{activeId===p.id&&<p className="text-sm font-medium">Active profile</p>}<p className="whitespace-pre-wrap text-sm">{p.background}</p>{p.linkedin&&<details className="text-sm"><summary className="cursor-pointer">LinkedIn background · {p.linkedin.experience.length} roles / {p.linkedin.education.length} education entries</summary>{p.linkedin.experience.map((x,i)=><p key={i} className="my-2">{x.position} · {x.company}</p>)}{p.linkedin.education.map((x,i)=><p key={'edu'+i} className="my-2">{x.school} · {x.degree}</p>)}</details>}{p.interests&&<p className="text-sm"><strong>Interests:</strong> {p.interests}</p>}{p.goals&&<p className="text-sm"><strong>Goals:</strong> {p.goals}</p>}{p.contribution&&<p className="text-sm"><strong>Can offer:</strong> {p.contribution}</p>}<div className="flex gap-4"><button className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white" onClick={()=>{onSelect(p.id);onResearch()}}>Use profile for research</button><button className="text-sm underline" onClick={()=>{setDraft({...p});setImported(null);setLinkedinUrl(p.linkedin?.url??"");setNotice("")}}>Edit</button></div></article>)}</div>
  </>}
 </div>
}
