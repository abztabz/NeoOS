# Failure Feedback Workflow — Acceptance Test Matrix

**Applies to:** `docs/sops/FAILURE_LEARNING_AND_REWORK_SOP.md`  
**Evidence status:** tests specified, **not run against live NeoStudio**. The GitHub governance repository is documentation, not verified to contain NeoStudio's running executive service.

| ID | Injected scenario | Required observable state |
|---|---|---|
| F-001 | Worker produces invalid output | Immutable failed attempt, report ID and two destination outbox entries in one transaction |
| F-002 | Independent QA rejects output | QA verdict linked to report, Learning+CoS deliveries, dependent work remains blocked |
| F-003 | Duplicate webhook/retry | Stable event/report IDs deduplicated; a single logical CoS rework work order |
| F-004 | Learning endpoint unavailable | Failure retained durably; no automatic dispatch until Learning ack and CoS ack |
| F-005 | CoS endpoint unavailable | Failure retained durably; Learning receives report, CoS notification is retried |
| F-006 | Service restarts before dispatch | Attempt, report, outbox and acknowledgement states recover without loss |
| F-007 | Safe recovery | Same activity ID, distinct attempt ID, linked report; independent QA evaluates again |
| F-008 | Second attempt fails | Another report and learning/CoS fanout, first attempt retained |
| F-009 | Retry budget exhausted | Blocked escalation recorded, zero extra retries |
| F-010 | Correction requires new permissions/production change | No automatic retry; decision escalated to correct human/authorized owner |
| F-011 | Success after a failure | Verified result and ALL prior failed attempts retained, success outcome sent to Learning |
| F-012 | Builder attempts to sign its own QA | Verification rejected as non-independent |
| F-013 | Crash after external action, before ack | Reconcile side effects/idempotency key; do not replay blindly |
| F-014 | Attempt rejected by policy prior to execution | Machine-readable diagnostic evaluation, NOT invented independent QA verdict |
| F-015 | Learning recommends SOP improvement | Candidate proposal recorded; no activation without authorized review/versioning |

## QA release gate

A pass requires actual event/audit record IDs, persistent store snapshots or export, and logs for each test, with checks that outbox `learning.ingest` and `cos.review` are tied to the same `report_id`. Unit-only or self-reported success does not prove end-to-end NeoStudio operation.

**Current verdict:** SPECIFIED, NOT IMPLEMENTED OR VERIFIED IN LIVE RUNTIME.
