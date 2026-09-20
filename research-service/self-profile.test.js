import test from 'node:test';
import assert from 'node:assert/strict';
import {importSelfProfile} from './research-app.mjs';

test('self import rejects non-LinkedIn and non-profile URLs before retrieval',async()=>{
 const provider={scrape:()=>{throw Error('Must not retrieve')}};
 await assert.rejects(importSelfProfile({profileUrl:'https://example.com/person'},provider),/LinkedIn/);
 await assert.rejects(importSelfProfile({profileUrl:'https://www.linkedin.com/company/acme/'},provider),/profile sources/);
});

test('self import preserves structured experience without inventing goals',async()=>{
 const profile={name:'Maya Patel',experience:[{company:'Acme',position:'Engineer'}],education:[]};
 const result=await importSelfProfile({profileUrl:'https://www.linkedin.com/in/maya/'},{scrape:async url=>({profile,url,retrievedAt:'2026-09-19',cached:true})});
 assert.deepEqual(result.profile,profile);
 assert.equal(result.profile.goals,undefined);
 assert.equal(result.cached,true);
});
