import test from 'node:test';import assert from 'node:assert/strict';import {cloudProfiles,normalizeApifyProfile} from './cloud-profiles.js';
const profile={firstName:'Maya',lastName:'Patel',publicIdentifier:'maya',about:'Maya Patel studies at Example University.',experience:[{companyName:'Lab',position:'Researcher',description:'Built robots',startDate:{text:'Jan 2025'},endDate:{text:'Present'}}],education:[{schoolName:'Example University',degree:'BSc',fieldOfStudy:'CS'}],emails:['private@example.org'],moreProfiles:[{name:'Other'}]};
test('Apify normalization preserves titles dates descriptions and excludes contacts',()=>{const s=normalizeApifyProfile([profile],'maya');assert.equal(s.profile.experience[0].position,'Researcher');assert.equal(s.profile.experience[0].starts_at,'Jan 2025');assert.equal(s.profile.education[0].school,'Example University');assert(!s.text.includes('private@'));assert(!s.text.includes('Other'));assert.throws(()=>normalizeApifyProfile([profile],'other'),/mismatched/);});
test('Apify authenticated async run retrieves dataset and caches without another paid run',async()=>{const calls=[];const p=cloudProfiles({}, {APIFY_TOKEN:'fixture'},async(url,options)=>{calls.push(url);assert.equal(options.headers.Authorization,'Bearer fixture');assert(!url.includes('fixture'));if(options.method==='POST'){assert.equal(JSON.parse(options.body).queries.length,1);return Response.json({data:{id:'run1',status:'RUNNING'}});}if(url.includes('actor-runs'))return Response.json({data:{id:'run1',status:'SUCCEEDED',defaultDatasetId:'data1'}});return Response.json([profile]);});const signal=new AbortController().signal;const s=await p.scrape('https://www.linkedin.com/in/maya',signal);assert.equal(s.profile.experience.length,1);assert.equal((await p.scrape('https://www.linkedin.com/in/maya',signal)).cached,true);assert.equal(calls.length,3);});
test('interrupted polling resumes the same run instead of charging for a new one',async()=>{let starts=0,failed=false;const p=cloudProfiles({}, {APIFY_TOKEN:'fixture'},async(url,options)=>{if(options.method==='POST'){starts++;return Response.json({data:{id:'run1',status:'RUNNING'}});}if(url.includes('actor-runs')){if(!failed){failed=true;throw Error('disconnect');}return Response.json({data:{id:'run1',status:'SUCCEEDED',defaultDatasetId:'data1'}});}return Response.json([profile]);});const signal=new AbortController().signal;await assert.rejects(p.scrape('https://www.linkedin.com/in/maya',signal),/interrupted/);assert.equal((await p.scrape('https://www.linkedin.com/in/maya',signal)).provider,'apify');assert.equal(starts,1);});
test('public profile photos survive normalization; unsafe URLs are discarded',()=>{
 const photo='https://media.licdn.com/dms/image/profile.jpg';
 assert.equal(normalizeApifyProfile({...profile,photo},'maya').profile.photoUrl,photo);
 assert.equal(normalizeApifyProfile({...profile,photo:{url:photo}},'maya').profile.photoUrl,photo);
 assert.equal(normalizeApifyProfile({...profile,photo:'https://evil.example/photo'},'maya').profile.photoUrl,undefined);
 assert.equal(normalizeApifyProfile({...profile,photo:'javascript:alert(1)'},'maya').profile.photoUrl,undefined);
});
test('legacy cached profiles are refreshed once to capture photos, then reused',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {profileCachePath}=await import('./cloud-profiles.js');
 const dir=await mkdtemp(join(tmpdir(),'photo-cache-'));
 try {
  const old=normalizeApifyProfile(profile,'maya');delete old.photoChecked;
  await writeFile(profileCachePath(dir,'apify-v1:maya'),JSON.stringify(old));
  let runs=0;
  const p=cloudProfiles({}, {APIFY_TOKEN:'fixture',PROFILE_CACHE_DIR:dir},async(url,options)=>{
   if(options.method==='POST'){runs++;return Response.json({data:{id:'photo-run',status:'SUCCEEDED',defaultDatasetId:'photos'}});}
   return Response.json([{...profile,photo:'https://media.licdn.com/photo.jpg'}]);
  });
  const signal=new AbortController().signal;
  assert.equal((await p.scrape('https://www.linkedin.com/in/maya',signal)).profile.photoUrl,'https://media.licdn.com/photo.jpg');
  assert.equal((await p.scrape('https://www.linkedin.com/in/maya',signal)).cached,true);
  assert.equal(runs,1);
 } finally {await rm(dir,{recursive:true,force:true});}
});
