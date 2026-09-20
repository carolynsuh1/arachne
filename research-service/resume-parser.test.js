import test from 'node:test';import assert from 'node:assert/strict';import {validateFields,norm} from './resume-parser.js';
const lines=[{id:'L1',page:1,text:'Acme Corp'},{id:'L2',page:1,text:'Aug 2026 - Present'},{id:'L3',page:1,text:'Built a $1M+ processor.'}];
test('accepts literal evidence and preserves currency',()=>{const r=validateFields({x:{value:'$1M+',lineIds:['L3']}},lines);assert.equal(r.supportedFields,1);});
test('rejects invented employer',()=>assert.throws(()=>validateFields({x:{value:'Google',lineIds:['L1']}},lines)));
test('rejects unknown citations',()=>assert.throws(()=>validateFields({x:{value:'Acme Corp',lineIds:['L99']}},lines)));
test('rejects unsupported date normalization',()=>assert.throws(()=>validateFields({x:{value:'2026-08',lineIds:['L2']}},lines)));
test('rejects nonconsecutive evidence',()=>assert.throws(()=>validateFields({x:{value:'Acme Corp',lineIds:['L1','L3']}},lines)));
test('allows missing fields without inventing values',()=>assert.equal(validateFields({x:{value:null,lineIds:[]}},lines).profile.x.value,null));
test('rejects null fields carrying citations',()=>assert.throws(()=>validateFields({x:{value:null,lineIds:['L1']}},lines)));
