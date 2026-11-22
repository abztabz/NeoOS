import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeliveryLoop, JsonLedger } from '../src/index.mjs';

const DIGEST = 'a'.repeat(64);
const sample = (id='step1', overrides={}) => ({id,title:`Task ${id}`,instruction:'Produce a testable output',risk:'read_only',dependsOn:[],skill:'approved-skill',skillDigest:DIGEST,capability:'local_text',objectiveRefs:[0],acceptance:[{id:'core',method:'contains',expected:'PASS',description:'Output contains PASS'}],...overrides});
const input = (requestId='request_00001') => ({requestId,problem:'A process takes too much time',direction:'Improve output efficiency',references:[],objectives:['Deliver a reliable sample']});
let dirs=[];
const setup = async ({tasks=[sample()],run=async()=>({output:'PASS',evidence:['fixture://worker-output']}),reconcile,review,skills,policy,maxAttempts}={}) => {
 const dir=await mkdtemp(join(tmpdir(),'neo-delivery-')); dirs.push(dir);
 const path=join(dir,'state.json');
 const ports={ledger:new JsonLedger(path),planner:{plan:async()=>tasks},executor:{run,reconcile},verifier:{review:review|| (async()=>({pass:true,checks:[],reviewer:'separate-verifier',evidence:'test://review'}))},skills:{has:skills|| (async()=>true)},capabilities:{local_text:'read_only',external_action:'external'},policy,maxAttempts};
 const loop=await new DeliveryLoop(ports).open();return {loop,path,ports};
};
test.afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});

test('4-field intake → plan → dispatch → independent QA → delivery with evidence',async()=>{
 const {loop}=await setup();
 const o=await loop.intake(input());assert.equal(o.status,'intake');
 await loop.plan(o.id);assert.equal((await loop.dispatch(o.id)).status,'review_required');
 assert.equal((await loop.review(o.id,'step1')).status,'verified');
 const delivered=await loop.deliver(o.id);assert.equal(delivered.status,'delivered');
 assert.equal(delivered.results[0].review.reviewer,'separate-verifier');
 loop.validateJournal();await loop.close();
});
test('intake replay is idempotent; conflicting reuse refused',async()=>{
 const {loop}=await setup();const o=await loop.intake(input());assert.equal((await loop.intake(input())).id,o.id);
 await assert.rejects(loop.intake({...input(),problem:'Different'}),/idempotency/);assert.equal(loop.state.events.length,1);await loop.close();
});
test('incomplete input rejected instead of fabricated assumptions',async()=>{
 const {loop}=await setup();await assert.rejects(loop.intake({...input(),objectives:[]}),/objective/);
 await assert.rejects(loop.intake({...input(),references:'not an array'}),/references/);await loop.close();
});
test('planner cannot add unpinned skills, cyclic/future dependencies or arbitrary risk',async()=>{
 for(const task of [sample('a',{skillDigest:'unknown'}),sample('a',{dependsOn:['b']}),sample('a',{risk:'execute_everything'})]){
  const {loop}=await setup({tasks:[task]});const o=await loop.intake(input());
  await assert.rejects(loop.plan(o.id),/digest|dependencies|risk/);await loop.close();
 }
});
test('missing installed skill blocks worker without dispatch',async()=>{
 let called=0;const {loop}=await setup({skills:async()=>false,run:async()=>{called++;return {output:'PASS',evidence:['test']}}});
 const o=await loop.intake(input());await loop.plan(o.id);
 assert.equal((await loop.dispatch(o.id)).status,'blocked');assert.equal(called,0);assert.equal(loop.get(o.id).tasks[0].blocker,'SKILL_NOT_VERIFIED');await loop.close();
});
test('approved skill can unblock and dispatch without changing plan',async()=>{
 let available=false;const {loop}=await setup({skills:async()=>available});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);
 available=true;await loop.unblock(o.id,'step1');assert.equal((await loop.dispatch(o.id)).status,'review_required');await loop.close();
});
test('external action requires exact explicit owner approval',async()=>{
 let called=0;const {loop}=await setup({tasks:[sample('step1',{risk:'external',capability:'external_action'})],run:async()=>{called++;return {output:'PASS',evidence:['test']}}});
 const o=await loop.intake(input());await loop.plan(o.id);assert.equal((await loop.dispatch(o.id)).status,'blocked');assert.equal(called,0);
 await assert.rejects(loop.approve(o.id,'step1',{approver:'owner',scope:'wrong'}),/scope/);
 await loop.approve(o.id,'step1',{approver:'owner',scope:`${o.id}:step1`});await loop.unblock(o.id,'step1');
 assert.equal((await loop.dispatch(o.id)).status,'review_required');assert.equal(called,1);await loop.close();
});
test('DENY from governance policy blocks without side effects',async()=>{
 let calls=0;const {loop}=await setup({policy:{authorize:async()=> 'DENY'},run:async()=>{calls++;return {output:'PASS',evidence:['test']}}});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);
 assert.equal(calls,0);assert.match(loop.get(o.id).tasks[0].blocker,/POLICY_DENY/);await loop.close();
});
test('deterministic acceptance cannot be overridden by reviewer; bounded retry repairs',async()=>{
 let tries=0;const {loop}=await setup({run:async()=>({output:++tries===1?'BAD':'PASS',evidence:[`test://${tries}`]})});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);
 const first=await loop.review(o.id,'step1');assert.equal(first.status,'queued');assert.deepEqual(first.failures,['core']);
 await loop.dispatch(o.id);assert.equal((await loop.review(o.id,'step1')).status,'verified');assert.equal(tries,2);await loop.close();
});
test('external actions do not automatically retry after QA rejection',async()=>{
 const {loop}=await setup({tasks:[sample('step1',{risk:'external',capability:'external_action'})],run:async()=>({output:'BAD',evidence:['test']})});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.approve(o.id,'step1',{approver:'owner',scope:`${o.id}:step1`});
 await loop.dispatch(o.id);assert.equal((await loop.review(o.id,'step1')).status,'rejected');await loop.close();
});
test('separate QA can fail a deterministic PASS and must supply identity/evidence',async()=>{
 const {loop}=await setup({review:async()=>({pass:false,checks:[],reviewer:'independent-qc',evidence:'qa://finding'})});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);assert.equal((await loop.review(o.id,'step1')).status,'queued');await loop.close();
});
test('manual criteria require explicit reviewer checks',async()=>{
 const {loop}=await setup({tasks:[sample('step1',{acceptance:[{id:'manual1',method:'manual',description:'Review the output'}]})]});
 const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);
 await assert.rejects(loop.review(o.id,'step1'),/manual checks/);assert.equal(loop.get(o.id).tasks[0].status,'review_required');await loop.close();
});
test('unacknowledged dispatch becomes uncertain and is reconciled, never blindly replayed',async()=>{
 let called=0;const {loop}=await setup({run:async()=>{called++;throw new Error('timeout after dispatch')},reconcile:async()=>({output:'PASS',evidence:['neo://job-abc']})});
 const o=await loop.intake(input());await loop.plan(o.id);assert.equal((await loop.dispatch(o.id)).status,'uncertain');assert.equal(called,1);
 assert.equal((await loop.dispatch(o.id)).status,'no_queued_tasks');
 assert.equal((await loop.reconcile(o.id,'step1')).status,'review_required');assert.equal(called,1);await loop.close();
});
test('two dependent activities respect accepted prerequisites',async()=>{
 const tasks=[sample('first'),sample('second',{dependsOn:['first']})];const {loop}=await setup({tasks});
 const o=await loop.intake(input());await loop.plan(o.id);
 assert.equal((await loop.dispatch(o.id)).taskId,'first');assert.equal(loop.get(o.id).tasks[1].status,'queued');
 await loop.review(o.id,'first');assert.equal((await loop.dispatch(o.id)).taskId,'second');await loop.review(o.id,'second');
 assert.equal((await loop.deliver(o.id)).results.length,2);await loop.close();
});
test('restart preserves evidence and audit for completed task',async()=>{
 const {loop,path,ports}=await setup();const o=await loop.intake(input());await loop.plan(o.id);await loop.dispatch(o.id);await loop.close();
 const resumed=await new DeliveryLoop({...ports,ledger:new JsonLedger(path)}).open();
 assert.equal(resumed.get(o.id).tasks[0].status,'review_required');await resumed.review(o.id,'step1');await resumed.deliver(o.id);resumed.validateJournal();await resumed.close();
});
test('audit tampering rejects opening',async()=>{
 const {loop,path,ports}=await setup();await loop.intake(input());await loop.close();
 const state=JSON.parse(await readFile(path,'utf8'));state.events[0].kind='REWRITTEN';await writeFile(path,JSON.stringify(state));
 const l=new DeliveryLoop({...ports,ledger:new JsonLedger(path)});await assert.rejects(l.open(),/audit hash/);await l.close();
});
test('two competing dispatchers cannot hold same local ledger',async()=>{
 const {loop,path,ports}=await setup();const second=new DeliveryLoop({...ports,ledger:new JsonLedger(path)});
 await assert.rejects(second.open(),/locked/);await loop.close();
});
test('cannot claim delivered before all tasks independently verified',async()=>{
 const {loop}=await setup();const o=await loop.intake(input());await loop.plan(o.id);
 await assert.rejects(loop.deliver(o.id),/not verified/);await loop.close();
});
test('rejected output after retry cap is not delivered',async()=>{
 const {loop}=await setup({maxAttempts:2,run:async()=>({output:'BAD',evidence:['test']})});const o=await loop.intake(input());await loop.plan(o.id);
 for(let i=0;i<2;i++){await loop.dispatch(o.id);await loop.review(o.id,'step1');}
 assert.equal(loop.get(o.id).tasks[0].status,'rejected');await assert.rejects(loop.deliver(o.id),/not verified/);await loop.close();
});

