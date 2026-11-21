# NeoOS — IFM K2 bounded worker adapter v0.2

**Status: source implemented and mocked, NOT wired into live NeoStudio/hosted connector; NO real K2 API call performed.**

This is an opt-in adapter to **the K2 Horizon 375B service already present in NeoStudio 2.18.70**, which keeps the IFM key in Mac Keychain and exposes a bounded manual text worker. It does **not** reimplement the IFM API client, install a model, read credentials, or bypass the authorization checkbox. It is not an App Updates ZIP.

## Verified baseline (22 November 2026)
- User's manual K2 reasoning request produced correct 9-minute schedule but terminated with `finish_reason:length`, 2,048 completion tokens, `partial_output:true`; cannot accept truncated JSON.
- User's JSON fixture returned `{"status":"success","answer":42,"verified":true}` with `finish_reason:stop`, `partial_output:false` and 146 total tokens. This proves a **single turn**, not full agent tooling.
- ChatGPT NeoStudio v2.18.70 bridge advertises Qwen but **no K2 submit/status/cancel tools**. Its CEO/CoS workforce supports `chatgpt_console`, `qwen_text`, `qwen_skill` but no K2 template. These limitations block live integration from this repository alone.
- The GitHub NeoOS repo is **not** the running Mac/hosted connector runtime. Source in this repository is **not deployed**.

## Interface boundary
Host implementation must inject existing authorized host hooks:

```js
import { NeoK2WorkerAdapter } from './src/index.mjs';
const k2 = new NeoK2WorkerAdapter({
  // These hooks must be exported by a future trusted NeoStudio/connector update:
  submitBoundedTask: neoStudio.k2SubmitExisting,
  readBoundedTask: neoStudio.k2GetExistingTask,
  cancelBoundedTask: neoStudio.k2CancelExistingTask, // OMIT if unavailable
  // IMPORTANT: server-authenticated owner approval per task, not client-supplied true:
  authorize: approvedIFMPolicyRecord,
  // Transactional durable ledger with atomic put-if-absent, not TestMemoryLedger:
  requestLedger: durableIdempotencyLedger
});
const submitted = await k2.submit({
  requestId: 'k2-task-20261122-0001',
  instruction: 'Return JSON with key answer equal to 42',
  taskType: 'reasoning', maxOutputTokens: 4096, dataZone: 'general'
});
// Once the backend reports finished:
const receipt = await k2.status({taskId:submitted.task_id,expectJson:true});
// review_required != independently verified; submit to NeoOS QA before acceptance.
```

**Never use `TestMemoryLedger` in production.** Atomic insertion is necessary to prevent double API submissions under concurrent callers. Unknown dispatch responses must be reconciled against backend task IDs, not retried blindly. No automatic IFM charges, fallback, file access, tools, agent skills or multi-turn claims.

## Host update contract
Recommended future authenticated connector methods (names proposed; none exist yet):

- `neo_k2_submit({device_id,request_id,text,task_type,max_output_tokens,authorization_id})`
- `neo_k2_status({task_id})` returning state and an immutable receipt with `text`, `finish_reason`, `partial_output`, `usage`
- `neo_k2_cancel({task_id})` **only if** the existing host actually supports cancelling an in-flight K2 request

Expose `ifm_k2_horizon_375b` to the Chief of Staff workforce **only when** those methods exist, the owner policy gates are enforced server-side, an actual K2 smoke test passes, and task-result QA can reject partial outputs. Dispatcher may run Qwen and K2 concurrently, but each activity must have exactly one owner. Existing Qwen routes must remain unchanged. Tool execution needs a separately approved extension and audited tool allowlist.

## Acceptance gates (not passed in live NeoOS)
1. Verify current NeoStudio/K2 worker implementation source and the hosted connector release channel.
2. Wire existing internal K2 functions; do NOT store key outside Keychain.
3. Add authenticated owner approval, bounded quota accounting and transaction-safe idempotency receipts.
4. Connector contract test: submit → status → result; length truncation -> rejected; unknown dispatch outcome -> blocked; cancellation only if supported.
5. Expose template through the existing CoS workforce, not a new agent hierarchy.
6. End-to-end authorized public fixture from ChatGPT iOS → NeoOS → IFM → QA, then a Qwen/K2 simultaneous test.
7. Verify reliability and latency over repeat runs; document observed metrics and owner-approved fallback policy.

Run offline tests: `cd modules/ifm-k2-worker && npm test`