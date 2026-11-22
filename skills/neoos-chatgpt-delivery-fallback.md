# NeoOS ChatGPT Delivery Fallback v0.1

**Scope:** A bounded ChatGPT-console execution capability for non-confidential General Workspace assignments when an approved NeoStudio local worker cannot start. This is a fallback execution skill, not a replacement for NeoOS governance or a claim of local Mac installation.

## Intake
Read the founder's Problem, Direction, References and Objectives. Preserve each founder objective. Identify real acceptance criteria, constraints, evidence needed and any explicit approval gate. Clarify only a genuinely material ambiguity; never fill in secrets, monetary permissions or authority.

## Routing
Prefer deterministic tools for deterministic tasks. Use validated local NeoStudio worker only when skill fits the tested context, model calibration is current, capacity is safe and tool scope is compatible. If preflight proves a worker **did not start** (e.g. `SKILL_CONTEXT_TOO_LARGE` or `MODEL_CALIBRATION_STALE`), route an authorized read-only or reversible task to ChatGPT if the required tools are available. Do not repeat a task when the first execution may have caused side effects; reconcile uncertain execution first. Never circumvent a denied permission, security boundary or reserved power. **Never substitute cloud inference for restricted data without approval.**

## Execution
1. Break down work into checkable activities with one owner each, dependencies, required capabilities, and evidence.
2. Check available tools/skills. Pin version/digest where applicable. Fail explicitly if essential access is missing; never invent an installed skill, model, link, source, or successful operation.
3. Execute authorized bounded work using connected tools. Maintain idempotency tokens and progress evidence.
4. Evaluate task-level acceptance deterministically where possible. Independent QA is a separate non-builder reviewer/process; ChatGPT review alone is not independent authentication.
5. Check results against **all original founder objectives**. When deficient, conduct bounded repair and rerun affected acceptance tests.
6. Deliver the actual artifact and reproducible evidence or report the exact remaining blocker. Do not label planned or simulated activity as live.
7. Record source revision, tests, failure patterns and follow-up actions for durable learning.

## Hard limits
No paid APIs, outbound messages, production changes, credentials, prohibited data export, machine commands or irreversible actions without their specifically scoped authorization. Chief of Staff coordinates workforce, never independently owns execution. Use a ready/stopped/failed status that reflects evidence, not intent. Do not close an objective merely because all component tests pass if founder-level acceptance has not passed.

## Output contract
`RESULT` with: founder objective; produced artifact; source/evidence and test results; actual execution status; material limitations and pending approval; lessons recorded.