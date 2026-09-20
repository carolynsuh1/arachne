import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createResearcher,ResearchError,generateQuestions} from './pipeline.js';
import {liveProvider} from './providers.js';
import {cloudProfiles,linkedinHandle} from './cloud-profiles.js';
const selfProfiles=cloudProfiles({scrape:async()=>{throw new ResearchError('Use a LinkedIn profile URL.',422)}});
export async function importSelfProfile(input,provider=selfProfiles){
 const url=input?.profileUrl;
 if(typeof url!=='string'||url.length>1500||!linkedinHandle(url))throw new ResearchError('Use a LinkedIn /in/ profile URL.',422);
 const source=await provider.scrape(url,AbortSignal.timeout(95000));
 const profile=source.profile??JSON.parse(source.text.slice(source.text.indexOf('{')));
 return {profile,url:source.url,retrievedAt:source.retrievedAt,cached:!!source.cached};
}
import {parseDocument} from './resume-parser.js';
const here=dirname(fileURLToPath(import.meta.url));
export function buildWebServer(research,{origin='http://127.0.0.1:8790',hourlyLimit=100,concurrentLimit=2,now=Date.now,questionProvider}={}){
 const expected=new URL(origin);let active=0,hourStart=now(),requests=0;
 return http.createServer(async(req,res)=>{
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(req.method==='GET' && req.url==='/health')return send(200,{ok:true});
  if(req.headers.host!==expected.host || (req.headers.origin && req.headers.origin!==expected.origin))return send(403,{error:'Use this application origin.'});
  const files={'/':['index.html','text/html; charset=utf-8'],'/search.js':['search.js','text/javascript; charset=utf-8']};
  if(req.method==='GET'&&files[req.url]){try{const [file,type]=files[req.url];const content=await readFile(resolve(here,'web',file));res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(content);}catch{return send(500,{error:'App files unavailable.'});}}
  if(req.method!=='POST'||!['/api/research','/api/resume','/api/questions','/api/self-profile'].includes(req.url))return send(404,{error:'Not found'});
  if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Send JSON.'});
  if(now()-hourStart>=3600000){hourStart=now();requests=0;}
  if(active>=concurrentLimit||requests>=hourlyLimit){res.setHeader('Retry-After','60');return send(429,{error:'Research capacity reached. Please try later.'});}
  let body='';try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>(req.url==='/api/resume'?200000:req.url==='/api/questions'?100000:30000))return send(413,{error:'Request too large.'});}}catch{return send(400,{error:'Request interrupted.'});}
  let input;try{input=JSON.parse(body);}catch{return send(400,{error:'Invalid JSON.'});}
  if(active>=concurrentLimit||requests>=hourlyLimit)return send(429,{error:'Research capacity reached. Please try later.'});
  requests++;active++;
  try{return send(200,await (req.url==='/api/self-profile'?importSelfProfile(input):req.url==='/api/resume'?parseDocument(input):req.url==='/api/questions'?generateQuestions(questionProvider??liveProvider(),input,input.facts):research(input)));}
  catch(error){return send(error instanceof ResearchError?error.status:502,{error:error instanceof ResearchError?error.message:'Research failed. Please try again.'});}
  finally{active--;}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||8790),host=process.env.HOST||'127.0.0.1';
 if(host==='0.0.0.0'&&!process.env.PUBLIC_ORIGIN)throw Error('Set PUBLIC_ORIGIN to your deployed HTTPS URL before exposing this service.');
 const origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
 const server=buildWebServer(createResearcher(cloudProfiles(liveProvider())),{origin,hourlyLimit:Number(process.env.RESEARCH_HOURLY_LIMIT||100)});
 server.requestTimeout=110000;
 server.listen(port,host,()=>console.log(`People research ready: ${origin}; LinkedIn provider ${process.env.APIFY_TOKEN?'Apify configured':process.env.SCRAPINGDOG_API_KEY?'Scrapingdog configured':'not configured (public-web fallback active)'}`));
}