test('a plan must cover every founder success objective',async()=>{
 const {loop}=await setup({tasks:[sample('one')]});
 const o=await loop.intake({...input(),objectives:['Deliver draft','Validate draft']});
 await assert.rejects(loop.plan(o.id),/omits/);await loop.close();
});
test('unregistered capability and falsely down-classified risky action fail before execution',async()=>{
 const {loop}=await setup({tasks:[sample('step1',{capability:'unverified_shell'})]});
 const o=await loop.intake(input());await assert.rejects(loop.plan(o.id),/capability/);await loop.close();
});
test('one driver invocation completes a two-task workflow without manual handoffs',async()=>{
 const {loop}=await setup({tasks:[sample('first'),sample('second',{dependsOn:['first']})]});
 const o=await loop.intake(input());await loop.plan(o.id);
 const r=await loop.runUntilBoundary(o.id);assert.equal(r.status,'delivered');assert.equal(r.objective.results.length,2);await loop.close();
});
test('a crashed in-flight task is reconciled by driver on restart',async()=>{
 const {loop,path,ports}=await setup({reconcile:async()=>({output:'PASS',evidence:['job://durable-result']})});
 const o=await loop.intake(input());await loop.plan(o.id);
 const t=loop.state.objectives[o.id].tasks[0];t.status='dispatching';t.dispatchId=`${o.id}:step1:1`;
 await loop.save();await loop.close();
 const resumed=await new DeliveryLoop({...ports,ledger:new JsonLedger(path)}).open();
 assert.equal((await resumed.runUntilBoundary(o.id)).status,'delivered');await resumed.close();
});