# Delivery Loop — operational runbook

## Status vocabulary

- `intake` — founder brief recorded, no execution plan accepted.
- `active` — plan accepted; some activities pending/blocked/running/reviewed.
- `queued` — task may dispatch when dependencies, skill, permissions and policy are satisfied.
- `dispatching` — dispatch receipt durably written, external call underway.
- `uncertain` — invocation may have executed, must query same idempotency key through `reconcile`.
- `running` — worker job exists; poll for completion, never dispatch duplicate.
- `review_required` — output and evidence present; independent QA pending.
- `verified` — deterministic and human/independent checks accepted.
- `rejected` — retries exhausted or consequential work failed QA.
- `blocked` — missing skill/approval/policy/scheduler; no false completion.
- `ready_to_deliver` — every activity verified, delivery is allowed.
- `delivered` — objective result recorded with evidence and review records.

## Recovery rules

1. Reopen one single-host ledger and check the audit chain before processing.
2. A `dispatching`, `uncertain`, or `running` task must be reconciled against its *original* `dispatchId`; never invoke the same action with a fresh key until absence is established and a safe retry is explicitly authorized.
3. A `review_required` task can resume verification without rerunning execution.
4. Missing skills block work. Never silently install GitHub code or bypass digest verification; stage and sandbox a trusted skill with source proof first.
5. External/consequential tasks always require exact-scope owner approval, and have **no automatic retry** after a bad result.
6. A failed outcome is `rejected` or `blocked`; never relabel it as delivered because part of the work completed.
7. The JSON ledger is for **single dispatcher** use only, not multiple Mac and cloud workers. Promote to transactional storage and distributed leases before multi-host deployment.

### Unexpected `.lock` file

The current ledger refuses a second process rather than risking double dispatch. If a process crashes and leaves a lock, **first verify the previous process really stopped and that the ledger was not corrupted**. Only then remove the stale lock. This is a local development limitation; production requires a crash-cleaning OS lease or transactional store.

## QA evidence expected

For each acceptance criterion: test input, observed output, deterministic assertion result and separate reviewer evidence when semantic judgment matters. The builder's own claim of success is never sufficient. Reviewer identity is not independently authenticated by this module; the host must enforce that boundary.

## Privacy and external actions

No secrets in founder briefs, task events or worker output. Keep local data zones separated. Do not let retrieved instructions redefine tool permissions. Do not publish, pay, send, deploy or change production configuration merely because an LLM marked an activity complete.