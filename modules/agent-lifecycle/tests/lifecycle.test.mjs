import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentLifecycleManager, JsonFileStore, MemoryStore } from "../src/index.mjs";

function harness({ safe = true, reviewer = true, memory = false } = {}) {
  const remote = new Map();
  let assigns = 0;
  const transport = {
    async assign(payload) { 
      assigns++;
      assert.equal(payload.data_zone, "general");
      assert.equal(payload.export_to_chatgpt, true);
      const id = "job-" + assigns;
      remote.set(id, { status: "running" });
      return { job_id: id };
    },
    async read({ job_id }) {
      const item = remote.get(job_id);
      if (!item) throw new Error("missing remote job");
      if (item.status === "complete") return {
        status: "complete", agent_result: { knowledge_markdown: "Cafe has a menu; ordering availability is unverified" }
      };
      return { status: item.status };
    },
    async cancel({ job_id }) { remote.get(job_id).status = "cancelled"; return { cancel_requested: true }; }
  };
  return {
    remote,
    transport,
    capacityProbe: async () => ({ safe, reason: safe ? "" : "capacity busy" }),
    verifier: reviewer ? async t => ({
      status: t.result?.knowledge_markdown.includes("unverified") ? "verified" : "rejected",
      reviewer: "independent-qa-v1", evidence: "test-fixture-evidence-001"
    }) : undefined,
    resourceProbe: async () => memory
      ? { observed: true, memoryReleased: true, evidence: "memory-snapshot-before-after" }
      : { observed: false, memoryReleased: false },
    get assigns() { return assigns; }
  };
}

const request = (requestId = "test-request-001") =>
  ({ requestId, role: "sales.qualifier", task: "Extract public facts from a fictional cafe listing." });

test("create -> assign -> execute -> independently verify", async () => {
  const h = harness();
  const manager = await new AgentLifecycleManager({ ...h }).init();
  const t = await manager.create(request());
  assert.equal(t.status, "queued");
  await manager.tick();
  assert.equal(manager.get(t.id).status, "running");
  assert.equal(h.assigns, 1);
  h.remote.get(manager.get(t.id).jobId).status = "complete";
  await manager.tick();
  const done = manager.get(t.id);
  assert.equal(done.status, "verified");
  assert.equal(done.reviewer, "independent-qa-v1");
  assert.equal(done.memoryRelease, "unverified");
  assert(manager.audit(t.id).some(x => x.action === "independent_review"));
});

test("no verifier => completed worker stays pending independent review", async () => {
  const h = harness({ reviewer: false });
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  await manager.tick();
  h.remote.get(manager.get(t.id).jobId).status = "complete";
  await manager.tick();
  assert.equal(manager.get(t.id).status, "review_required");
  assert.equal(manager.get(t.id).review, "pending");
});

test("cancellation requires backend terminal confirmation", async () => {
  const h = harness();
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  await manager.tick();
  await manager.cancel(t.id);
  assert.equal(manager.get(t.id).status, "cancelling");
  await manager.tick();
  assert.equal(manager.get(t.id).status, "cancelled");
  assert(manager.audit(t.id).some(x => x.action === "cancelled_confirmed"));
});

test("capacity guard prevents dispatch when resources are unavailable", async () => {
  const h = harness({ safe: false });
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  await manager.tick();
  assert.equal(h.assigns, 0);
  assert.equal(manager.get(t.id).status, "queued");
});

test("missing capacity probe fails closed", async () => {
  const h = harness();
  const manager = await new AgentLifecycleManager({ transport: h.transport }).init();
  const t = await manager.create(request());
  await manager.tick();
  assert.equal(manager.get(t.id).status, "queued");
  assert.equal(h.assigns, 0);
});

test("duplicate requests are idempotent; mismatched payload is rejected", async () => {
  const h = harness();
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  assert.equal((await manager.create(request())).id, t.id);
  await assert.rejects(() => manager.create({ ...request(), task: "Different content" }), /idempotency/);
  assert.equal(manager.list().length, 1);
});

test("unapproved role and malformed content never reach the worker", async () => {
  const h = harness();
  const manager = await new AgentLifecycleManager(h).init();
  await assert.rejects(() => manager.create({ ...request(), role: "sales.outreach_send" }), /not approved/);
  await assert.rejects(() => manager.create({ ...request(), task: "x".repeat(2401) }), /invalid task/);
  assert.equal(h.assigns, 0);
});

test("uncertain assignment is blocked, not blindly retried", async () => {
  const h = harness();
  h.transport.assign = async () => { throw new Error("lost network response"); };
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  await manager.tick();
  assert.equal(manager.get(t.id).status, "blocked");
  await manager.tick();
  assert.equal(manager.get(t.id).attempts, 1);
});

test("resource release is not claimed without measured evidence", async () => {
  const h = harness({ memory: true });
  const manager = await new AgentLifecycleManager(h).init();
  const t = await manager.create(request());
  await manager.tick();
  h.remote.get(manager.get(t.id).jobId).status = "complete";
  await manager.tick();
  assert.equal(manager.get(t.id).memoryRelease, "verified");
  assert.equal(manager.get(t.id).memoryEvidence, "memory-snapshot-before-after");
});

test("single-process state survives manager recreation", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "neoos-agent-")), "ledger.json");
  const h = harness();
  const a = await new AgentLifecycleManager({ ...h, store: new JsonFileStore(path) }).init();
  const task = await a.create(request());
  const disk = JSON.parse(await readFile(path, "utf8"));
  assert.equal(disk.tasks[0].id, task.id);
  const b = await new AgentLifecycleManager({ ...h, store: new JsonFileStore(path) }).init();
  assert.equal(b.get(task.id).status, "queued");
});

test("unsafe dispatch state recovered as blocked after restart", async () => {
  const h = harness();
  const store = new MemoryStore();
  const a = await new AgentLifecycleManager({ ...h, store }).init();
  const t = await a.create(request());
  store.tasks[0].status = "dispatching";
  const b = await new AgentLifecycleManager({ ...h, store }).init();
  assert.equal(b.get(t.id).status, "blocked");
});
