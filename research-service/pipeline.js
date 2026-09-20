import {sameAffiliation} from './identity.js';
import { createHash } from 'node:crypto';

export class ResearchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function publicUrl(value) {
  let u;
  try { u = new URL(value); } catch { throw new ResearchError('Invalid profile URL.'); }
  // Deliberately accept HTTPS domain names only, never IP literals or credentials.
  const h = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
      !h.includes('.') || h.includes(':') || /^[\d.]+$/.test(h) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(h)) {
    throw new ResearchError('Use an HTTPS public professional profile URL.');
  }
  u.hash = '';
  return u.href;
}
export function validateInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ResearchError('Expected a JSON object.');
  const input = {};
  for (const [key, max] of [['name', 120], ['affiliation', 180], ['goal', 700]]) {
    if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > max) {
      throw new ResearchError(`${key} is required (maximum ${max} characters).`);
    }
    input[key] = raw[key].trim();
  }
  if (raw.profileUrl != null && typeof raw.profileUrl !== 'string') throw new ResearchError('profileUrl must be a string.');
  input.profileUrl = raw.profileUrl ? publicUrl(raw.profileUrl) : null;
  const profile = raw.viewerProfile ?? {};
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new ResearchError('Invalid personal profile.');
  input.viewerProfile = {};
  for (const [key,max] of [['name',120],['school',180],['background',1200],['interests',700],['goals',700],['contribution',700],['professionalBackground',14000]]) {
    const value=profile[key]??'';
    if(typeof value!=='string'||value.length>max)throw new ResearchError(`Invalid personal profile ${key}.`);
    input.viewerProfile[key]=value.trim();
  }
  input.refresh = raw.refresh === true;
  return input;
}
const normalize = text => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const contains = (body, quote) => normalize(quote).length >= 12 && normalize(body).includes(normalize(quote));

function profileKey(value) {
  const url = new URL(publicUrl(value));
  const host = /(^|\.)linkedin\.com$/.test(url.hostname) ? 'linkedin.com' : url.hostname;
  return `${host}${url.pathname.replace(/\/$/, '')}${url.search}`;
}
export function linksToProfile(text, profileUrl) {
  // Compare actual Markdown link targets, never substring/name similarity.
  const targets = [...text.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)].map(match => match[1]);
  return targets.some(target => {
    try { return profileKey(target) === profileKey(profileUrl); } catch { return false; }
  });
}

// This proves quotation presence and citation integrity, not semantic truth.
export function acceptExtraction(raw, sources, person) {
  const accepted = new Set();
  const warnings = [];
  for (const check of raw.identity ?? []) {
    const source = sources.find(s => s.id === check.sourceId);
    const nameEvidence = check.nameEvidence ?? check.evidence;
    const affiliationEvidence = check.affiliationEvidence ?? check.evidence;
    const backed = (quote, expected) => typeof quote === 'string' && normalize(quote).includes(normalize(expected)) && normalize(source?.text).includes(normalize(quote));
    if (source && check.matches === true && backed(nameEvidence, person.name) &&
        (typeof affiliationEvidence==='string' && sameAffiliation(affiliationEvidence,person.affiliation) && normalize(source.text).includes(normalize(affiliationEvidence)))) accepted.add(source.id);
  }
  const facts = [];
  const structured=new Set();
  for(const source of sources){
    if(source.kind!=='profile_provider'||!accepted.has(source.id))continue;
    try{
      const data=source.profile??JSON.parse(source.text.slice(source.text.indexOf('{')));
      if(typeof data.name!=='string'||!Array.isArray(data.experience))continue;
      structured.add(source.id);
      const add=(claim,evidence)=>facts.push({id:`f${facts.length+1}`,claim,evidence,sourceId:source.id,sourceKind:source.kind,date:null});
      if(data.about)add('Profile About excerpt: '+data.about,data.about);
      for(const job of data.experience)if(job.company)add('Profile experience lists '+job.company+(job.position?' — '+job.position:'. Job title unavailable.'),JSON.stringify(job,null,2));
      for(const edu of data.education??[])if(edu.school)add('Profile education lists '+edu.school+(edu.degree?' — '+edu.degree:''),JSON.stringify(edu,null,2));
    }catch{/* Non-structured provider content follows ordinary quote validation. */}
  }
  for (const fact of raw.facts ?? []) {
    const source = sources.find(s => s.id === fact.sourceId);
    if(structured.has(source?.id))continue;
    if (source && accepted.has(source.id) && typeof fact.claim === 'string' && fact.claim.trim() &&
        contains(source.text, fact.evidence)) {
      if(facts.some(f=>f.sourceId===source.id && f.evidence===fact.evidence && (source.kind==='search_index'||normalize(f.claim)===normalize(fact.claim))))continue;
      facts.push({ id: `f${facts.length + 1}`, claim: source.kind==='search_index' ? 'Search excerpt: '+fact.evidence : fact.claim, sourceId: source.id,
        evidence: fact.evidence, sourceKind:source.kind??'page', date: typeof fact.date === 'string' ? fact.date : null });
    } else warnings.push('An unsupported or identity-ambiguous fact was excluded.');
  }
  return { facts: facts.slice(0, 60), accepted, warnings,
    uncertainties: (raw.uncertainties ?? []).filter(s => typeof s === 'string').slice(0, 8) };
}
export function acceptQuestions(raw, facts, limit=3) {
  const ids = new Set(facts.map(f => f.id));
  return (raw.questions ?? []).filter(q => typeof q.text === 'string' && q.text.trim() &&
    Array.isArray(q.factIds) && q.factIds.length > 0 && q.factIds.every(id => ids.has(id)))
    .slice(0, limit).map(q => ({ text: q.text, factIds: q.factIds, kind:q.kind, viewerEvidence:typeof q.viewerEvidence==='string'?q.viewerEvidence:'', label: 'AI-suggested question; review before use' }));
}

