const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function sourceLink(url,label){const safe=safeUrl(url);return safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(label);}
let lastInput=null,running=false;
function showResults(data){
 const sources=new Map((data.sources??[]).map(s=>[s.id,s]));
 let html='';
 if(data.coverage==='indexed_only')html+='<div class="warning"><b>Limited brief — search-index evidence only</b><br>The full profile could not be retrieved. These excerpts may be incomplete or outdated; experience and education details are not verified.</div>';
 else if(data.coverage==='mixed')html+='<div class="warning">This brief combines readable pages and search-index excerpts. Each item identifies its evidence type.</div>';
 if(data.status==='ready'){
  html+=`<h2 style="margin-top:22px">${esc(data.person)}</h2><p>${esc(data.affiliation)}</p><span class="pill">${data.cached?'CACHED BRIEF':(data.sources??[]).some(s=>s.cached)?'RESEARCH WITH CACHED SOURCES':'LIVE RESEARCH'}</span><p class="source-note">${esc(data.verification)}</p><div class="research-facts">`;
  for(const fact of data.facts??[]){const source=sources.get(fact.sourceId);html+=`<article class="candidate"><span class="pill">${fact.sourceKind==='search_index'?'SEARCH EXCERPT':fact.sourceKind==='profile_provider'?'PROFILE PROVIDER':'READABLE PAGE'}</span><p>${esc(fact.claim)}</p>${source?sourceLink(source.url,source.title):''}${source?.retrievedAt?'<p class="source-note">Source retrieved '+esc(source.retrievedAt)+(source.cached?' · cached':'')+'</p>':''}<details><summary>View source evidence</summary><blockquote>${esc(fact.evidence)}</blockquote></details></article>`;}
  html+='</div>';
  if(data.profile){const p=data.profile;html+=`<section><h3>LinkedIn profile details</h3><p>${esc(p.headline)}</p><span class="pill">${p.experience.length} EXPERIENCE ENTRIES · ${p.education.length} EDUCATION ENTRIES</span><p class="source-note">Profile-reported information via Apify. Retrieved ${esc(p.retrievedAt)}.</p><details><summary>About</summary><p style="white-space:pre-wrap">${esc(p.about)}</p></details><h3 style="margin-top:20px">Experience</h3>${p.experience.map(x=>`<article class="candidate"><h3>${esc(x.position||'Title unavailable')}</h3><p>${esc(x.company)}</p><div class="source-note">${esc([x.starts_at,x.ends_at].filter(Boolean).join(' - '))}</div>${x.summary?`<details><summary>Role description</summary><p style="white-space:pre-wrap">${esc(x.summary)}</p></details>`:''}</article>`).join('')}<h3>Education</h3>${p.education.map(x=>`<article class="candidate"><h3>${esc(x.school)}</h3><p>${esc([x.degree,x.field_of_study].filter(Boolean).join(' · '))}</p><div class="source-note">${esc([x.starts_at,x.ends_at].filter(Boolean).join(' - '))}</div>${x.summary?`<details><summary>Details</summary><p style="white-space:pre-wrap">${esc(x.summary)}</p></details>`:''}</article>`).join('')}</section>`;}
  if(data.questions?.length)html+=`<h3>Conversation starters</h3><ol>${data.questions.map(q=>`<li>${esc(q.text)}</li>`).join('')}</ol><p class="source-note">${data.coverage==='indexed_only'?'General prompts because detailed profile evidence is unavailable.':'AI-suggested questions; review before using.'}</p>`;
 }else{
  html+=`<h3 style="margin-top:22px">${data.candidates?.length?'Possible matches':'No supported brief yet'}</h3><p class="source-note">Search results are discovery leads, not verified facts about this person. Check the profile before choosing it.</p>`;
 }
 if(data.status!=='ready')for(const [i,candidate] of (data.candidates??[]).entries()){
  html+=`<article class="candidate"><h3>${sourceLink(candidate.url,candidate.title)}</h3>${candidate.description?`<p>${esc(candidate.description)}</p>`:''}<div class="source-note">${esc(candidate.url)}</div><div class="toolbar"><button type="button" data-candidate="${i}">Build brief from this match</button></div></article>`;
 }
 if(data.researchStats)html+=`<p class="source-note">${esc(data.researchStats.discovered)} results discovered · ${esc(data.researchStats.attempted)} pages attempted · ${esc(data.researchStats.retrieved)} sources read</p>`;
 if(data.discovery?.length)html+=`<details><summary>All research leads (${data.discovery.length})</summary><p>Discovery results may refer to someone else. Excerpts below are search-index text, not verified facts.</p>${data.discovery.map(c=>`<article class="candidate">${sourceLink(c.url,c.title)}<p>${esc(c.description)}</p><span class="pill">${esc(c.status==='retrieved'?'PAGE READ — CHECK IDENTITY':c.status==='unavailable'?'PAGE UNAVAILABLE':'DISCOVERY ONLY')}</span></article>`).join('')}</details>`;
 if(data.uncertainties?.length)html+=`<div class="warning"><b>What still needs checking</b><ul>${data.uncertainties.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`;
 if(data.warnings?.length)html+=`<details><summary>Source availability (${data.warnings.length})</summary><ul>${data.warnings.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details>`;
 if(data.status!=='ready')html+='<p class="source-note">If the right person is missing, try their school’s full name or add a known public profile above. Some sites, including LinkedIn, may not be extractable by the web provider.</p>';
 $('searchResults').innerHTML=html;
 $('searchResults').querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>runSearch({...lastInput,profileUrl:data.candidates[Number(button.dataset.candidate)].url}));
}
async function runSearch(input){
 if(running)return;running=true;lastInput={...input};
 $('searchButton').disabled=true;for(const element of $('peopleSearch').elements)element.disabled=true;
 $('searchResults').innerHTML='';$('searchStatus').textContent=input.profileUrl?'Reading sources and checking identity before preparing the brief…':'Searching public profiles for this name and school…';
 try{
  const response=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(100000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Search failed');
  showResults(data);
  if(input.profileUrl && data.status!=='ready'){$('searchStatus').textContent=data.status==='source_unavailable'?'The selected page could not be read. Open Source availability below for the reason.':'The readable sources did not establish both the name and school. Review the details below.';return;}
  $('searchStatus').textContent=data.status==='ready'?`${data.coverage==='indexed_only'?'Limited brief':'Brief'} ready for ${data.person}. Review the evidence below.`:data.candidates?.length?`Found ${data.candidates.length} possible matches for ${data.person}. Choose the correct source below.`:'No supported match found. Try a more specific school or known profile URL.';
 }catch(error){$('searchStatus').textContent=`Search failed: ${error.name==='TimeoutError'?'The request timed out. Please try again.':error.message}`;}
 finally{running=false;for(const element of $('peopleSearch').elements)element.disabled=false;}
}
$('peopleSearch').addEventListener('submit',event=>{event.preventDefault();runSearch({name:$('personName').value.trim(),affiliation:$('personSchool').value.trim(),goal:$('personGoal').value.trim()||'Learn about professional experience, projects, research, and possible collaboration for a coffee chat.',...($('personUrl').value.trim()?{profileUrl:$('personUrl').value.trim()}:{})});});
