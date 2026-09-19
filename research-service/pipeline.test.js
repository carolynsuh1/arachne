import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearcher, acceptExtraction, acceptQuestions, publicUrl } from './pipeline.js';
import { mockProvider, liveProvider, demoInput } from './providers.js';
import { createServer } from './server.js';

test('mock produces sourced facts and grounded questions', async () => {
  const result = await createResearcher(mockProvider())(demoInput);
  assert.equal(result.status, 'ready');
  assert.match(result.mode, /fictional/);
  assert.equal(result.facts.length, 1);
  assert.equal(result.questions.length, 3);
  assert.equal(result.facts[0].sourceId, result.sources[0].id);
});
test('unconfirmed identity returns candidates without extraction', async () => {
  const provider = mockProvider();
  provider.extract = () => { throw new Error('Should not run'); };
  const result = await createResearcher(provider)({ ...demoInput, profileUrl: null });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.facts.length, 0);
  assert.equal(result.candidates.length, 1);
});
test('unknown person has no fabricated brief', async () => {
  const result = await createResearcher(mockProvider())({ ...demoInput, name: 'Unknown Person', profileUrl: null });
  assert.equal(result.status, 'insufficient_information');
});
test('wrong affiliation does not inherit fixture facts', async () => {
  const result = await createResearcher(mockProvider())({ ...demoInput, affiliation: 'Different University' });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.facts.length, 0);
});
test('rejects invented quotes and unknown citations', () => {
  const sources = [{ id: 's1', text: 'Maya Patel is a student at Example University. She studies navigation.' }];
  const raw = { identity: [{ sourceId: 's1', matches: true, evidence: sources[0].text }], facts: [
    { claim: 'Invented fact', sourceId: 's1', evidence: 'She is the university president.' },
    { claim: 'Missing source', sourceId: 's9', evidence: 'She studies navigation.' }
  ] };
  assert.equal(acceptExtraction(raw, sources, demoInput).facts.length, 0);
  assert.deepEqual(acceptQuestions({ questions: [{ text: 'Question?', factIds: ['f9'] }] }, [{ id: 'f1' }]), []);
});
test('failed secondary page returns partial brief', async () => {
  const provider = mockProvider();
  provider.search = async () => [{ url: 'https://example.org/missing', title: 'Missing page' }];
  const result = await createResearcher(provider)(demoInput);
  assert.equal(result.status, 'ready');
  assert.equal(result.sources.length, 1);
  assert.equal(result.warnings.length, 1);
});
test('failed anchor never generates a brief from other pages', async () => {
  const result = await createResearcher(mockProvider())({ ...demoInput, profileUrl: 'https://example.org/missing' });
  assert.equal(result.status, 'source_unavailable');
  assert.equal(result.facts.length, 0);
});
test('all pages failed is insufficient information', async () => {
  const provider = mockProvider();
  provider.scrape = async () => { throw new Error('Unavailable'); };
  const result = await createResearcher(provider)(demoInput);
  assert.equal(result.status, 'insufficient_information');
});
test('cache respects goal, refresh and expiry', async () => {
  let time = 0, count = 0;
  const provider = mockProvider(), extract = provider.extract;
  provider.extract = async (...args) => { count++; return extract(...args); };
  const research = createResearcher(provider, { ttlMs: 100, now: () => time });
  await research(demoInput);
  assert.equal((await research(demoInput)).cached, true);
  await research({ ...demoInput, goal: 'Discuss testing' });
  await research({ ...demoInput, refresh: true });
  time = 101;
  await research(demoInput);
  assert.equal(count, 4);
});
test('rejects local URLs, IPs, credentials and invalid inputs', async () => {
  for (const url of ['http://example.org', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://x.local', 'https://u:p@example.org']) {
    assert.throws(() => publicUrl(url));
  }
  await assert.rejects(createResearcher(mockProvider())({ name: 'Maya' }), /affiliation/);
});
test('live provider requires explicit configuration', () => {
  assert.throws(() => liveProvider({}), /FIRECRAWL_API_KEY/);
});
test('live adapters handle official response envelopes without real network calls', async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const payload = url.endsWith('/search') ? { success: true, data: { web: [{ url: demoInput.profileUrl }] } } :
      url.endsWith('/scrape') ? { success: true, data: { markdown: 'Profile content', metadata: { sourceURL: demoInput.profileUrl } } } :
      { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"questions":[]}' }] }] };
    return new Response(JSON.stringify(payload));
  };
  const provider = liveProvider({ FIRECRAWL_API_KEY: 'test', OPENAI_API_KEY: 'test', OPENAI_MODEL: 'configured-model' }, transport);
  const signal = new AbortController().signal;
  assert.equal((await provider.search(demoInput, signal)).length, 1);
  assert.equal((await provider.scrape(demoInput.profileUrl, signal)).text, 'Profile content');
  assert.deepEqual(await provider.questions(demoInput, [], signal), { questions: [] });
  assert.equal(calls[2].body.store, false);
  assert.equal(calls[2].body.text.format.type, 'json_schema');
});
test('HTTP endpoint validates input and rejects cross-origin requests', async () => {
  const server = createServer(createResearcher(mockProvider()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(root + '/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demoInput) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ready');
    const invalid = await fetch(root + '/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
    const blocked = await fetch(root + '/api/research', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(blocked.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('linked public profile can corroborate an inaccessible confirmed URL', async () => {
  const confirmed = 'https://www.linkedin.com/in/example-maya/';
  const provider = mockProvider();
  provider.search = async () => [{ url: demoInput.profileUrl, title: 'Maya portfolio' }];
  provider.scrape = async url => {
    if (url === confirmed) throw new Error('Unsupported source');
    return { url, text: 'Maya Patel is a student at Example University. In a 2025 course project, Maya tested robot navigation in crowded hallways. [LinkedIn](https://www.linkedin.com/in/example-maya/)' };
  };
  provider.extract = async () => ({ identity: [{ sourceId: 's2', matches: true, evidence: 'Maya Patel is a student at Example University.' }],
    facts: [{ sourceId: 's2', claim: 'Maya worked on robot navigation.', evidence: 'In a 2025 course project, Maya tested robot navigation in crowded hallways.', date: '2025' }], uncertainties: [] });
  const result = await createResearcher(provider)({ ...demoInput, profileUrl: confirmed });
  assert.equal(result.status, 'ready');
  assert.equal(result.identity.sourceId, 's2');
});
test('profile links cannot match a different handle or lookalike domain', async () => {
  const { linksToProfile } = await import('./pipeline.js');
  const target = 'https://www.linkedin.com/in/nishant-shah-340869306/';
  assert.equal(linksToProfile('[Profile](https://ca.linkedin.com/in/nishant-shah-340869306)', target), true);
  assert.equal(linksToProfile('[Profile](https://www.linkedin.com/in/nishant-shah-340869306-other/)', target), false);
  assert.equal(linksToProfile('[Profile](https://linkedin.com.evil.example/in/nishant-shah-340869306/)', target), false);
});

test('identity evidence may be in separate page sections but must both be verbatim', () => {
  const sources = [{id:'s1',text:'# Nishant Shah\nStudies: Western University'}];
  const person = {name:'Nishant Shah',affiliation:'Western University'};
  const valid = {identity:[{sourceId:'s1',matches:true,nameEvidence:'Nishant Shah',affiliationEvidence:'Western University'}],facts:[]};
  assert.equal(acceptExtraction(valid,sources,person).accepted.has('s1'),true);
  valid.identity[0].affiliationEvidence = 'Western University engineering professor';
  assert.equal(acceptExtraction(valid,sources,person).accepted.size,0);
});

test('live extraction attaches original passages and deterministic identity evidence', async () => {
  const source = {id:'s1',url:demoInput.profileUrl,text:'Maya Patel\n\nWestern University\n\nBuilt a navigation prototype.'};
  const person = {...demoInput,affiliation:'Western University'};
  const transport = async () => new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({identity:[{sourceId:'s1',matches:true}],facts:[{claim:'Built a navigation prototype.',excerptId:'s1p2',date:null}],uncertainties:[]})}]}]}));
  const provider=liveProvider({FIRECRAWL_API_KEY:'test',OPENAI_API_KEY:'test',OPENAI_MODEL:'test'},transport);
  const raw=await provider.extract(person,[source],new AbortController().signal);
  assert.equal(raw.identity[0].nameEvidence,'Maya Patel');
  assert.equal(raw.identity[0].affiliationEvidence,'Western University');
  assert.equal(raw.facts[0].evidence,'Built a navigation prototype.');
  assert.equal(acceptExtraction(raw,[source],person).facts.length,1);
});
