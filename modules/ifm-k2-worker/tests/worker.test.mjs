import test from "node:test";
import assert from "node:assert/strict";
import { NeoK2WorkerAdapter, TestMemoryLedger, K2_CAPABILITIES } from "../src/index.mjs";
const VALID = { requestId: "ifm-k2-test-001", instruction: "Return the sum of 40 and 2 as JSON.", taskType: "reasoning", maxOutputTokens: 4096, dataZone: "general" };
const fixtures = (overrides={}) => {
  let submits = 0;
  const o = {
    submitBoundedTask: async ({ request_id, task_type, max_output_tokens, authorization_id }) => {
      assert.equal(request_id, VALID.requestId); assert.equal(task_type, "reasoning"); assert.equal(max_output_tokens, 4096);
      assert.equal(authorization_id, "auth-12345678"); submits++; return { task_id: "ifm_task_001", status: "queued" };
    },
    readBoundedTask: async () => ({ status: "complete", text: '{"answer":42}', usage: { prompt_tokens: 55, completion_tokens: 91, total_tokens: 146 }, finish_reason: "stop", partial_output: false }),
    authorize: async () => ({ authorized: true, authorizationId: "auth-12345678", expiresAt: "2099-01-01T00:00:00Z" }),
    requestLedger: new TestMemoryLedger(), now: () => Date.parse("2026-11-22T00:00:00Z"), ...overrides
  };
  return { worker: new NeoK2WorkerAdapter(o), get submits() { return submits; } };
};
test("records bounded hosted capability without claiming tools or multi-turn", ()=>{
  assert.equal(K2_CAPABILITIES.model,"IFM/K2-Horizon-375B-A23B");
  assert.equal(K2_CAPABILITIES.toolExecution,false);
  assert.equal(K2_CAPABILITIES.multiTurnVerified,false);
});
test("submits one authorized request through injected existing worker",async()=>{
  const h=fixtures(); const r=await h.worker.submit(VALID);assert.equal(r.task_id,"ifm_task_001");assert.equal(h.submits,1);
  const done=await h.worker.status({taskId:r.task_id,expectJson:true});assert.equal(done.status,"review_required");assert.deepEqual(done.parsed_json,{answer:42});assert.equal(done.usage.total_tokens,146);
});
test("duplicate same request is idempotent",async()=>{
  const h=fixtures(); const a=await h.worker.submit(VALID); const b=await h.worker.submit(VALID); assert.deepEqual(a,b);assert.equal(h.submits,1);
});
test("same ID changed payload blocks",async()=>{
  const h=fixtures();await h.worker.submit(VALID);
  await assert.rejects(()=>h.worker.submit({...VALID,instruction:"different"}),{code:"IDEMPOTENCY_CONFLICT"});
});
test("no trusted approval blocks all calls",async()=>{
  const h=fixtures({authorize:async()=>({authorized:false})});
  await assert.rejects(()=>h.worker.submit(VALID),{code:"APPROVAL_REQUIRED"});assert.equal(h.submits,0);
});
test("expired approval blocks calls",async()=>{
  const h=fixtures({authorize:async()=>({authorized:true,authorizationId:"auth-12345678",expiresAt:"2020-01-01T00:00:00Z"})});
  await assert.rejects(()=>h.worker.submit(VALID),{code:"APPROVAL_REQUIRED"});assert.equal(h.submits,0);
});
test("confidential data and tool payloads blocked",async()=>{
  const h=fixtures();
  await assert.rejects(()=>h.worker.submit({...VALID,dataZone:"private"}),{code:"DATA_ZONE_BLOCKED"});
  await assert.rejects(()=>h.worker.submit({...VALID,tools:[{type:"function"}]}),/Tools, files/);
  assert.equal(h.submits,0);
});
test("invalid request sizes and token caps rejected",async()=>{
  const h=fixtures();
  for (const bad of [{requestId:"x"},{instruction:"x".repeat(2401)},{maxOutputTokens:65537},{maxOutputTokens:1}]) {
    await assert.rejects(()=>h.worker.submit({...VALID,...bad}));
  }
  assert.equal(h.submits,0);
});
test("provider length stop rejects even if visible answer correct",async()=>{
  const h=fixtures({readBoundedTask:async()=>({status:"complete",text:'{"answer":42}',finish_reason:"length",partial_output:true,usage:{completion_tokens:2048}})});
  const r=await h.worker.status({taskId:"ifm_task_001",expectJson:true});assert.equal(r.status,"rejected");assert.equal(r.reason,"truncated_output");
});
test("invalid JSON cannot be accepted",async()=>{
  const h=fixtures({readBoundedTask:async()=>({status:"complete",text:'{"answer":42',finish_reason:"stop",partial_output:false})});
  const r=await h.worker.status({taskId:"ifm_task_001",expectJson:true});assert.equal(r.status,"rejected");assert.equal(r.reason,"invalid_json");
});
test("tool requests returned by bounded worker are rejected",async()=>{
  const h=fixtures({readBoundedTask:async()=>({status:"complete",text:"done",finish_reason:"stop",tool_calls:[{id:"x"}]})});
  await assert.rejects(()=>h.worker.status({taskId:"ifm_task_001"}),{code:"TOOL_EXECUTION_BLOCKED"});
});
test("uncertain remote submit fails closed and does not repeat",async()=>{
  const h=fixtures({submitBoundedTask:async()=>{throw Error("timeout")}});
  await assert.rejects(()=>h.worker.submit(VALID),{code:"UNCERTAIN_DISPATCH"});
  assert.deepEqual(await h.worker.submit(VALID),{status:"blocked",reason:"dispatch_outcome_unknown"});
});
test("task status and cancellation do not claim success before server confirms",async()=>{
  const h=fixtures({readBoundedTask:async()=>({status:"running"}),cancelBoundedTask:async()=>({cancel_requested:true})});
  assert.equal((await h.worker.status({taskId:"ifm_task_001"})).status,"running");
  assert.equal((await h.worker.cancel({taskId:"ifm_task_001"})).status,"cancelling");
});
test("no cancel callback refuses to fake cancellation",async()=>{
  const h=fixtures();await assert.rejects(()=>h.worker.cancel({taskId:"ifm_task_001"}),{code:"CANCEL_NOT_AVAILABLE"});
});
test("host without authenticated approval or real worker funcs refuses boot",()=>{
  assert.throws(()=>new NeoK2WorkerAdapter({}),{code:"HOST_NOT_READY"});
  assert.throws(()=>new NeoK2WorkerAdapter({submitBoundedTask:async()=>null,readBoundedTask:async()=>null,requestLedger:new TestMemoryLedger()}),{code:"APPROVAL_REQUIRED"});
});
test("concurrent duplicate requests cannot produce two K2 tasks",async()=>{
  const h=fixtures({submitBoundedTask:async()=>{await new Promise(resolve=>setTimeout(resolve,8)); return {task_id:"ifm_task_001",status:"queued"};}});
  const [first,second]=await Promise.all([h.worker.submit(VALID),h.worker.submit(VALID)]);
  assert(["submitted","blocked"].includes(first.status));
  assert(["submitted","blocked"].includes(second.status));
  assert([first,second].filter(x=>x.status==="submitted").length<=1);
});
test("downstream QA never treats JSON self-declared verified field as independent QA",async()=>{
  const h=fixtures({readBoundedTask:async()=>({status:"complete",text:'{"verified":true}',finish_reason:"stop",partial_output:false})});
  const r=await h.worker.status({taskId:"ifm_task_001",expectJson:true});
  assert.equal(r.status,"review_required");assert.equal(r.parsed_json.verified,true);
});