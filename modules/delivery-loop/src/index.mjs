/**
 * NeoOS Delivery Loop v0.1 — bounded, resumable, single-host orchestration core.
 * No network traffic, shell execution or model calls occur in this module.
 * Callers inject scoped worker/planner/reviewer ports; the worker does not certify itself.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const copy = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const ensure = (ok, message) => { if (!ok) fail(message); };
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const SAFE = new Set(['read_only', 'reversible', 'external']);
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

/** Internal persistence: atomic file replace. Only one process may hold the ledger lock. */
export class JsonLedger {
  constructor(path) { this.path = path; this.lock = `${path}.lock`; this.lease = null; }
  async acquire() {
    ensure(!this.lease, 'ledger already opened');
    await mkdir(dirname(this.path), { recursive: true });
    try { this.lease = await open(this.lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('ledger is locked: do not start a second dispatcher'); throw error; }
    await this.lease.writeFile(`${process.pid}\n`);
  }
  async close() {
    if (!this.lease) return;
    await this.lease.close(); this.lease = null;
    await unlink(this.lock);
  }
  async read() {
    ensure(this.lease, 'ledger not opened');
    try { return JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, objectives: {}, requests: {}, events: [] }; throw error; }
  }
  async write(state) {
    ensure(this.lease, 'ledger not opened');
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(tmp, this.path); }
    finally { await unlink(tmp).catch(() => {}); }
  }
}

