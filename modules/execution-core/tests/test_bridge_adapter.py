"""Boundary tests: principal identity cannot be forged by request parameters."""
import tempfile
import unittest
from pathlib import Path
from bridge_adapter import AuthenticatedExecutionBridge, Principal, AccessDenied
from neoos_execution import ExecutionLedger, GateError

OWNER = "o" * 40
DISPATCHER = "d" * 40
BUILDER = "b" * 40
TESTER = "t" * 40
VERIFIER = "v" * 40
RELEASER = "r" * 40

IDENTITIES = {
    OWNER: Principal("owner", "owner"),
    DISPATCHER: Principal("dispatcher", "dispatcher"),
    BUILDER: Principal("atlas", "builder"),
    TESTER: Principal("ci-runner", "tester"),
    VERIFIER: Principal("aegis", "verifier"),
    RELEASER: Principal("deployer", "releaser"),
}

def contract():
    return {
        "id": "KAN-BOUNDARY-001",
        "project_id": "kanjoos",
        "objective": "Verify safe workflow boundaries without production changes",
        "builder": "atlas",
        "verifier": "aegis",
        "acceptance_tests": ["fixture_pass"],
        "requires_approval": True,
        "allowed_actions": ["local_test"],
        "max_attempts": 2,
        "max_paid_aed": 0,
    }

def results():
    return {"fixture_pass": {"passed": True, "evidence": "deterministic CI fixture"}}

class BridgeTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.ledger = ExecutionLedger(Path(tmp.name) / "bridge.db")
        self.bridge = AuthenticatedExecutionBridge(self.ledger, IDENTITIES)

    def test_reject_untrusted_credentials_and_roles(self):
        with self.assertRaises(AccessDenied):
            self.bridge.submit("invalid", contract())
        with self.assertRaises(AccessDenied):
            self.bridge.submit(BUILDER, contract())
        with self.assertRaises(AccessDenied):
            self.bridge.claim(OWNER)
        with self.assertRaises(AccessDenied):
            self.bridge.status(TESTER, "unknown")
        with self.assertRaises(ValueError):
            AuthenticatedExecutionBridge(self.ledger, {"short": Principal("owner", "owner")})

    def test_authenticated_nonproduction_lifecycle(self):
        self.assertTrue(self.bridge.submit(OWNER, contract()))
        lease = self.bridge.claim(BUILDER)
        self.assertEqual(lease["task_id"], "KAN-BOUNDARY-001")
        with self.assertRaises(AccessDenied):
            self.bridge.candidate(TESTER, "KAN-BOUNDARY-001", lease["lease_token"], "rev", "evidence")
        self.bridge.candidate(BUILDER, "KAN-BOUNDARY-001", lease["lease_token"], "rev", "candidate ref")
        with self.assertRaises(AccessDenied):
            self.bridge.record_tests(BUILDER, "KAN-BOUNDARY-001", "rev", results())
        self.assertEqual(
            self.bridge.record_tests(TESTER, "KAN-BOUNDARY-001", "rev", results()),
            "reviewing",
        )
        with self.assertRaises(AccessDenied):
            self.bridge.review(OWNER, "KAN-BOUNDARY-001", "rev", True, "proof")
        self.assertEqual(
            self.bridge.review(VERIFIER, "KAN-BOUNDARY-001", "rev", True, "independent evidence"),
            "awaiting_approval",
        )
        with self.assertRaises(AccessDenied):
            self.bridge.approve(VERIFIER, "KAN-BOUNDARY-001", "proof")
        with self.assertRaises(GateError):
            self.bridge.release(RELEASER, "KAN-BOUNDARY-001", "ref", "smoke")
        self.bridge.approve(OWNER, "KAN-BOUNDARY-001", "owner authorization")
        self.bridge.learn(VERIFIER, "KAN-BOUNDARY-001", "fx-1", "future regression", "reviewed proof")
        self.bridge.release(RELEASER, "KAN-BOUNDARY-001", "synthetic-ref", "synthetic smoke")
        self.assertEqual(self.bridge.status(DISPATCHER, "KAN-BOUNDARY-001")["state"], "released")
        self.assertTrue(self.bridge.history(OWNER, "KAN-BOUNDARY-001"))

    def test_reject_unregistered_contract_actors(self):
        bad = contract()
        bad["builder"] = "not-configured"
        with self.assertRaises(GateError):
            self.bridge.submit(OWNER, bad)
        bad = contract()
        bad["verifier"] = "not-configured"
        with self.assertRaises(GateError):
            self.bridge.submit(OWNER, bad)

if __name__ == "__main__":
    unittest.main()
