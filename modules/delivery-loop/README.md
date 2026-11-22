# NeoOS Delivery Loop v0.1 — first bounded execution slice

**Evidence state (23 Nov 2026):** Runnable module and offline tests; **NOT installed into NeoStudio/Mac runtime**. It is not yet an unattended CEO. The connected NeoStudio 2.18.71 status explicitly reports `background_ceo: false` and `local_dashboard_sync: false`.

This module exists to solve a specific failure mode: founder supplies **Problem + Direction + References + Objectives**, but is then asked to plan activities, manage tools, debug patches, review QA and deliver the output. The engine owns ordinary work transitions while escalating only genuine scope/permission blockers. It is intentionally a small module in the NeoOS modular monolith, not another control dashboard or AI-agent platform.

## What works today

- A four-field, strictly validated founder intake with immutable request-id semantics.
- Planner port for activity decomposition. Every task has a named capability with an exact risk class, approved skill/digest, explicit objectives coverage, upstream dependencies and checkable acceptance criteria.
- Deterministic plan validation and trusted **capability allowlist**: a model cannot grant itself a shell, network or paid tool by writing its name in a plan.
- Skill gate, owner permission gate and pluggable governance policy gate before worker dispatch.
- Persist-before-dispatch idempotency; any ambiguous dispatch is **reconciled**, not silently repeated.
- Execution port, evidence requirements, verifier port, deterministic non-overridable checks, bounded safe retries, dispatch timeout with reconciliation, and no automatic repeat of external actions.
- Whole-workflow driver that executes ready work, verifies each result and produces a delivered artifact only when every task passes.
- Atomic JSON ledger, chained SHA-256 audit, and single-process runtime lock.
- Working terminal demo and reproducible Node tests with a simulated worker.

## NOT established

- Native installation/wiring inside the running NeoStudio app or its private scheduler.
- Supported authenticated API from the connected ChatGPT NeoStudio bridge into a custom on-Mac module.
- Unattended background CEO; long-running durable daemon/service or automatic startup on the owner's Mac.
- Independent *authenticated* reviewer identity: the `verifier` port must be backed by an independently controlled service/process and credible evidence. A self-reported reviewer string alone is not a trust boundary.
- Arbitrary real-world task execution. This core does **not** browse, write arbitrary files, send emails, render video, execute code, purchase products, or call a model on its own. Real capabilities must be individually integrated, authorized and tested.
- Crash-safe multi-host transactions or tamper-proof audit (the hash chain detects accidental edits but anyone able to rewrite the ledger can recompute it).

## Install/test offline (zero paid dependencies)

Requires Node.js 20+.

```sh
cd modules/delivery-loop
npm test
npm run demo
```

`npm run demo` uses a deliberately labelled fixture worker: it proves the state engine, **not** a live Qwen or other tool integration. The demo stores its ledger under a randomly chosen local temporary directory and does not touch accounts or production systems.

## Integration contract

Create a host-side `DeliveryLoop` with ports, *not arbitrary tool functions supplied by the LLM*:

```js
import { JsonLedger, DeliveryLoop } from './src/index.mjs';
const loop = await new DeliveryLoop({
  ledger: new JsonLedger('/private/neoos/delivery-ledger.json'),
  planner: { plan: async intake => /* return validated task array from ChatGPT */ [] },
  executor: {
    run: async ({objective, task, idempotencyKey}) => /* scoped NeoStudio tool call */ {},
    reconcile: async ({objective, task, idempotencyKey}) => /* poll existing task */ {},
  },
  verifier: { review: async ({objective, task, output, evidence}) => /* independent QA */ {} },
  skills: { has: async ({skillId, digest}) => /* pinned, installed registry check */ false },
  capabilities: { local_text:'read_only' },
  policy: { authorize: async ({objective, task}) => /* trusted policy decision */ 'DENY' }
}).open();
```

The planner must return tasks in dependency order. A valid task:

```json
{
  "id": "draft",
  "title": "Compose a source-grounded brief",
  "instruction": "Use supplied references, mark unknowns",
  "risk": "read_only",
  "dependsOn": [],
  "skill": "verified_source_review",
  "skillDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "capability": "local_text",
  "objectiveRefs": [0],
  "acceptance": [{"id":"source","method":"manual","description":"Source assertions independently checked"}]
}
```

The 64-character digest above is **illustrative only**, not an installed skill proof. In production, bind the exact digest from the installed, source-pinned skill registry. For manual criteria the verifier must return `checks: [{id:'source',passed:true}]` with review evidence. Deterministic `contains` and `equals` checks cannot be overridden by reviewer opinion.

The intake call:

```js
const o = await loop.intake({
  requestId:'unique-task-001',
  problem:'What needs solving?', direction:'What approach should guide the work?',
  references:['Approved source path or URL'], objectives:['Observable success criterion'],
  constraints:['No external publication without owner approval']
});
await loop.plan(o.id);
const outcome = await loop.runUntilBoundary(o.id);
```

`runUntilBoundary` returns `delivered` only after **all** tasks are independently reviewed, and otherwise stops at a blocker, pending job, retry budget or step budget. An external scheduler should call it again after an event, rather than continuously burning model calls.

## Existing NeoOS responsibilities (do not redefine)

- ChatGPT CEO/operational leads own goal interpretation, plan, assignment and executive synthesis.
- Chief of Staff owns **workforce provisioning and availability**, not delivery execution or policy changes.
- Workers execute scoped capabilities; they cannot certify their own compliance.
- Verifiers evaluate output separately; deterministic policy/QA gates remain authoritative.
- Owner retains reserved powers and consequential external-commitment approvals.

This module is deliberately compatible with the existing NeoOS `modules/agent-lifecycle` concepts; do not duplicate runtime workers, memory managers, model-downloaders or CEO dashboards.

## Release gates before claiming the founder experience works

1. Locate actual installed NeoStudio source and authenticated deployment interface (GitHub `NeoOS` is **not** the Mac app runtime).
2. Implement and validate a scoped Mac host adapter for existing CEO/CoS/NeoStudio endpoints and real worker result reconciliation.
3. Run a **real** harmless job from four-field intake through local Qwen/tool execution to independent QA, with worker/job IDs and hashes.
4. Wire a persistent scheduler/daemon and prove restart/recovery, Mac-online/offline behavior, and iPhone visibility.
5. Run privacy, security, concurrency, resource and regression tests; gate all consequential release actions.
6. Owner approval before production activation; preserve current NeoStudio/ChatGPT behavior until then.

The project is not complete just because unit tests pass. See `RUNBOOK.md` for incident handling and truthfully scoped release criteria.