export class DeliveryLoop {
  /** Ports: planner.plan(intake), executor.run({objective, task, idempotencyKey}),
   * executor.reconcile({objective, task, idempotencyKey}),
   * verifier.review({objective, task, output, evidence}),
   * skills.has({skillId, digest}), policy.authorize({objective, task}).
   * Each port is an explicit granted capability; no dynamic code or tools from prompt text.
   */
  constructor({ ledger, planner, executor, verifier, skills, capabilities, policy = {}, clock = () => new Date().toISOString(), maxAttempts = 3, dispatchTimeoutMs = 120000 }) {
    ensure(ledger && planner && executor && verifier && skills && capabilities, 'missing required port');
    this.ledger = ledger; this.planner = planner; this.executor = executor;
    this.verifier = verifier; this.skills = skills; this.capabilities = capabilities; this.policy = policy;
    this.clock = clock; this.maxAttempts = maxAttempts; this.dispatchTimeoutMs = dispatchTimeoutMs;
    ensure(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 5, 'unsafe maxAttempts');
    ensure(Number.isInteger(dispatchTimeoutMs) && dispatchTimeoutMs >= 1 && dispatchTimeoutMs <= 3600000, 'unsafe dispatch timeout');
  }
  async open() { await this.ledger.acquire(); this.state = await this.ledger.read(); this.validateJournal(); return this; }
  async close() { await this.ledger.close(); }
  async save() { await this.ledger.write(this.state); }
  event(kind, objective, details = {}) {
    const e = { seq: this.state.events.length + 1, at: this.clock(), kind, objective, details };
    const prev = this.state.events.at(-1)?.hash ?? 'GENESIS';
    e.hash = sha({ prev, seq: e.seq, at: e.at, kind, objective, details });
    this.state.events.push(e);
  }
  validateJournal() {
    let prev = 'GENESIS';
    for (const [index, e] of this.state.events.entries()) {
      ensure(e.seq === index + 1, 'audit sequence corrupted');
      ensure(sha({prev, seq:e.seq, at:e.at, kind:e.kind, objective:e.objective, details:e.details}) === e.hash, 'audit hash chain corrupted');
      prev = e.hash;
    }
  }
  get(id) { const o = this.state.objectives[id]; ensure(o, 'objective not found'); return copy(o); }
  list() { return Object.values(this.state.objectives).map(copy); }
  async intake({ requestId, problem, direction, references, objectives, constraints = [] }) {
    ensure(nonempty(requestId) && ID.test(requestId), 'valid idempotency requestId required');
    for (const [key, value] of Object.entries({problem, direction})) ensure(nonempty(value), `${key} required`);
    ensure(Array.isArray(references) && references.every(nonempty), 'references must be a list of strings, may be empty');
    ensure(Array.isArray(objectives) && objectives.length > 0 && objectives.every(nonempty), 'at least one clear objective required');
    ensure(Array.isArray(constraints) && constraints.every(nonempty), 'constraints must be a list of strings');
    const payload = {problem, direction, references, objectives, constraints};
    const checksum = sha(payload);
    if (this.state.requests[requestId]) {
      const recorded = this.state.requests[requestId];
      ensure(recorded.checksum === checksum, 'idempotency request reused for different intake');
      return this.get(recorded.objectiveId);
    }
    const id = randomUUID();
    const o = {id, requestId, intake:payload, status:'intake', tasks:[], approvals:[], results:[], created:this.clock(), updated:this.clock()};
    this.state.objectives[id] = o; this.state.requests[requestId] = {checksum, objectiveId:id};
    this.event('INTAKE',id,{fingerprint:checksum}); await this.save(); return this.get(id);
  }
  /** Planner output is untrusted: strict structural and dependency validation. */
  checkPlan(tasks, objectiveCount) {
    ensure(Array.isArray(tasks) && tasks.length >= 1 && tasks.length <= 30,'plan must contain 1..30 tasks');
    const seen = new Set();
    const covered = new Set();
    for (const t of tasks) {
      ensure(ID.test(t.id || '') && !seen.has(t.id), 'task id missing/duplicated');
      ensure(nonempty(t.title) && nonempty(t.instruction), 'task title/instruction missing');
      ensure(SAFE.has(t.risk), 'invalid task risk');
      ensure(Array.isArray(t.dependsOn) && t.dependsOn.every(d => seen.has(d)), 'dependencies must reference earlier tasks');
      ensure(nonempty(t.skill) && /^[a-zA-Z0-9._-]{1,96}$/.test(t.skill), 'skill id required');
      ensure(/^[a-f0-9]{64}$/.test(t.skillDigest || ''), 'pinned skill digest required');
      ensure(nonempty(t.capability) && ID.test(t.capability), 'allowlisted capability required');
      const declaredRisk = this.capabilities[t.capability];
      ensure(SAFE.has(declaredRisk) && t.risk === declaredRisk, 'capability risk mismatch (no down-classification)');
      ensure(Array.isArray(t.objectiveRefs) && t.objectiveRefs.length > 0 && t.objectiveRefs.every(i => Number.isInteger(i) && i>=0 && i<objectiveCount), 'objective coverage references required');
      t.objectiveRefs.forEach(i=>covered.add(i));
      ensure(Array.isArray(t.acceptance) && t.acceptance.length > 0 && t.acceptance.every(a =>
        ID.test(a.id || '') && ['contains','equals','manual'].includes(a.method) && nonempty(a.description) && (a.method === 'manual' || typeof a.expected === 'string')
      ), 'testable acceptance required');
      seen.add(t.id);
    }
    ensure(covered.size === objectiveCount, 'plan omits one or more founder objectives');
  }
  async plan(objectiveId) {
    const o = this.state.objectives[objectiveId]; ensure(o?.status === 'intake', 'objective cannot be replanned after dispatch');
    const tasks = await this.planner.plan(copy(o.intake)); this.checkPlan(tasks, o.intake.objectives.length);
    o.tasks = tasks.map(t => ({...copy(t), status:'queued', attempt:0, output:null, evidence:[], review:null, dispatchId:null}));
    o.status = 'active'; o.updated = this.clock();
    this.event('PLAN_ACCEPTED',objectiveId,{taskIds:o.tasks.map(t=>t.id)});
    await this.save(); return this.get(objectiveId);
  }
  async approve(objectiveId, taskId, { approver, scope }) {
    const o = this.state.objectives[objectiveId]; ensure(o, 'objective missing');
    const t = o.tasks.find(t=>t.id===taskId); ensure(t && t.risk === 'external','task is not external');
    ensure(nonempty(approver) && nonempty(scope), 'explicit approver and bounded scope required');
    ensure(scope === `${objectiveId}:${taskId}`, 'approval scope must match exact task');
    ensure(!t.dispatchId, 'cannot approve already dispatched task');
    o.approvals.push({taskId,approver,scope,at:this.clock()});
    this.event('APPROVED',objectiveId,{taskId,approver,scope}); await this.save();
  }
  async dispatch(objectiveId) {
    const o=this.state.objectives[objectiveId]; ensure(o?.status === 'active','not active');
    const pending=o.tasks.filter(t=>t.status==='queued');
    for (const t of pending) {
      if (!t.dependsOn.every(d=>o.tasks.find(x=>x.id===d)?.status==='verified')) continue;
      if (!(await this.skills.has({skillId:t.skill,digest:t.skillDigest}))) {
        t.status='blocked';t.blocker='SKILL_NOT_VERIFIED';this.event('BLOCKED',objectiveId,{taskId:t.id,reason:t.blocker}); await this.save(); return {status:'blocked',taskId:t.id};
      }
      if (t.risk==='external' && !o.approvals.some(a=>a.taskId===t.id && a.scope===`${objectiveId}:${t.id}`)) {
        t.status='blocked';t.blocker='OWNER_APPROVAL_REQUIRED';this.event('BLOCKED',objectiveId,{taskId:t.id,reason:t.blocker}); await this.save(); return {status:'blocked',taskId:t.id};
      }
      if (this.policy.authorize) {
        const decision=await this.policy.authorize({objective:copy(o),task:copy(t)});
        if (decision !== 'ALLOW') {
          t.status='blocked';t.blocker=`POLICY_${String(decision).slice(0,80)}`;
          this.event('BLOCKED',objectiveId,{taskId:t.id,reason:t.blocker}); await this.save();return {status:'blocked',taskId:t.id};
        }
      }
      // Write before the call: restart must reconcile uncertainty, never dispatch twice.
      t.status='dispatching';t.attempt+=1;t.dispatchId=`${objectiveId}:${t.id}:${t.attempt}`;
      this.event('DISPATCH_PREPARED',objectiveId,{taskId:t.id,idempotencyKey:t.dispatchId});await this.save();
      const controller = new AbortController();
      let timer;
      try {
        const r=await Promise.race([
          this.executor.run({objective:copy(o),task:copy(t),idempotencyKey:t.dispatchId,signal:controller.signal}),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('dispatch timeout'));},this.dispatchTimeoutMs);})
        ]);
        return await this.receive(objectiveId,t.id,r);
      } catch (error) {
        t.status='uncertain';t.blocker='DISPATCH_UNCERTAIN_RECONCILE_REQUIRED';
        this.event('DISPATCH_UNCERTAIN',objectiveId,{taskId:t.id});await this.save();
        return {status:'uncertain',taskId:t.id};
      } finally {clearTimeout(timer);}
    }
    return {status:pending.length ? 'waiting_dependencies_or_blocked' : 'no_queued_tasks'};
  }
  async receive(objectiveId,taskId,result) {
    const o=this.state.objectives[objectiveId],t=o.tasks.find(x=>x.id===taskId);
    ensure(t && ['dispatching','uncertain','running'].includes(t.status),'task not dispatched');
    ensure(result && nonempty(result.output) && Array.isArray(result.evidence) && result.evidence.every(nonempty),'worker result requires output and evidence');
    t.output=result.output;t.evidence=copy(result.evidence);t.status='review_required';t.blocker=null;
    this.event('WORKER_OUTPUT',objectiveId,{taskId,outputSha:sha(t.output),evidenceCount:t.evidence.length});await this.save();
    return {status:'review_required',taskId};
  }
  async reconcile(objectiveId,taskId) {
    const o=this.state.objectives[objectiveId],t=o?.tasks.find(x=>x.id===taskId);
    ensure(t && ['uncertain','dispatching','running'].includes(t.status),'no pending dispatch');
    ensure(typeof this.executor.reconcile === 'function','executor needs reconcile capability');
    const r=await this.executor.reconcile({objective:copy(o),task:copy(t),idempotencyKey:t.dispatchId});
    if (r?.status==='not_found') {t.status='blocked';t.blocker='RECONCILE_NOT_FOUND_MANUAL_RETRY';this.event('BLOCKED',objectiveId,{taskId,reason:t.blocker});await this.save();return {status:'blocked'};}
    if (r?.status==='pending') {t.status='running';await this.save();return {status:'running'};}
    return this.receive(objectiveId,taskId,r);
  }
  async review(objectiveId,taskId) {
    const o=this.state.objectives[objectiveId],t=o?.tasks.find(x=>x.id===taskId);
    ensure(t?.status==='review_required','no result to review');
    // Deterministic checks are authoritative; human/AI review cannot override.
    const failures=[];
    for (const a of t.acceptance) {
      if (a.method==='contains' && !t.output.includes(a.expected)) failures.push(a.id);
      if (a.method==='equals' && t.output !== a.expected) failures.push(a.id);
    }
    const verdict=await this.verifier.review({objective:copy(o),task:copy(t),output:t.output,evidence:copy(t.evidence)});
    ensure(verdict && nonempty(verdict.reviewer) && nonempty(verdict.evidence) && verdict.reviewer !== t.id && verdict.reviewer !== t.capability, 'independent verifier identity and evidence required');
    const manual=t.acceptance.filter(a=>a.method==='manual');
    ensure(Array.isArray(verdict.checks) && manual.every(a=>verdict.checks.some(c=>c.id===a.id && typeof c.passed === 'boolean')),'manual checks must be explicit');
    if (manual.some(a=>!verdict.checks.find(c=>c.id===a.id).passed)) failures.push(...manual.filter(a=>!verdict.checks.find(c=>c.id===a.id).passed).map(a=>a.id));
    const pass=failures.length===0 && verdict.pass===true;
    t.review={pass,failures,reviewer:verdict.reviewer,evidence:verdict.evidence,outputSha:sha(t.output)};
    t.status=pass?'verified':(t.risk!=='external' && t.attempt<this.maxAttempts?'queued':'rejected');
    this.event(pass?'VERIFIED':'REJECTED',objectiveId,{taskId,failures,reviewer:verdict.reviewer,willRetry:t.status==='queued'});
    if (pass && o.tasks.every(x=>x.status==='verified')) o.status='ready_to_deliver';
    await this.save();return {status:t.status,failures};
  }
  async unblock(objectiveId,taskId) {
    const o=this.state.objectives[objectiveId],t=o?.tasks.find(x=>x.id===taskId);
    ensure(t?.status==='blocked' && !t.dispatchId,'only never-dispatched blocked tasks can re-enter queue');
    t.status='queued';t.blocker=null;this.event('UNBLOCK',objectiveId,{taskId});await this.save();
  }
  /** Drive all ready work to a quiescent state; caller/scheduler repeats after pending jobs finish. */
  async runUntilBoundary(objectiveId, maxSteps=60) {
    ensure(Number.isInteger(maxSteps) && maxSteps>=1 && maxSteps<=1000, 'invalid step budget');
    for(let i=0;i<maxSteps;i++) {
      const o=this.get(objectiveId);
      if(o.status==='ready_to_deliver') return {status:'delivered',objective:await this.deliver(objectiveId)};
      if(o.status!=='active') return {status:o.status,objective:o};
      const awaiting=o.tasks.find(t=>t.status==='review_required');
      if(awaiting) {await this.review(objectiveId,awaiting.id);continue;}
      const unresolved=o.tasks.find(t=>['uncertain','dispatching','running'].includes(t.status));
      if(unresolved) {
        const outcome=await this.reconcile(objectiveId,unresolved.id);
        if(outcome.status==='running'||outcome.status==='blocked') return outcome;
        continue;
      }
      const queued=o.tasks.some(t=>t.status==='queued');
      if(queued) {
        const outcome=await this.dispatch(objectiveId);
        if(['blocked','waiting_dependencies_or_blocked'].includes(outcome.status)) return outcome;
        continue;
      }
      return {status:'blocked_or_rejected',objective:o};
    }
    return {status:'step_budget_exhausted',objective:this.get(objectiveId)};
  }
  async deliver(objectiveId) {
    const o=this.state.objectives[objectiveId];ensure(o?.status==='ready_to_deliver' && o.tasks.every(t=>t.status==='verified'),'not verified end to end');
    o.status='delivered';o.updated=this.clock();o.results=o.tasks.map(t=>({taskId:t.id,output:t.output,evidence:t.evidence,review:t.review}));
    this.event('DELIVERED',objectiveId,{taskCount:o.results.length});await this.save();return this.get(objectiveId);
  }
}