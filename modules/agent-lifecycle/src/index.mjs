import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

// This module schedules approved, read-only NeoOS jobs. It does not create arbitrary
// processes, browse Maps, send outreach, spend money, or unload shared Ollama models.
export const DEFAULT_ROLES = Object.freeze({
  "sales.qualifier": Object.freeze({ agentKind: "extract_facts", description: "Extract grounded public business facts" }),
  "sales.pitch_drafter": Object.freeze({ agentKind: "rewrite", description: "Rewrite a supplied, approved pitch for review" }),
  "sales.researcher": Object.freeze({ agentKind: "subject_learner", description: "Bounded public background research" }),
  "ops.summarizer": Object.freeze({ agentKind: "summarize", description: "Summarize supplied public text" })
});
export const TERMINAL = new Set(["verified", "rejected", "failed", "cancelled"]);

const now = () => new Date().toISOString();
const clone = value => structuredClone(value);

export class MemoryStore {
  constructor() { this.tasks = []; this.events = []; }
  async load() { return clone({ tasks: this.tasks, events: this.events }); }
  async save(snapshot) { this.tasks = clone(snapshot.tasks); this.events = clone(snapshot.events); }
}

// Single-process local persistence; use a transactional DB and single-leader lease
// for production and NEVER store credentials or private customer data in this file.
export class JsonFileStore {
  constructor(path) { if (!path) throw new Error("path is required"); this.path = path; }
  async load() {
    try { return JSON.parse(await readFile(this.path, "utf8")); }
    catch (err) { if (err.code === "ENOENT") return { tasks: [], events: [] }; throw err; }
  }
  async save(snapshot) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = this.path + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await rename(tmp, this.path);
  }
}

export class AgentLifecycleManager {
  constructor({ transport, capacityProbe, verifier, resourceProbe, store = new MemoryStore(),
                roles = DEFAULT_ROLES, concurrency = 1, maxAttempts = 2, queueTimeoutMs = 30 * 60_000 }) {
    if (!transport?.assign || !transport?.read || !transport?.cancel) throw new Error("transport must implement assign/read/cancel");
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("invalid concurrency");
    this.transport = transport;
    this.capacityProbe = capacityProbe; // missing probe => fail-closed
    this.verifier = verifier; // missing independent verifier => review_required
    this.resourceProbe = resourceProbe; // never infer model unload
    this.store = store;
    this.roles = roles;
    this.concurrency = concurrency;
    this.maxAttempts = maxAttempts;
    this.queueTimeoutMs = queueTimeoutMs;
    this.tasks = [];
    this.events = [];
    this.locked = false;
  }

  async init() {
    const snapshot = await this.store.load();
    this.tasks = snapshot.tasks ?? [];
    this.events = snapshot.events ?? [];
    // Do not redispatch jobs that had already been assigned before a restart.
    for (const task of this.tasks) {
      if (task.status === "dispatching") {
        task.status = "blocked";
        task.reason = "Dispatch outcome unknown after restart; reconcile using requestId before retrying";
        this.#event(task, "blocked_uncertain_dispatch");
      }
    }
    await this.#save();
    return this;
  }

