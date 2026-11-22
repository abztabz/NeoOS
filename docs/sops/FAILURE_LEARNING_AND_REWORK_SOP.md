# Failure Evaluation → Organizational Learning + Chief of Staff → Rework SOP

**ID:** SOP-WORKFORCE-FAILURE-001  
**Version:** 0.1.0  
**Authority:** Operating procedure under the existing Founder Charter, Constitution, charters, and Delegation Charter.  
**Status:** Adopted as founder-requested workflow design; runtime enforcement is **not verified**.  
**Scope:** Every failed, rejected, timed-out, blocked, or policy-denied **attempt** in the NeoOS task lifecycle. Preserve the existing separation: Chief of Staff coordinates; the operational lead owns activity assignment; workers execute; independent QA verifies; Organizational Learning owns institutional learning.

## Required end-to-end cycle

1. A task uses an immutable objective ID, activity ID, approved contract/playbook version, and one unique attempt ID per execution attempt.
2. Any execution error, failed QA verdict, missing acceptance evidence, timeout, denial or blocked dependency generates an `AttemptFailure` event and linked `EvaluationReport`. *A failed attempt remains recorded even if a later attempt succeeds.*
3. Commit the attempt outcome, evidence references, evaluation report, and **two delivery obligations** in the same durable transaction: `learning.ingest` and `cos.review`. Do not report failure as successfully recorded if this transaction fails.
4. Deliver both obligations at least once using an outbox, stable event/report IDs, per-destination acknowledgements and deduplication. Retain failed attempts in the queue during outages. Learning may analyze asynchronously; successful delivery/acknowledgment, not completed analysis, is the prerequisite to automatic re-dispatch.
5. Organizational Learning registers the failure immediately as provisional evidence, classifies causes and recurrence, and records proposed improvements. It must never silently change active playbooks, policies or permissions.
6. The Chief of Staff reviews the **same report**, checks owner, policies, dependencies and retry history, and coordinates a corrective work order with the accountable operational lead. The lead—not CoS—assigns an executor. A changed prompt alone is not automatically adequate remediation.
7. If within permissions and retry budget, re-dispatch **the same activity ID** with a **new attempt ID**, linked evaluation report, explicit smallest viable remedy, and unchanged acceptance criteria unless the authorized owner approves a contract change.
8. An independent verifier performs QA on every completed candidate. On failure repeat steps 2–7; on pass retain all failed attempts, preserve proof, and send the success outcome to Learning for effectiveness analysis.
9. If unsafe, non-recoverable, missing required authority, or beyond retry budget, mark `BLOCKED_ESCALATED`, preserve the evaluation record, notify Learning and the accountable decision authority, and do not spin.

## States and events

`PLANNED → ASSIGNED → RUNNING → AWAITING_QA → VERIFIED`

From RUNNING or AWAITING_QA: `ATTEMPT_FAILED → FAILURE_RECORDED → REPORT_QUEUED → COS_REVIEW → REWORK_APPROVED → ASSIGNED` (with a new attempt) or `BLOCKED_ESCALATED`. Do not erase prior attempt history or allow a blocked candidate to unblock dependents.

The durable event stream distinguishes `ATTEMPT_FAILED`, `EVALUATION_RECORDED`, `LEARNING_DELIVERY_ACKED`, `COS_DELIVERY_ACKED`, `REWORK_DISPATCHED`, `ATTEMPT_VERIFIED`, and `BLOCKED_ESCALATED`. Both recipients may receive a report in parallel; only after **both** acknowledgements may automatic rework proceed. This does **not** authorize CoS to perform execution.

## Minimum EvaluationReport

```yaml
report_id: eval-unique
objective_id: obj-unique
activity_id: act-unique
attempt_id: att-unique
executor_id: executor-or-adapter
playbook_id: department/activity
playbook_version: "pinned"
contract_version: "pinned"
failure_stage: execution|qa|policy|dependency|timeout
verdict: fail|blocked
evaluator_type: independent_qa|deterministic_diagnostic
expected_result: explicit-criterion-reference
observed_result: observed-facts-or-null
failed_checks: []
evidence_refs: []
root_cause_hypothesis: unknown-or-explained
root_cause_confirmed: false
severity: low|medium|high|critical
recoverability: yes|no|uncertain
remediation_proposal: bounded-next-step
permissions_needed: []
retry_number: 0
recorded_at: iso8601
```

An execution exception can be evaluated by deterministic diagnostics; **never** describe that report as an independent QA verdict unless a genuinely separate verifier reviewed the candidate. Protect secrets/private inputs: store authorized references and redacted extracts; enforce retention and per-tenant access.

## Recovery and authorization

- Automatic rework budget: proposed default **two corrective attempts** after the original attempt; a stricter approved playbook/policy takes precedence. The budget is not a constitutional constant. Do not silently increase it.
- Before retrying actions with external effects, reconcile whether the prior attempt already caused a side effect. Reuse idempotency keys and checkpoints; unknown side effects are a blocker, not permission to repeat.
- No rework may enlarge scope, override approval gates, spend funds, publish, alter production, export restricted information, change credentials, or increase permissions without existing delegated authority.
- Corrective changes to a playbook, skill, model policy, or operating procedure require their authorized versioning and verification process. Learning makes a proposal; it does not auto-install the fix.
- A QA `Conditional Pass` is not a full verified acceptance unless the applicable contract expressly allows it and records each exception.

## Evidence and release tests

A conforming implementation must prove, with automated tests and durable event/audit inspection:

1. Runtime failure → immutable report and both outbox destinations; failure delivered to Learning even if recovered.
2. QA failure → same report to both recipients; blocked dependent remains blocked.
3. Duplicate delivery → exactly one logical entry for each recipient keyed by `report_id`; no duplicate corrective dispatch.
4. Temporary outage of either recipient → records survive process restart and are retried; no false-acknowledged handoff.
5. Safe repair → same activity, distinct attempt IDs, linked report; new independent QA run.
6. Failure again → a second independent report and two notifications.
7. Exhausted retry budget or unauthorized change → `BLOCKED_ESCALATED`, evidence retained, no additional automatic attempt.
8. Success after failure → final result plus the complete immutable failure history and learning outcome.
9. A verifier cannot approve work it executed; tests reject self-certification.
10. Crash between attempt failure and publication → transactional outbox maintains recoverability without lost or duplicated effects.

## Implementation ownership and reporting

**Atlas/engineering:** runtime adapter, durable event/outbox, policy enforcement, test suite and rollback plan. **QA Council:** independent QA and regression acceptance. **Chief of Staff:** workforce coordination and remediation tracking, not department execution. **Operational lead:** own activity and corrective assignment. **Organizational Learning:** attempt/incident ingestion, pattern review and governed lesson proposal. **CEO:** exception synthesis when delegated authority is exceeded. **Human Authority:** reserved approvals.

**Current limitation:** This SOP is a binding workflow specification in a development branch; it does not establish that the authenticated NeoStudio executive runtime 0.3.1 has a working dual-recipient event bus, independent QA service, or automatic recovery. Those remain to be implemented and verified against the running Mac.
