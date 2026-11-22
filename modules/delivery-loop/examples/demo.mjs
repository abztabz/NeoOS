import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DeliveryLoop, JsonLedger } from '../src/index.mjs';
const digest = createHash('sha256').update('example-skill:0.1').digest('hex');
const root = await mkdtemp(join(tmpdir(),'neoos-delivery-demo-'));
const loop = await new DeliveryLoop({
 ledger:new JsonLedger(join(root,'state.json')),
 planner:{plan:async()=>[{id:'write',title:'Draft useful output',instruction:'Provide an accurate, limited answer',risk:'read_only',dependsOn:[],skill:'example-skill',skillDigest:digest,capability:'example_composer',objectiveRefs:[0],acceptance:[{id:'objective',method:'contains',expected:'DELIVERY',description:'Expected output marker'}]}]},
 executor:{run:async({objective})=>({output:`DELIVERY: ${objective.intake.objectives[0]}. Produced by deterministic demonstration worker.`,evidence:['demo://fixture-not-a-real-qwen-run']})},
 verifier:{review:async()=>({pass:true,reviewer:'deterministic-demo-verifier',evidence:'demo://separate-check',checks:[]}),reviewObjective:async()=>({pass:true,reviewer:'objective-demo-verifier',evidence:'demo://objective-check',checks:[{index:0,passed:true,evidence:'demo://objective-check'}]})},
 skills:{has:async({skillId,digest:found})=>skillId==='example-skill'&&digest===digest},
 capabilities:{example_composer:'read_only'},
}).open();
try {
 const o=await loop.intake({requestId:'demo_request_20261123',problem:'Repeated manual handoffs',direction:'Make one bounded task flow from intake to completed evidence',references:[],objectives:['Prove the offline delivery-loop core works']});
 await loop.plan(o.id);const {objective:result}=await loop.runUntilBoundary(o.id);
 console.log(JSON.stringify({objectiveId:o.id,status:result.status,workers:['deterministic-demo-worker'],evidence:result.results[0].evidence,ledger:join(root,'state.json')},null,2));
} finally {await loop.close();}