  #event(task, action, extra = {}) {
    this.events.push({ timestamp: now(), taskId: task.id, requestId: task.requestId, action, ...extra });
  }
  async #save() { await this.store.save({ tasks: this.tasks, events: this.events }); }
  list() { return clone(this.tasks); }
  get(id) { const task = this.tasks.find(t => t.id === id); return task ? clone(task) : null; }
  audit(id) { return clone(this.events.filter(e => e.taskId === id)); }

  async create({ requestId, role, task, sourceUrl }) {
    if (this.locked) throw new Error("manager busy");
    if (!requestId || typeof requestId !== "string" || requestId.length < 8 || requestId.length > 84) throw new Error("invalid requestId");
    if (!Object.hasOwn(this.roles, role)) throw new Error("role is not approved");
    if (typeof task !== "string" || !task.trim() || task.length > 2400) throw new Error("invalid task");
    if (sourceUrl && (!/^https:\/\/[^\s]+$/i.test(sourceUrl) || sourceUrl.length > 2048)) throw new Error("public HTTPS sourceUrl required");
    const existing = this.tasks.find(t => t.requestId === requestId);
    if (existing) {
      if (existing.role !== role || existing.task !== task || existing.sourceUrl !== (sourceUrl ?? null)) throw new Error("idempotency key reused with different data");
      return clone(existing);
    }
    const record = { id: randomUUID(), requestId, role, task, sourceUrl: sourceUrl ?? null,
      status: "queued", attempts: 0, jobId: null, reason: "", result: null,
      review: "not_started", memoryRelease: "unverified", createdAt: now(), updatedAt: now() };
    this.tasks.push(record);
    this.#event(record, "created", { role });
    await this.#save();
    return clone(record);
  }

  async cancel(id) {
    const t = this.tasks.find(x => x.id === id);
    if (!t) throw new Error("unknown task");
    if (TERMINAL.has(t.status)) return clone(t);
    if (t.status === "queued" || t.status === "blocked" || t.status === "review_required") {
      t.status = "cancelled"; t.reason = "Cancelled without an active worker";
      this.#event(t, "cancelled_without_worker");
    } else if (t.status === "running") {
      await this.transport.cancel({ job_id: t.jobId });
      t.status = "cancelling"; t.reason = "Cancellation requested; await terminal backend acknowledgement";
      this.#event(t, "cancel_requested", { jobId: t.jobId });
    } else {
      throw new Error("cannot safely cancel a dispatch with an uncertain outcome");
    }
    t.updatedAt = now();
    await this.#save();
    return clone(t);
  }

  async tick() {
    if (this.locked) return { skipped: "tick already running" };
    this.locked = true;
    try {
      for (const t of this.tasks.filter(x => ["running", "cancelling"].includes(x.status))) {
        await this.#poll(t);
      }
      for (const t of this.tasks.filter(x => x.status === "review_required")) {
        await this.#review(t);
      }
      const active = this.tasks.filter(x => ["running", "cancelling", "dispatching"].includes(x.status)).length;
      const next = this.tasks.find(x => x.status === "queued");
      if (next && active < this.concurrency) {
        if (Date.now() - Date.parse(next.createdAt) > this.queueTimeoutMs) {
          next.status = "blocked"; next.reason = "Queue deadline exceeded"; this.#event(next, "queue_deadline");
        } else {
          let capacity;
          try { capacity = await this.capacityProbe?.(); }
          catch (e) { capacity = { safe: false, reason: "capacity_probe_failed" }; }
          if (capacity?.safe === true) await this.#dispatch(next);
          else next.reason = capacity?.reason || "capacity unverified; fail-closed";
        }
      }
      await this.#save();
      return { active: this.tasks.filter(x => ["running", "cancelling", "dispatching"].includes(x.status)).length,
               queued: this.tasks.filter(x => x.status === "queued").length,
               reviewRequired: this.tasks.filter(x => x.status === "review_required").length };
    } finally { this.locked = false; }
  }

  async #dispatch(t) {
    t.status = "dispatching"; t.attempts += 1; this.#event(t, "dispatch_requested", { attempt: t.attempts });
    // Save the uncertainty boundary before making a network call.
    await this.#save();
    try {
      const r = await this.transport.assign({ request_id: t.requestId + (t.attempts > 1 ? "-r" + t.attempts : ""), agent_kind: this.roles[t.role].agentKind,
        task: t.task, ...(t.sourceUrl ? { source_url: t.sourceUrl } : {}),
        data_zone: "general", export_to_chatgpt: true });
      if (!r?.job_id) throw new Error("no job ID returned");
      t.jobId = r.job_id; t.status = "running"; t.reason = "";
      this.#event(t, "job_assigned", { jobId: t.jobId });
    } catch (err) {
      // An uncertain remote dispatch must be reconciled, not automatically retried.
      t.status = "blocked"; t.reason = "Assignment outcome uncertain: " + String(err.message ?? err);
      this.#event(t, "dispatch_uncertain");
    }
    t.updatedAt = now();
  }

  async #poll(t) {
    let r;
    try { r = await this.transport.read({ job_id: t.jobId, include_entry: true }); }
    catch (err) { t.reason = "Poll unavailable: " + String(err.message ?? err); return; }
    if (r?.status === "cancelled") {
      t.status = "cancelled"; t.reason = "Backend confirmed cancellation";
      this.#event(t, "cancelled_confirmed", { jobId: t.jobId });
    } else if (r?.status === "complete") {
      // A worker can complete while cancellation is in flight; do not keep
      // the orchestration lease stuck at 'cancelling' indefinitely.
      t.result = r.agent_result ?? r.result ?? null;
      t.status = "review_required"; t.review = "pending";
      t.reason = "Worker completed; independent review required";
      this.#event(t, "completed_pending_review", { jobId: t.jobId });
    } else if (r?.status === "error" || r?.status === "failed") {
      t.reason = r.error ?? r.reason ?? "Worker failed";
      this.#event(t, "backend_error", { jobId: t.jobId });
      if (t.attempts < this.maxAttempts && t.status !== "cancelling") {
        // Only read-only registered tasks are retryable; each attempt gets
        // a separate backend idempotency key, with a bounded retry budget.
        t.status = "queued"; t.jobId = null;
        this.#event(t, "retry_queued", { nextAttempt: t.attempts + 1 });
      } else t.status = "failed";
    } else if (t.status === "cancelling") {
      // Never mark cancelled from cancel_requested alone.
      t.reason = "Waiting for backend cancellation confirmation";
    }
    if (TERMINAL.has(t.status) || t.status === "review_required") {
      await this.#recordResources(t);
    }
    t.updatedAt = now();
  }

  async #review(t) {
    if (typeof this.verifier !== "function") return;
    let v;
    try { v = await this.verifier(clone(t)); }
    catch (err) { t.reason = "Verifier unavailable: " + String(err.message ?? err); return; }
    if (!v || !["verified", "rejected"].includes(v.status) || !v.reviewer ||
        v.reviewer === "worker" || v.reviewer === t.jobId || !v.evidence) {
      t.reason = "Independent evidence and reviewer required"; return;
    }
    t.status = v.status; t.review = v.status; t.reviewEvidence = v.evidence;
    t.reviewer = v.reviewer; t.updatedAt = now();
    this.#event(t, "independent_review", { reviewer: v.reviewer, disposition: v.status });
  }

  async #recordResources(t) {
    if (typeof this.resourceProbe !== "function") return;
    try {
      const check = await this.resourceProbe(clone(t));
      // Only explicit measured evidence can establish model-memory release.
      if (check?.observed === true && check?.memoryReleased === true && check.evidence) {
        t.memoryRelease = "verified"; t.memoryEvidence = check.evidence;
      }
    } catch { /* unverified, never assumed */ }
  }
}
