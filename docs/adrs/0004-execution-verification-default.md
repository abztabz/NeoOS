# ADR-0004 — Evidence-Gated Execution Is the Default NeoOS Workflow

**Status:** Founder-approved direction; pilot source implementation pending runtime integration
**Decision:** D-022 (2026-11-03)

## Problem

Conversation-driven task execution has produced repeated correction, weak completion
evidence, missing durable learning and unnecessary dependence on the founder's supervision.

## Decision

Every implementation instruction shall be turned into a persistent task contract,
with project context, approved boundary, explicit acceptance tests, cost/risk limits
and a named independent verifier. Routine bounded work proceeds without repeated
founder approval. A task cannot be described as independently verified, released
or complete merely because a builder claims success.

The standard operational loop is:

1. Persist and deduplicate the task contract.
2. Dispatch to a permitted worker with a recoverable lease.
3. Capture an exact candidate revision and implementation evidence.
4. Execute objective acceptance and regression tests.
5. Attempt bounded repairs on failure; block and escalate when exhausted.
6. Obtain independent review (and explicit human approval when required).
7. Record the verified result and promote confirmed failures into regression tests.
8. Report completion, failures, costs and exceptions; do not require continuous chat supervision.

## Priority and routing

Use existing, verified local NeoOS/Ollama/Qwen capacity for eligible tasks;
use deterministic tools before model inference. Paid services, privileged commands,
unapproved production changes and consequential external actions require explicit
scoped authority. A local resource preflight takes priority over task throughput.

## Authority

This ADR does not grant new credentials, arbitrary shell access, live deployment
rights, or permission for destructive changes. Runtime task identities and actor
permissions must be authenticated. External information and model outputs remain
untrusted until tested and reviewed.

## Evidence states

- Policy approved: yes (founder instruction).
- Source persisted: only when this PR is merged.
- Isolated ledger and CI: draft implementation with unit tests.
- Live Neo Studio integration: not established.
- Real Kanjoos pilot, production release and independent runtime review: pending.

## Why this approach

The simplest viable standard-library SQLite kernel preserves local cost control
and allows an incremental modular-monolith integration. Expand toward a workflow
orchestration framework only when measured runtime requirements justify it.

## Acceptance for default-runtime adoption

- Real task submission through authenticated NeoOS bridge.
- Crash/restart recovery without repeated side effects.
- Real project regression suite and independent verifier evidence.
- Human approval gates verified against unauthorized actions.
- Live status retrieval, operational logs and rollback rehearsal.
- No paid inference without explicit approval.