export function createResearcher(provider, { ttlMs = 3_600_000, now = Date.now } = {}) {
  const cache = new Map();
  return async function research(raw) {
    const input = validateInput(raw);
    const key = createHash('sha256').update(JSON.stringify({ ...input, refresh: false })).digest('hex');
    const existing = cache.get(key);
    if (!input.refresh && existing && existing.expires > now()) return { ...structuredClone(existing.value), cached: true };
    const signal = AbortSignal.timeout(90_000);
    const base = { mode: provider.mode, person: input.name, affiliation: input.affiliation, goal: input.goal,
      generatedAt: new Date(now()).toISOString(), cached: false, facts: [], questions: [], sources: [], warnings: [] };
    let candidates = [];
    try { candidates = await provider.search(input, signal); }
    catch (error) {
      if (!input.profileUrl) throw error;
      base.warnings.push('Search failed; research is limited to the confirmed profile.');
    }
    const unique = new Map();
    for (const c of candidates) {
      try { const url = publicUrl(c.url); unique.set(url, { url, title: String(c.title ?? url).slice(0, 300), description: String(c.description ?? '').slice(0, 650) }); } catch { /* Ignore unsuitable URLs. */ }
    }
    candidates = [...unique.values()].slice(0, 5);
    if (!input.profileUrl) return { ...base, status: candidates.length ? 'needs_confirmation' : 'insufficient_information',
      candidates, uncertainties: ['Choose the correct profile and resubmit its URL. Search results are not verified identities.'] };
    if(provider.searchBroader){
      try{const extra=await provider.searchBroader(input,signal);for(const c of extra){try{const url=publicUrl(c.url);if(!candidates.some(x=>x.url===url))candidates.push({url,title:String(c.title??url).slice(0,300),description:String(c.description??'').slice(0,650)});}catch{}}}
      catch{base.warnings.push('Broader web search was unavailable.');}
    }
    const usable=candidates.filter(c=>{const u=new URL(c.url);return !/(^|\.)(signalhire\.com|rocketreach\.co|zoominfo\.com|spokeo\.com|openpayrolls\.com|whitepages\.com|truepeoplesearch\.com)$/.test(u.hostname) && !(/(^|\.)linkedin\.com$/.test(u.hostname)&&!/^\/in\//.test(u.pathname));});
    const priority=c=>{const h=new URL(c.url).hostname;return /(^|\.)(facebook.com|instagram.com|x.com|linkedin.com)$/.test(h)?0:2;};
    usable.sort((a,b)=>priority(b)-priority(a));
    const byProfile=new Map();for(const url of [input.profileUrl,...usable.map(c=>c.url)])if(!byProfile.has(profileKey(url)))byProfile.set(profileKey(url),url);
    const urls = [...byProfile.values()].slice(0, 10);
    const outcomes=[];
    for(let offset=0;offset<urls.length;offset+=2)outcomes.push(...await Promise.allSettled(urls.slice(offset,offset+2).map(url=>provider.scrape(url,signal))));
    const sources = [];
    for (let i = 0; i < outcomes.length; i++) {
      const result = outcomes[i];
      if (result.status === 'fulfilled' && typeof result.value.text === 'string' && result.value.text.trim()) {
        try {
          sources.push({ id: `s${i + 1}`, url: publicUrl(result.value.url ?? urls[i]), requestedUrl: urls[i],
            title: String(result.value.title ?? urls[i]), kind:result.value.kind??'page', profile:result.value.profile, provider:result.value.provider, text: result.value.text.slice(0, result.value.profile?32000:12000),
            cached:result.value.cached===true, retrievedAt: result.value.retrievedAt??new Date(now()).toISOString() });
          if(result.value.kind==='profile_provider')base.warnings.push('Profile-provider fields may be blank, masked or truncated. Missing job titles, dates and degrees are not inferred.');
        } catch { base.warnings.push('A source returned an unsuitable URL.'); }
      } else base.warnings.push(`Could not extract ${urls[i]}. ${result.reason instanceof ResearchError ? result.reason.message : ''}`);
    }
    // An indexed excerpt is evidence only of what the search index returned, not a fetched page.
    const selected=candidates.find(c=>{try{return profileKey(c.url)===profileKey(input.profileUrl);}catch{return false;}});
    if(selected?.description){
      sources.push({id:'indexed-profile',url:selected.url,requestedUrl:input.profileUrl,title:selected.title,
        text:selected.title+'\n\n'+selected.description,kind:'search_index',retrievedAt:new Date(now()).toISOString()});
      base.warnings.push('Search-index excerpts supplement the available page evidence and may be incomplete or outdated.');
    }
    base.discovery = candidates.map(c=>({...c,status:sources.some(s=>profileKey(s.url)===profileKey(c.url)&&s.kind!=='search_index')?'retrieved':urls.includes(c.url)?'unavailable':'not_read'}));
    base.researchStats={discovered:candidates.length,attempted:urls.length,retrieved:sources.filter(s=>s.kind!=='search_index').length};
    base.sources = sources.map(({ text, requestedUrl, profile, ...source }) => source);
    if (!sources.length) return { ...base, status: 'insufficient_information', uncertainties: ['No readable sources.'] };
    const extraction = acceptExtraction(await provider.extract(input, sources, signal), sources, input);
    const anchor = sources.find(s => s.requestedUrl === input.profileUrl && extraction.accepted.has(s.id));
    const linkedProfile = sources.find(s => extraction.accepted.has(s.id) && linksToProfile(s.text, input.profileUrl));
    // A user-supplied link alone is not proof: require supporting name + affiliation evidence.
    if (!anchor && !linkedProfile) return { ...base, status: sources.some(s => s.requestedUrl === input.profileUrl) ? 'needs_confirmation' : 'source_unavailable', candidates,
      uncertainties: [sources.some(s => s.requestedUrl === input.profileUrl) ? 'The readable profile did not establish both the name and school. Check the school wording and source evidence.' : 'The selected page could not be read, and other sources did not corroborate it. This does not mean you selected the wrong person.'] };
    base.identity = { status: (anchor??linkedProfile).kind==='search_index'?'indexed_match_not_verified':'corroborated_not_independently_verified', sourceId: (anchor ?? linkedProfile).id,
      method: anchor ? (anchor.kind==='search_index'?'Selected profile search-index excerpt':'Confirmed profile content') : 'Name and affiliation plus explicit link to confirmed profile' };
    if(anchor?.profile)base.profile={...anchor.profile,sourceId:anchor.id,retrievedAt:anchor.retrievedAt,provider:anchor.provider};
    base.facts = extraction.facts;
    base.warnings.push(...extraction.warnings);
    if (!base.facts.length) return { ...base, status: 'insufficient_information', uncertainties: extraction.uncertainties };
    try {
      Object.assign(base, await generateQuestions(provider, input, base.facts, signal));
    }
    catch { base.warnings.push('Question generation failed; supported facts are still available.'); }
    const result = { ...base, status: 'ready', coverage:base.facts.every(f=>f.sourceKind==='search_index')?'indexed_only':base.facts.some(f=>f.sourceKind==='search_index')?'mixed':'retrieved_sources', uncertainties: base.facts.every(f=>f.sourceKind==='search_index') ? ['Only search-index excerpts were available. The full profile, current status, experience, education details and projects have not been verified.','Truncated phrases are preserved as incomplete text and must not be expanded into claims.'] : extraction.uncertainties,
      verification: 'Quotes checked against retrieved text; identity and interpretation still require human review.' };
    if (!base.warnings.length) {
      for (const [k, v] of cache) if (v.expires <= now()) cache.delete(k);
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { expires: now() + ttlMs, value: structuredClone(result) });
    }
    return result;
  };
}


export async function generateQuestions(provider, raw, facts, signal=AbortSignal.timeout(90000)) {
  const input=validateInput(raw);
  if(!Array.isArray(facts)||!facts.length||facts.length>60||facts.some(f=>typeof f.id!=='string'||typeof f.claim!=='string'))throw new ResearchError('A saved brief with sourced facts is required.');
  const personalValues=Object.values(input.viewerProfile).filter(Boolean);
  const candidates=acceptQuestions(await provider.questions(input,facts,signal),facts,6).map(q=>({...q,text:q.text.replace(/;\s*([a-z]?)/g,(_,letter)=>". "+letter.toUpperCase())})).filter(q=>
    provider.mode!=='live'||(q.text.trim().split(/\s+/).length<=35&&!q.text.includes(';')&&!/\band (how|what|why|which)\b/i.test(q.text)&&(!personalValues.length||(q.viewerEvidence.trim().length>0&&q.viewerEvidence.length<=120&&personalValues.some(value=>value.includes(q.viewerEvidence)))))
  );
  const tagged=provider.mode==='live'&&personalValues.length&&candidates.some(q=>q.kind);
  const questions=tagged?['connection','advice','story'].map(kind=>candidates.find(q=>q.kind===kind&&(kind==='story'||/\b(i|my|i'm)\b/i.test(q.text)))).filter(Boolean):candidates.slice(0,3);
  if(tagged&&questions.length<3)throw new ResearchError('Could not create a full set connecting your background and goals. Try regenerating.',502);
  if(!questions.length)throw new ResearchError('No supported questions were generated.',502);
  return {questions, personalization:{profile:input.viewerProfile, goal:input.goal, generatedAt:new Date().toISOString()}};
}
