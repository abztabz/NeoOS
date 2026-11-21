/**
 * NeoOS IFM K2 bounded-worker adapter: host-owned runtime integration boundary.
 * Uses the *existing* Keychain-backed NeoStudio K2 task service, NEVER an API key.
 * No new API calls, tool execution, retries, browsing or hosted fallbacks.
 * Explicit one-task authorization is checked by an injected, trusted gate.
 */
import { createHash } from "node:crypto";

export const K2_WORKER_ID = "ifm_k2_horizon_375b";
export const K2_MODEL_ID = "IFM/K2-Horizon-375B-A23B";
export const K2_TASK_TYPE = "reasoning";
export const K2_CAPABILITIES = Object.freeze({
  provider: "ifm", model: K2_MODEL_ID, workerId: K2_WORKER_ID,
  taskTypes: [K2_TASK_TYPE],
  nonConfidentialOnly: true, toolExecution: false, fileAccess: false,
  multiTurnVerified: false, streamingVerified: false,
  automaticRetry: false, automaticFallback: false
});
const TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,89}$/;
const MAX_TASK_LENGTH = 2400;
const MAX_RESULT_LENGTH = 256000;
const allowedStates = new Set(["queued", "pending", "running", "processing", "complete", "completed", "failed", "error", "cancelled", "cancelling"]);

export class K2ContractError extends Error {
  constructor(message, code = "K2_CONTRACT_ERROR") { super(message); this.name = "K2ContractError"; this.code = code; }
}
const fail = (message, code) => { throw new K2ContractError(message, code); };
const copy = v => structuredClone(v);
const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function unpack(v) {
  if (obj(v?.structuredContent)) return v.structuredContent;
  if (obj(v) && (v.task_id || v.job_id || v.status || v.text !== undefined || v.cancel_requested || v.acknowledged)) return v;
  if (typeof v?.content === "string") {
    try { const parsed = JSON.parse(v.content); if (obj(parsed)) return parsed; } catch { /* invalid */ }
  }
  if (Array.isArray(v?.content)) {
    const t = v.content.find(x => x?.type === "text" && typeof x?.text === "string");
    if (t) { try { const parsed = JSON.parse(t.text); if (obj(parsed)) return parsed; } catch { /* invalid */ } }
  }
  return fail("Unsupported NeoStudio response shape", "UNSUPPORTED_RESPONSE");
}
function normalizeId(v) {
  const id = v?.task_id ?? v?.job_id ?? v?.id;
  if (typeof id !== "string" || id.length > 160 || id.length < 3 || /\s/.test(id)) return fail("Task ID missing from worker", "UNCERTAIN_DISPATCH");
  return id;
}
function validateInput(input) {
  if (!obj(input)) fail("Task must be an object");
  const { requestId, instruction, taskType = K2_TASK_TYPE, maxOutputTokens = 4096, dataZone = "general" } = input;
  if (typeof requestId !== "string" || !TASK_ID.test(requestId)) fail("Invalid idempotency request ID");
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > MAX_TASK_LENGTH) fail("Invalid task text");
  if (taskType !== K2_TASK_TYPE) fail("Unsupported K2 task type");
  if (dataZone !== "general") fail("Hosted K2 requires non-confidential General Workspace data", "DATA_ZONE_BLOCKED");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 65536) fail("Output token cap out of bounds");
  if (input.tools || input.sourceUrl || input.filePath || input.media || input.messages || input.history) fail("Tools, files, attachments and multi-turn context are not authorized through the bounded worker");
  return { requestId, instruction, taskType, maxOutputTokens, dataZone };
}
function normalizeCompletion(raw) {
  const r = unpack(raw);
  const finishReason = r.finish_reason ?? r.result?.finish_reason ?? null;
  const partial = r.partial_output === true || r.result?.partial_output === true || finishReason === "length";
  const text = r.text ?? r.result?.text ?? "";
  if (typeof text !== "string" || text.length > MAX_RESULT_LENGTH) fail("Invalid K2 output text", "INVALID_RESULT");
  const u = r.usage ?? r.result?.usage ?? {};
  const usage = obj(u) ? Object.fromEntries(["prompt_tokens", "completion_tokens", "total_tokens"].filter(k => Number.isSafeInteger(u[k]) && u[k] >= 0).map(k=>[k,u[k]])) : {};
  if (r.tool_calls || r.result?.tool_calls) fail("K2 worker returned unauthorized tool calls", "TOOL_EXECUTION_BLOCKED");
  // Provider finish_reason=stop and nonempty content are required for acceptance.
  if (partial || finishReason !== "stop" || !text.trim()) return { status: "rejected", reason: partial ? "truncated_output" : "incomplete_output", text, finish_reason: finishReason, partial_output: partial, usage };
  return { status: "review_required", text, finish_reason: finishReason, partial_output: false, usage };
}

/**
 * submitBoundedTask: async ({request_id,task_type,max_output_tokens,text,authorization_id}) => {task_id,status}
 * readBoundedTask: async ({task_id}) => {status, text, usage, finish_reason, partial_output}
 * cancelBoundedTask OPTIONAL: async ({task_id}) => acknowledgement (not proof of cancellation)
 * authorize: async ({requestId,hash,dataZone,taskType,maxOutputTokens}) =>
 *   {authorized:true,authorizationId:string,expiresAt:ISO string}.
 * The host MUST authenticate this gate; a client checkbox is not proof of approval.
 */
