# NeoOS E2E Test 2 — real acceptance validation fix

**Date:** 2026-11-23 (Asia/Dubai)  
**Objective:** `obj_5935df9e09582c28b0cfb4df`  
**Scope:** Draft feature branch only; **NOT DEPLOYED** into NeoStudio/Mac.

## Actual defect

NeoOS DeliveryLoop `checkPlan()` accepted (1) `contains` acceptance criteria with an empty `expected` string, so any output matched, and (2) duplicate acceptance criterion IDs within one task, making reviewer evidence ambiguous. These are quality gate defects, not formatting preferences.

## Demonstrated RED

With two new security regression tests and the original unpatched module:

- `security regression: empty substring acceptance may never silently pass any output` — **failed**
- `security regression: duplicate criterion IDs are rejected at plan time` — **failed**
- Node suite output: `# tests 30`, `# pass 28`, `# fail 2`; exit status 1.

## Smallest code fix

After the pre-existing validation of each acceptance criterion, reject duplicate IDs using `Set` cardinality. Also require a nonempty, nonwhitespace `expected` string for every deterministic `contains` and `equals` criterion; manual criteria remain allowed without an expected string. No planner/executor/model permissions were expanded.

## Demonstrated GREEN

On the locally patched source (Node.js 22.16.0):

- `# tests 30`, `# pass 30`, `# fail 0`, exit status 0.
- `npm run demo` finished with `status: delivered`, explicitly using `deterministic-demo-worker`; this is a *fixture* proof, **not** a live Qwen inference run.

## Verification required on committed SHA

- GitHub Actions must run all 30 tests on the exact feature-branch commit, with zero failures.
- A second NeoStudio worker profile must reopen and inspect committed code/tests and verify CI logs.
- Do not merge or deploy: source-level regression testing is not proof of live unattended NeoOS or authenticated independent QA.