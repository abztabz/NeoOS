"""Authenticated in-process boundary for the NeoOS execution ledger.

This is intended to be called by the trusted NeoOS host. It does NOT expose
an HTTP service, execute tools, authorize remote commands, or install itself
on a Mac. The host must authenticate transport and manage credentials securely.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Mapping

from neoos_execution import ExecutionLedger, GateError


ROLES = frozenset({"owner", "dispatcher", "builder", "tester", "verifier", "releaser"})


class AccessDenied(GateError):
    """Request rejected by the authenticated runtime boundary."""


@dataclass(frozen=True)
class Principal:
    actor_id: str
    role: str


class AuthenticatedExecutionBridge:
    """Role-gated access to a durable execution ledger.

    A *trusted host* supplies separate high-entropy bearer tokens for each
    operator/worker. This class does not issue tokens, store them in SQLite,
    or make model output into an instruction. In particular, evidence submitted
    here remains a claim until a trusted test runner has attested its origin.
    """

    def __init__(self, ledger: ExecutionLedger, credentials: Mapping[str, Principal]):
        if not isinstance(credentials, Mapping) or not credentials:
            raise ValueError("credentials must be a nonempty mapping")
        self.ledger = ledger
        self._records = []
        self._actors = {}
        for token, principal in credentials.items():
            if not isinstance(token, str) or len(token) < 32:
                raise ValueError("each credential must have >=32 characters")
            if not isinstance(principal, Principal):
                raise ValueError("credential values must be Principal objects")
            if not principal.actor_id.strip() or principal.role not in ROLES:
                raise ValueError("invalid principal")
            if principal.actor_id in self._actors:
                raise ValueError("every actor requires a unique identity")
            self._actors[principal.actor_id] = principal.role
            self._records.append((hashlib.sha256(token.encode()).digest(), principal))
        if not any(p.role == "owner" for _, p in self._records):
            raise ValueError("an owner must be configured")

    def _who(self, token: str, *roles: str) -> Principal:
        if not isinstance(token, str):
            raise AccessDenied("invalid credential")
        digest = hashlib.sha256(token.encode()).digest()
        found = None
        # Compare every configured credential; no credential contents in errors.
        for stored, principal in self._records:
            if hmac.compare_digest(stored, digest):
                found = principal
        if found is None or found.role not in roles:
            raise AccessDenied("authentication or role gate failed")
        return found

    def _contract(self, task_id):
        return self.ledger.get(task_id)["contract"]

    def submit(self, token, contract):
        self._who(token, "owner", "dispatcher")
        if not isinstance(contract, dict):
            raise GateError("contract must be an object")
        # Prevent unfulfillable tasks with unregistered builders or reviewers.
        if self._actors.get(contract.get("builder")) != "builder":
            raise GateError("registered builder identity required")
        if self._actors.get(contract.get("verifier")) != "verifier":
            raise GateError("registered independent verifier required")
        return self.ledger.submit(contract)

    def claim(self, token, lease_seconds=120):
        p = self._who(token, "builder")
        return self.ledger.claim(p.actor_id, lease_seconds=lease_seconds)

    def candidate(self, token, task_id, lease_token, version, evidence):
        p = self._who(token, "builder")
        return self.ledger.candidate(task_id, p.actor_id, lease_token, version, evidence)

    def record_tests(self, token, task_id, version, results, diagnosis=""):
        p = self._who(token, "tester")
        c = self._contract(task_id)
        if p.actor_id in (c["builder"], c["verifier"]):
            raise AccessDenied("tester must be separate from builder and verifier")
        return self.ledger.record_tests(task_id, version, results, diagnosis=diagnosis)

    def review(self, token, task_id, version, passed, evidence):
        p = self._who(token, "verifier")
        return self.ledger.review(task_id, p.actor_id, version, passed, evidence)

    def approve(self, token, task_id, evidence):
        p = self._who(token, "owner")
        return self.ledger.approve(task_id, p.actor_id, evidence)

    def release(self, token, task_id, release_ref, smoke_evidence):
        self._who(token, "releaser")
        return self.ledger.record_release(task_id, release_ref, smoke_evidence)

    def learn(self, token, task_id, fingerprint, regression_test, evidence):
        p = self._who(token, "verifier")
        if p.actor_id != self._contract(task_id)["verifier"]:
            raise AccessDenied("only assigned verifier can attest learning")
        return self.ledger.learn(task_id, fingerprint, regression_test, evidence)

    def status(self, token, task_id):
        self._who(token, "owner", "dispatcher")
        return self.ledger.get(task_id)

    def history(self, token, task_id):
        self._who(token, "owner", "dispatcher")
        return self.ledger.events(task_id)