export class NeoK2WorkerAdapter {
  constructor({ submitBoundedTask, readBoundedTask, cancelBoundedTask, authorize, requestLedger, now = () => Date.now() }) {
    if (typeof submitBoundedTask !== "function" || typeof readBoundedTask !== "function") fail("Existing K2 submit/status host hooks are required", "HOST_NOT_READY");
    if (typeof authorize !== "function") fail("Trusted per-task authorization gate is mandatory", "APPROVAL_REQUIRED");
    if (!requestLedger?.get || !requestLedger?.put || !requestLedger?.reserve) fail("Transactional idempotency ledger with atomic reserve required", "LEDGER_REQUIRED");
    this.submitBoundedTask = submitBoundedTask;
    this.readBoundedTask = readBoundedTask;
    this.cancelBoundedTask = cancelBoundedTask;
    this.authorize = authorize;
    this.ledger = requestLedger;
    this.now = now;
  }
  async submit(input) {
    const c = validateInput(input);
    const fingerprint = hash(c);
    const old = await this.ledger.get(c.requestId);
    if (old) {
      if (old.fingerprint !== fingerprint) fail("Request ID reused with modified task", "IDEMPOTENCY_CONFLICT");
      // An unknown dispatch outcome must not be blindly retried.
      return copy(old.receipt ?? { status: "blocked", reason: "dispatch_outcome_unknown" });
    }
    const approval = await this.authorize({ requestId: c.requestId, hash: fingerprint, dataZone: c.dataZone, taskType: c.taskType, maxOutputTokens: c.maxOutputTokens });
    if (!obj(approval) || approval.authorized !== true || typeof approval.authorizationId !== "string" || approval.authorizationId.length < 8 || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= this.now()) {
      fail("Explicit, current host-authenticated owner approval required", "APPROVAL_REQUIRED");
    }
    // Transactional reserve (put-if-absent) is required under concurrent callers.
    const reserved = await this.ledger.reserve(c.requestId, { fingerprint, receipt: { status: "blocked", reason: "dispatch_outcome_unknown" } });
    if (reserved !== true) {
      const existing = await this.ledger.get(c.requestId);
      if (existing?.fingerprint !== fingerprint) fail("Request ID reused with modified task", "IDEMPOTENCY_CONFLICT");
      return copy(existing?.receipt ?? { status: "blocked", reason: "dispatch_outcome_unknown" });
    }
    try {
      const response = unpack(await this.submitBoundedTask({ request_id: c.requestId, text: c.instruction, task_type: c.taskType,
        max_output_tokens: c.maxOutputTokens, authorization_id: approval.authorizationId }));
      const id = normalizeId(response);
      const receipt = { status: "submitted", task_id: id, request_id: c.requestId, worker: K2_WORKER_ID };
      await this.ledger.put(c.requestId, { fingerprint, receipt });
      return copy(receipt);
    } catch (error) {
      // The request may already exist remotely. Never auto retry with a fresh ID.
      fail("K2 submission outcome uncertain; reconcile in host UI by request ID", "UNCERTAIN_DISPATCH");
    }
  }
  async status({ taskId, expectJson = false }) {
    if (typeof taskId !== "string" || taskId.length < 3 || taskId.length > 160 || /\s/.test(taskId)) fail("Invalid task ID");
    const state = unpack(await this.readBoundedTask({ task_id: taskId }));
    if (!allowedStates.has(state.status) && !state.finish_reason) fail("Unknown K2 status", "UNSUPPORTED_RESPONSE");
    if (["queued", "pending", "running", "processing"].includes(state.status)) return { status: "running", task_id: taskId };
    if (["failed", "error", "cancelled", "cancelling"].includes(state.status)) return { status: state.status === "cancelled" ? "cancelled" : state.status === "cancelling" ? "cancelling" : "failed", task_id: taskId, reason: state.status };
    const outcome = normalizeCompletion(state);
    if (expectJson && outcome.status === "review_required") {
      try {
        const parsed = JSON.parse(outcome.text.trim());
        if (!obj(parsed) && !Array.isArray(parsed)) throw new Error("JSON must be object or array");
        outcome.parsed_json = parsed;
      } catch { outcome.status = "rejected"; outcome.reason = "invalid_json"; }
    }
    return { ...outcome, task_id: taskId };
  }
  async cancel({ taskId }) {
    if (typeof this.cancelBoundedTask !== "function") fail("Host does not support verified K2 cancellation", "CANCEL_NOT_AVAILABLE");
    if (typeof taskId !== "string" || !taskId.trim() || taskId.length > 160) fail("Invalid task ID");
    const r = unpack(await this.cancelBoundedTask({ task_id: taskId }));
    return { status: "cancelling", task_id: taskId, acknowledged: !!r };
  }
}

/** Basic only; use transactional persistent storage with conditional insertion before production. */
export class TestMemoryLedger {
  constructor() { this.map = new Map(); }
  async get(k) { return copy(this.map.get(k) ?? null); }
  async put(k, v) { this.map.set(k, copy(v)); }
  async reserve(k, v) { if (this.map.has(k)) return false; this.map.set(k, copy(v)); return true; }
}