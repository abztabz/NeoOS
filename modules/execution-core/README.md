# NeoOS Execution Core — V1 pilot

A minimal, standard-library-only SQLite execution ledger implementing NeoOS CP-001,
Morpheus's stage gates and the independent QA SOP. It is an **isolated pilot**, not
a running Neo Studio plugin or a production deployment.

## What is enforced

- Durable, idempotent task contracts (same ID and different contract is rejected).
- Required project, objective, separate builder/verifier and named acceptance tests.
- Default human approval requirement; zero paid spending; privileged actions denied.
- Exclusive expiring worker leases, stale-token rejection and bounded crash recovery.
- Named acceptance-test results with nonempty evidence linked to an exact candidate.
- Failed tests require a diagnosis and trigger at most the contract's bounded attempts.
- Independent verifier identity is distinct from the builder **at contract level**.
- Approval by a distinct authority before the verified state, when required.
- Immutable chronological event records and deduplicated, verified regression lessons.
- No task is called Released before independently verified status and live smoke evidence.

The Python library does **not** authenticate claimed identities. Identity, tool permissions,
spending, external side effects, approval provenance, backup/retention, real deployments
and live regression checking require integration at the authenticated NeoOS runtime
boundary. Passing unit tests is not proof of those controls in production.

## Test

From `modules/execution-core`:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Python 3.11 standard library only. The GitHub Actions workflow runs the same suite
on pull requests that touch this module.

## Authenticated in-process integration boundary

The pilot includes `bridge_adapter.py`, an explicit permission boundary in front
of `ExecutionLedger`. It has separate owner, dispatcher, builder, tester,
verifier, and releaser identities. Unknown credentials and cross-role calls
are rejected. Tests exercise this boundary, including unauthorized claims,
reviews, approvals and releases.

This is **not** a network endpoint, a deployed Neo Studio extension, or a
credential issuance mechanism. The trusted NeoOS runtime must provide strong
per-actor secrets (minimum 32 characters), secure storage, transport authentication,
project-level authorization and external action allowlists. Do not place secrets
in Git or grant arbitrary shell/production permissions to model outputs.

Even with authenticated callers, a `record_tests` evidence string can be fabricated
unless the host binds it to a trusted runner, exact revision, signed test artifact
and result hash. Similarly, a release event requires a genuinely verified live
smoke test and approved deployment mechanism. The source-level tests do not prove
these runtime properties.

A live connector needs narrowly scoped task submission/status APIs and separate
attestation actions bound to the local NeoOS scheduler. The currently paired Neo
bridge offers fixed QA/model/learner functions but **does not expose** arbitrary
code execution, authenticated execution-core installation or a general task
submission API. Until these capabilities are supplied by the Neo Studio runtime,
the integration must remain a draft and production must remain untouched.

## Proposed integration sequence

1. Mount a persistent, access-controlled SQLite path on the NeoOS host.
2. Authenticate the task submitter, worker, independent reviewer and human approver.
3. Register allowlisted local worker adapters (existing Neo/Ollama/Qwen), with no
   arbitrary shell, filesystem or internet action granted by model output.
4. Attach actual Kanjoos workspace revision hashes and deterministic Playwright /
   pytest results. A test suite **must not** substitute synthetic fixtures for live verification.
5. Bind the verified event record to GitHub and the human-facing Notion status.
6. Require a separate approved deployment action with real smoke tests and rollback.
7. Add telemetry for accepted deliverables, recovery attempts, model tokens and costs.

## Pilot scope

The suite exercises a Kanjoos-shaped task using **synthetic fixtures only**.
There are no Kanjoos production edits and no claims of live Kanjoos verification.

The repository branch/PR status represents source-code review only. A successful
deployment and independently verified integration require their own evidence.
