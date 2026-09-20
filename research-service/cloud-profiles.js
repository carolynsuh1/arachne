import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {ResearchError,publicUrl} from './pipeline.js';
export function linkedinHandle(url){
 const u=new URL(publicUrl(url));
 if(!/(^|\.)linkedin\.com$/.test(u.hostname))return null;
 const match=u.pathname.match(/^\/in\/([^/]+)\/?$/);
 if(!match)throw new ResearchError('LinkedIn directories and posts are not profile sources.',422);
 return match[1];
}
export function profilePhoto(value){
 const candidate=typeof value==='string'?value:value?.url;
 try{const url=new URL(candidate);return url.protocol==='https:'&&/(^|\.)licdn\.com$/.test(url.hostname)?url.href:undefined;}catch{return undefined;}
}
export function normalizeProfile(raw,handle,retrievedAt=new Date().toISOString()){
 const data=Array.isArray(raw)?raw[0]:raw;
 if(!data || typeof data.fullName!=='string' || data.public_identifier!==decodeURIComponent(handle))throw new ResearchError('Profile provider returned an incomplete or mismatched profile.',502);
 const clean=v=>typeof v==='string'&&!v.includes('*')?v:undefined;
 const experience=(data.experience||[]).map(x=>({company:clean(x.company_name),position:clean(x.position),summary:clean(x.summary),starts_at:clean(x.starts_at),ends_at:clean(x.ends_at)})).filter(x=>Object.values(x).some(Boolean));
 const education=(data.education||[]).map(x=>({school:clean(x.school||x.college_name),degree:clean(x.degree),field_of_study:clean(x.field_of_study),starts_at:clean(x.starts_at),ends_at:clean(x.ends_at)})).filter(x=>x.school);
 const professional={name:data.fullName,headline:clean(data.headline),about:clean(data.about),experience,education};
 return {url:`https://www.linkedin.com/in/${handle}/`,title:data.fullName,text:'Provider evidence may be incomplete. Blank and masked fields are unavailable; do not infer job titles, dates, or degrees.\n\n'+JSON.stringify(professional,null,2),kind:'profile_provider',retrievedAt};
}
export function normalizeApifyProfile(raw,handle,retrievedAt=new Date().toISOString()){
 const d=Array.isArray(raw)?raw[0]:raw;
 if(!d||d.publicIdentifier!==decodeURIComponent(handle)||typeof d.firstName!=='string')throw new ResearchError('Apify returned an incomplete or mismatched profile.',502);
 const text=v=>typeof v==='string'?v:'';
 const date=v=>typeof v==='string'?v:text(v?.text)||[v?.month,v?.year].filter(Boolean).join(' ');
 const profile={photoUrl:profilePhoto(d.photo??d.profilePicture??d.profilePictureUrl),name:[d.firstName,d.lastName].filter(Boolean).join(' '),headline:text(d.headline),about:text(d.about),
  experience:(d.experience??[]).map(x=>({company:text(x.companyName),position:text(x.position),summary:text(x.description),starts_at:date(x.startDate),ends_at:date(x.endDate)})),
  education:(d.education??[]).map(x=>({school:text(x.schoolName),degree:text(x.degree),field_of_study:text(x.fieldOfStudy),starts_at:date(x.startDate),ends_at:date(x.endDate),summary:text(x.description)}))};
 return {url:`https://www.linkedin.com/in/${handle}/`,title:profile.name,text:JSON.stringify(profile,null,2),profile,provider:'apify',kind:'profile_provider',retrievedAt};
}
export function profileCachePath(dir,handle){return join(dir,createHash('sha256').update(handle).digest('hex')+'.json');}
export function cloudProfiles(provider,env=process.env,transport=fetch){
 const jobs=new Map();const cache=new Map();const inflight=new Map();const ttl=24*60*60*1000;
 async function fetchProfile(handle,signal){
  const cacheKey=env.APIFY_TOKEN?'apify-v1:'+handle:handle;
  let cached=cache.get(handle);
  if(!cached&&env.PROFILE_CACHE_DIR){try{cached=JSON.parse(await readFile(profileCachePath(env.PROFILE_CACHE_DIR,cacheKey),'utf8'));}catch{}}
  if(cached&&cached.url===`https://www.linkedin.com/in/${handle}/`&&typeof cached.text==='string'&&Date.now()-Date.parse(cached.retrievedAt)<ttl){cache.set(handle,cached);return {...cached,cached:true};}
  let result;
  if(env.APIFY_TOKEN){
   const api=async(path,options={})=>{
    let r;try{r=await transport('https://api.apify.com/v2/'+path,{...options,redirect:'error',headers:{Authorization:'Bearer '+env.APIFY_TOKEN,'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});}catch{throw new ResearchError('Apify connection interrupted. Retry to check the saved run; no automatic paid retry was started.',502);}
    if(!r.ok)throw new ResearchError(`Apify returned HTTP ${r.status}. Check the actor run and account credits.`,502);
    return r.json();
   };
   const jobPath=env.PROFILE_CACHE_DIR?profileCachePath(env.PROFILE_CACHE_DIR,'job:'+cacheKey):null;
   let run=jobs.get(handle);
   if(!run&&jobPath){try{run=JSON.parse(await readFile(jobPath,'utf8'));}catch{}}
   if(!run){
    run=(await api('actors/harvestapi~linkedin-profile-scraper/runs?timeout=120',{method:'POST',body:JSON.stringify({profileScraperMode:'Profile details no email ($4 per 1k)',queries:[`https://www.linkedin.com/in/${handle}/`]})})).data;
    if(!run?.id)throw new ResearchError('Apify did not return a run identifier.',502);
    jobs.set(handle,run);
    if(jobPath){await mkdir(env.PROFILE_CACHE_DIR,{recursive:true});await writeFile(jobPath,JSON.stringify(run));}
   }
   for(let poll=0;poll<3&&run.status!=='SUCCEEDED';poll++){
    if(['FAILED','ABORTED','TIMED-OUT'].includes(run.status))throw new ResearchError('Apify run did not succeed. Review it in Apify before starting another scrape.',502);
    run=(await api('actor-runs/'+encodeURIComponent(run.id)+'?waitForFinish=20')).data;
   }
   if(run.status!=='SUCCEEDED')throw new ResearchError('Apify is still running. Try this profile again to retrieve the same run.',502);
   result=normalizeApifyProfile(await api('datasets/'+encodeURIComponent(run.defaultDatasetId)+'/items?format=json'),handle,run.finishedAt||new Date().toISOString());
   jobs.delete(handle);
   if(jobPath)await writeFile(jobPath,'null');

  }else{
  if(!env.SCRAPINGDOG_API_KEY)throw new ResearchError('Full LinkedIn enrichment is not configured. Public-web and indexed evidence will be used instead.',422);
  const endpoint=new URL('https://api.scrapingdog.com/profile/');
  endpoint.searchParams.set('api_key',env.SCRAPINGDOG_API_KEY);endpoint.searchParams.set('type','profile');endpoint.searchParams.set('id',handle);
  if(env.SCRAPINGDOG_PREMIUM==='true')endpoint.searchParams.set('premium','true');
  let response;
  try{response=await transport(endpoint,{signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),redirect:'error'});}catch{throw new ResearchError('Profile provider unavailable or timed out.',502);}
  if(!response.ok){
   let message='';try{message=String((await response.json()).message||'');}catch{}
   if(response.status===403&&/limit reached|credits/i.test(message))throw new ResearchError('LinkedIn provider credit limit reached. Cached and public-web evidence remain available.',502);
   throw new ResearchError(`Profile provider returned HTTP ${response.status}.`,502);
  }
  result=normalizeProfile(await response.json(),handle);
  }
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(handle,result);
  if(env.PROFILE_CACHE_DIR){try{await mkdir(env.PROFILE_CACHE_DIR,{recursive:true});await writeFile(profileCachePath(env.PROFILE_CACHE_DIR,cacheKey),JSON.stringify(result));}catch{}}
  return result;
 }
 return {...provider,async scrape(url,signal){
  const handle=linkedinHandle(url);if(handle===null)return provider.scrape(url,signal);
  if(inflight.has(handle))return inflight.get(handle);
  const pending=fetchProfile(handle,signal);inflight.set(handle,pending);
  try{return await pending;}finally{inflight.delete(handle);}
 }};
}
