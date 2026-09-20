import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearcher,generateQuestions,validateInput} from './pipeline.js';
import {mockProvider,demoInput,liveProvider} from './providers.js';

test('cached questions are separated by viewer details',async()=>{
 const provider=mockProvider();let calls=0;
 provider.questions=async input=>{calls++;return {questions:[{text:`How can I explore ${input.viewerProfile.interests}?`,factIds:['f1']}]}};
 const research=createResearcher(provider);
 const first=await research({...demoInput,viewerProfile:{interests:'robotics'}});
 const second=await research({...demoInput,viewerProfile:{interests:'education'}});
 assert.equal(calls,2);
 assert.notEqual(first.questions[0].text,second.questions[0].text);
 assert.equal(second.personalization.profile.interests,'education');
});

test('personal profile validation rejects oversized fields',()=>{
 assert.throws(()=>validateInput({...demoInput,viewerProfile:{background:'x'.repeat(1201)}}));
});

test('question model receives viewer context separately from researched facts',async()=>{
 let body;
 const provider=liveProvider({FIRECRAWL_API_KEY:'fake',OPENAI_API_KEY:'fake',OPENAI_MODEL:'test'},async(url,options)=>{
  body=JSON.parse(options.body);
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({questions:[{text:'As a design beginner, what should I try first?',factIds:['f1'],viewerEvidence:'Design beginner'}]})}]}]})};
 });
 const result=await generateQuestions(provider,{...demoInput,viewerProfile:{background:'Design beginner'}},[{id:'f1',claim:'Built a prototype'}]);
 const input=JSON.parse(body.input);
 assert.equal(body.model,'gpt-5.6-luna');
 assert.equal(body.reasoning.effort,'low');
 assert.equal(input.viewerProfile.background,'Design beginner');
 assert.equal(input.facts[0].claim,'Built a prototype');
 assert.equal(result.questions.length,1);

});


test('live personalized questions must cite real viewer context',async()=>{
 const provider={mode:'live',questions:async()=>({questions:[{text:'What do you do?',factIds:['f1'],viewerEvidence:'Invented consulting experience'}]})};
 await assert.rejects(generateQuestions(provider,{...demoInput,viewerProfile:{background:'Engineering student'}},[{id:'f1',claim:'Built a prototype'}]),/No supported questions/);
});


test('long interview-style questions are rejected',async()=>{
 const provider={mode:'live',questions:async()=>({questions:[{text:'word '.repeat(40)+'?',factIds:['f1'],viewerEvidence:'Engineering student'}]})};
 await assert.rejects(generateQuestions(provider,{...demoInput,viewerProfile:{background:'Engineering student'}},[{id:'f1',claim:'Built a prototype'}]),/No supported questions/);
});


test('personalized set selects an experience bridge, advice, and story',async()=>{
 const q=(kind,text)=>({kind,text,viewerEvidence:'Engineering student',factIds:['f1']});
 const provider={mode:'live',questions:async()=>({questions:[q('story','What surprised you?'),q('story','What did you enjoy?'),q('connection','I study engineering. How does that compare with your work?'),q('advice','What should I learn first?')]})};
 const result=await generateQuestions(provider,{...demoInput,viewerProfile:{background:'Engineering student'}},[{id:'f1',claim:'Built a prototype'}]);
 assert.deepEqual(result.questions.map(q=>q.kind),['connection','advice','story']);
});


test('both drafting and review receive work descriptions and review receives candidates',async()=>{
 const calls=[];
 const provider=liveProvider({FIRECRAWL_API_KEY:'fake',OPENAI_API_KEY:'fake',OPENAI_MODEL:'test'},async(url,options)=>{
  calls.push(JSON.parse(options.body));
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({questions:[{text:'I built reporting tools. What would make them useful for investment analysis?',factIds:['f1'],viewerEvidence:'Built reporting tools'}]})}]}]})};
 });
 const input={...demoInput,viewerProfile:{background:'Engineering student',professionalBackground:JSON.stringify({experience:[{company:'Example',summary:'Built reporting tools'}]})}};
 await provider.questions(input,[{id:'f1',claim:'Private equity internship'}],AbortSignal.timeout(1000));
 assert.equal(calls.length,2);
 for(const call of calls){
  assert.match(JSON.parse(call.input).viewerProfile.professionalBackground,/Built reporting tools/);
  assert.ok(call.text.format.schema.properties.questions.items.properties.viewerEvidence.enum.includes('Built reporting tools'));
 }
 assert.ok(JSON.parse(calls[1].input).draft.questions.length);
});
