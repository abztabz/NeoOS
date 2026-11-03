"""NeoOS execution kernel: durable, evidence-gated local task state.

This module does not execute shell commands, deploy software, or call paid APIs.
Workers are externally registered and scoped to approved task contracts.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

STATES = frozenset({
    "specified", "executing", "testing", "reviewing",
    "awaiting_approval", "independently_verified", "released", "blocked",
})


class GateError(ValueError):
    """A governance or evidence gate rejected a requested transition."""


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _required(value, field):
    if not isinstance(value, str) or not value.strip():
        raise GateError(f"{field} must be a nonempty string")
    return value.strip()


def validate_contract(contract):
    required = ("id", "project_id", "objective", "builder", "verifier")
    if not isinstance(contract, dict):
        raise GateError("contract must be an object")
    for key in required:
        _required(contract.get(key), key)
    if contract["builder"] == contract["verifier"]:
        raise GateError("builder and verifier must be independent")
    tests = contract.get("acceptance_tests")
    if not isinstance(tests, list) or not tests or any(not isinstance(x, str) or not x.strip() for x in tests):
        raise GateError("acceptance_tests must contain named tests")
    if len(set(tests)) != len(tests):
        raise GateError("acceptance_tests must be unique")
    attempts = contract.get("max_attempts", 2)
    if not isinstance(attempts, int) or isinstance(attempts, bool) or not 1 <= attempts <= 5:
        raise GateError("max_attempts must be between 1 and 5")
    if type(contract.get("requires_approval", True)) is not bool:
        raise GateError("requires_approval must be boolean")
    allowed = contract.get("allowed_actions", [])
    if not isinstance(allowed, list) or any(not isinstance(x, str) or not x.strip() for x in allowed):
        raise GateError("allowed_actions must be a list")
    if any(x in {"shell", "arbitrary_command", "paid_api", "production_write"} for x in allowed):
        raise GateError("privileged actions cannot be delegated by a task contract")
    cost = contract.get("max_paid_aed", 0)
    if not isinstance(cost, (int, float)) or isinstance(cost, bool) or cost != 0:
        raise GateError("v1 refuses paid spending; max_paid_aed must be 0")
    result = dict(contract)
    result["max_attempts"] = attempts
    result["requires_approval"] = contract.get("requires_approval", True)
    result["allowed_actions"] = allowed
    result["max_paid_aed"] = 0
    return result


class ExecutionLedger:
    def __init__(self, path, clock=None):
        self.path = str(Path(path))
        self.clock = clock or time.time
        with self._db() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
                    contract TEXT NOT NULL, contract_sha TEXT NOT NULL,
                    state TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0,
                    recoveries INTEGER NOT NULL DEFAULT 0,
                    lease_owner TEXT, lease_token TEXT, lease_until REAL,
                    candidate_version TEXT, tests TEXT, verifier_id TEXT,
                    review_evidence TEXT, approval_by TEXT,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL, event TEXT NOT NULL,
                    details TEXT NOT NULL, at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS learning (
                    fingerprint TEXT PRIMARY KEY, task_id TEXT NOT NULL,
                    regression_test TEXT NOT NULL, evidence TEXT NOT NULL,
                    at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_claim
                    ON tasks(state, lease_until, created_at);
            """)

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA busy_timeout=10000")
            db.execute("PRAGMA journal_mode=WAL")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _event(self, db, task_id, event, details):
        db.execute(
            "INSERT INTO events(task_id,event,details,at) VALUES(?,?,?,?)",
            (task_id, event, _json(details), self.clock()),
        )

    def _row(self, db, task_id):
        row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise GateError("unknown task")
        return row

    def _begin(self, db):
        db.execute("BEGIN IMMEDIATE")

    def submit(self, raw_contract):
        contract = validate_contract(raw_contract)
        canonical = _json(contract)
        sha = hashlib.sha256(canonical.encode()).hexdigest()
        with self._db() as db:
            self._begin(db)
            current = db.execute("SELECT contract_sha FROM tasks WHERE id=?", (contract["id"],)).fetchone()
            if current:
                if current["contract_sha"] != sha:
                    raise GateError("task ID already used for a different contract")
                return False
            now = self.clock()
            db.execute(
                "INSERT INTO tasks(id,project_id,contract,contract_sha,state,created_at,updated_at)"
                " VALUES(?,?,?,?,'specified',?,?)",
                (contract["id"], contract["project_id"], canonical, sha, now, now),
            )
            self._event(db, contract["id"], "specified", {"contract_sha": sha})
            return True

    def get(self, task_id):
        with self._db() as db:
            row = dict(self._row(db, task_id))
            row["contract"] = json.loads(row["contract"])
            if row["tests"]:
                row["tests"] = json.loads(row["tests"])
            return row

    def events(self, task_id):
        with self._db() as db:
            return [dict(x) for x in db.execute(
                "SELECT sequence,event,details,at FROM events WHERE task_id=? ORDER BY sequence",
                (task_id,),
            )]

    def claim(self, worker, lease_seconds=120):
        worker = _required(worker, "worker")
        if not 10 <= lease_seconds <= 3600:
            raise GateError("lease_seconds outside safe bounds")
        with self._db() as db:
            self._begin(db)
            rows = db.execute(
                "SELECT * FROM tasks WHERE state IN ('specified','executing')"
                " AND (lease_until IS NULL OR lease_until<=?) ORDER BY created_at,id",
                (self.clock(),),
            ).fetchall()
            for row in rows:
                contract = json.loads(row["contract"])
                if contract["builder"] != worker:
                    continue
                recovery = row["state"] == "executing"
                if recovery and row["recoveries"] >= contract["max_attempts"]:
                    db.execute(
                        "UPDATE tasks SET state='blocked',lease_owner=NULL,lease_token=NULL,"
                        "lease_until=NULL,updated_at=? WHERE id=?",
                        (self.clock(), row["id"]),
                    )
                    self._event(db, row["id"], "lease_recovery_exhausted", {})
                    continue
                token = uuid.uuid4().hex
                attempt = row["attempt"] if recovery else row["attempt"] + 1
                recoveries = row["recoveries"] + 1 if recovery else 0
                db.execute(
                    "UPDATE tasks SET state='executing',attempt=?,recoveries=?,"
                    "lease_owner=?,lease_token=?,lease_until=?,updated_at=? WHERE id=?",
                    (attempt, recoveries, worker, token, self.clock() + lease_seconds,
                     self.clock(), row["id"]),
                )
                self._event(db, row["id"], "recovered" if recovery else "assigned", {"attempt": attempt})
                return {"task_id": row["id"], "attempt": attempt, "lease_token": token, "recovered": recovery}
            return None

    def candidate(self, task_id, worker, lease_token, version, evidence):
        _required(version, "candidate version")
        _required(evidence, "implementation evidence")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            if (row["state"] != "executing" or row["lease_owner"] != worker
                    or row["lease_token"] != lease_token or row["lease_until"] <= self.clock()):
                raise GateError("worker is not the active lease holder")
            db.execute(
                "UPDATE tasks SET state='testing',candidate_version=?,tests=NULL,"
                "lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=?",
                (version, self.clock(), task_id),
            )
            self._event(db, task_id, "implemented", {"version": version, "evidence": evidence})

    def record_tests(self, task_id, version, results, diagnosis=""):
        if not isinstance(results, dict):
            raise GateError("results must be an object")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            contract = json.loads(row["contract"])
            if row["state"] != "testing" or row["candidate_version"] != version:
                raise GateError("tests must target the current candidate in testing")
            if set(results) != set(contract["acceptance_tests"]):
                raise GateError("every acceptance test must have evidence")
            for item in results.values():
                if (not isinstance(item, dict) or type(item.get("passed")) is not bool
                        or not isinstance(item.get("evidence"), str) or not item["evidence"].strip()):
                    raise GateError("each test needs a boolean verdict and nonempty evidence")
            passed = all(item["passed"] for item in results.values())
            if not passed and not str(diagnosis).strip():
                raise GateError("failed tests require an explicit diagnosis")
            state = "reviewing" if passed else (
                "specified" if row["attempt"] < contract["max_attempts"] else "blocked"
            )
            db.execute(
                "UPDATE tasks SET state=?,tests=?,candidate_version=?,updated_at=? WHERE id=?",
                (state, _json(results), version, self.clock(), task_id),
            )
            self._event(db, task_id, "tested" if passed else "test_failed", {
                "version": version, "results": results, "diagnosis": diagnosis,
                "next_state": state,
            })
            return state

    def review(self, task_id, verifier, version, passed, evidence):
        _required(evidence, "review evidence")
        if type(passed) is not bool:
            raise GateError("review verdict must be boolean")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            contract = json.loads(row["contract"])
            if row["state"] != "reviewing" or row["candidate_version"] != version:
                raise GateError("review must target a tested candidate")
            if verifier != contract["verifier"] or verifier == contract["builder"]:
                raise GateError("reviewer must be the independent contract verifier")
            tests = json.loads(row["tests"] or "{}")
            if set(tests) != set(contract["acceptance_tests"]) or not all(t["passed"] for t in tests.values()):
                raise GateError("review requires complete passing tests")
            state = (
                "awaiting_approval" if contract["requires_approval"] else "independently_verified"
            ) if passed else (
                "specified" if row["attempt"] < contract["max_attempts"] else "blocked"
            )
            db.execute(
                "UPDATE tasks SET state=?,verifier_id=?,review_evidence=?,updated_at=? WHERE id=?",
                (state, verifier, evidence, self.clock(), task_id),
            )
            self._event(db, task_id, "independent_review", {
                "version": version, "verifier": verifier, "passed": passed,
                "evidence": evidence, "next_state": state,
            })
            return state

    def approve(self, task_id, approver, evidence):
        _required(approver, "approver")
        _required(evidence, "approval evidence")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            contract = json.loads(row["contract"])
            if row["state"] != "awaiting_approval":
                raise GateError("no pending approval")
            if approver in (contract["builder"], contract["verifier"]):
                raise GateError("approval must come from a separate authority")
            db.execute(
                "UPDATE tasks SET state='independently_verified',approval_by=?,updated_at=? WHERE id=?",
                (approver, self.clock(), task_id),
            )
            self._event(db, task_id, "human_approved", {"by": approver, "evidence": evidence})

    def record_release(self, task_id, release_ref, smoke_evidence):
        _required(release_ref, "release reference")
        _required(smoke_evidence, "live smoke-test evidence")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            if row["state"] != "independently_verified":
                raise GateError("cannot record release before verification and required approval")
            db.execute("UPDATE tasks SET state='released',updated_at=? WHERE id=?",
                       (self.clock(), task_id))
            self._event(db, task_id, "released", {
                "reference": release_ref, "smoke_evidence": smoke_evidence,
            })

    def learn(self, task_id, fingerprint, regression_test, evidence):
        fingerprint = _required(fingerprint, "failure fingerprint")
        regression_test = _required(regression_test, "regression test")
        evidence = _required(evidence, "learning evidence")
        with self._db() as db:
            self._begin(db)
            row = self._row(db, task_id)
            if row["state"] not in ("independently_verified", "released"):
                raise GateError("only verified fixes may be promoted to learned regressions")
            try:
                db.execute(
                    "INSERT INTO learning(fingerprint,task_id,regression_test,evidence,at)"
                    " VALUES(?,?,?,?,?)",
                    (fingerprint, task_id, regression_test, evidence, self.clock()),
                )
            except sqlite3.IntegrityError as exc:
                raise GateError("failure fingerprint already learned") from exc
            self._event(db, task_id, "learning_recorded", {
                "fingerprint": fingerprint, "regression_test": regression_test,
            })
