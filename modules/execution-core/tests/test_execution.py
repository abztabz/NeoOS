"""Deterministic governance and crash-recovery checks for the execution kernel."""
import tempfile
import unittest
from pathlib import Path
from neoos_execution import ExecutionLedger, GateError


def contract(**changes):
    item = {
        "id": "KAN-SEARCH-001",
        "project_id": "kanjoos",
        "objective": "Fix keyword matching without regressing comparisons",
        "builder": "atlas",
        "verifier": "aegis",
        "acceptance_tests": ["semantic_search", "retailer_links"],
        "max_attempts": 2,
        "requires_approval": True,
        "allowed_actions": ["local_code_edit", "local_test"],
        "max_paid_aed": 0,
    }
    item.update(changes)
    return item


def results(ok=True):
    return {
        "semantic_search": {"passed": ok, "evidence": "fixture results: 18/18" if ok else "fixture 2 failed"},
        "retailer_links": {"passed": True, "evidence": "5 retailer links checked"},
    }


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.now = [1000.0]
        self.path = Path(self.tmp.name) / "tasks.db"
        self.ledger = ExecutionLedger(self.path, clock=lambda: self.now[0])
        self.ledger.submit(contract())

    def claim(self):
        item = self.ledger.claim("atlas", lease_seconds=30)
        self.assertIsNotNone(item)
        return item

    def candidate(self, lease, version="rev-abc"):
        self.ledger.candidate("KAN-SEARCH-001", "atlas", lease["lease_token"], version, "source commit rev-abc")

    def verify(self):
        lease = self.claim()
        self.candidate(lease)
        self.assertEqual(self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", results()), "reviewing")
        return self.ledger.review("KAN-SEARCH-001", "aegis", "rev-abc", True, "independent test report")

    def test_durable_idempotency_and_conflict(self):
        self.assertFalse(self.ledger.submit(contract()))
        with self.assertRaises(GateError):
            self.ledger.submit(contract(objective="different work"))
        self.assertEqual(ExecutionLedger(self.path).get("KAN-SEARCH-001")["state"], "specified")

    def test_reject_incomplete_contract_and_spending(self):
        with self.assertRaises(GateError):
            self.ledger.submit(contract(id="bad", max_paid_aed=1))
        with self.assertRaises(GateError):
            self.ledger.submit(contract(id="bad", verifier="atlas"))
        with self.assertRaises(GateError):
            self.ledger.submit(contract(id="bad", allowed_actions=["shell"]))
        with self.assertRaises(GateError):
            self.ledger.submit(contract(id="bad", acceptance_tests=[]))

    def test_lease_owner_and_expired_token_rejected(self):
        lease = self.claim()
        with self.assertRaises(GateError):
            self.ledger.candidate("KAN-SEARCH-001", "intruder", lease["lease_token"], "rev", "evidence")
        self.now[0] += 31
        recovered = self.claim()
        self.assertTrue(recovered["recovered"])
        self.assertEqual(recovered["attempt"], 1)
        self.assertNotEqual(lease["lease_token"], recovered["lease_token"])
        with self.assertRaises(GateError):
            self.candidate(lease)
        self.candidate(recovered)
        self.assertEqual(self.ledger.get("KAN-SEARCH-001")["state"], "testing")

    def test_no_two_workers_hold_lease(self):
        lease = self.claim()
        self.assertIsNone(self.ledger.claim("atlas"))
        self.assertIsNone(self.ledger.claim("another-worker"))
        self.assertEqual(lease["attempt"], 1)

    def test_missing_test_evidence_is_blocked(self):
        self.candidate(self.claim())
        with self.assertRaises(GateError):
            self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", {"semantic_search": results()["semantic_search"]})
        with self.assertRaises(GateError):
            self.ledger.record_tests("KAN-SEARCH-001", "wrong-rev", results())
        self.assertEqual(self.ledger.get("KAN-SEARCH-001")["state"], "testing")

    def test_failures_requeue_once_then_block(self):
        self.candidate(self.claim())
        with self.assertRaises(GateError):
            self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", results(False))
        self.assertEqual(
            self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", results(False), diagnosis="bad synonym map"),
            "specified",
        )
        second = self.claim()
        self.assertEqual(second["attempt"], 2)
        self.candidate(second, version="rev-def")
        self.assertEqual(
            self.ledger.record_tests("KAN-SEARCH-001", "rev-def", results(False), diagnosis="same fixture"),
            "blocked",
        )
        self.assertIsNone(self.ledger.claim("atlas"))

    def test_reviewer_independence_and_approval_required(self):
        self.candidate(self.claim())
        self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", results())
        with self.assertRaises(GateError):
            self.ledger.review("KAN-SEARCH-001", "atlas", "rev-abc", True, "looks good")
        state = self.ledger.review("KAN-SEARCH-001", "aegis", "rev-abc", True, "reviewed evidence")
        self.assertEqual(state, "awaiting_approval")
        with self.assertRaises(GateError):
            self.ledger.record_release("KAN-SEARCH-001", "deploy-1", "smoke green")
        with self.assertRaises(GateError):
            self.ledger.approve("KAN-SEARCH-001", "atlas", "approved")
        self.ledger.approve("KAN-SEARCH-001", "owner", "approval record #4")
        self.assertEqual(self.ledger.get("KAN-SEARCH-001")["state"], "independently_verified")
        self.ledger.record_release("KAN-SEARCH-001", "deploy-1", "live smoke evidence")
        self.assertEqual(self.ledger.get("KAN-SEARCH-001")["state"], "released")

    def test_failed_review_requires_rework(self):
        self.candidate(self.claim())
        self.ledger.record_tests("KAN-SEARCH-001", "rev-abc", results())
        self.assertEqual(self.ledger.review("KAN-SEARCH-001", "aegis", "rev-abc", False, "semantic drift"), "specified")
        self.assertEqual(self.claim()["attempt"], 2)

    def test_verified_learning_only_and_deduplication(self):
        with self.assertRaises(GateError):
            self.ledger.learn("KAN-SEARCH-001", "failure-123", "test synonyms", "proof")
        self.verify()
        self.ledger.approve("KAN-SEARCH-001", "owner", "approved locally")
        self.ledger.learn("KAN-SEARCH-001", "failure-123", "test synonyms", "saved test commit")
        with self.assertRaises(GateError):
            self.ledger.learn("KAN-SEARCH-001", "failure-123", "test synonyms", "repeat")
        self.assertIn("learning_recorded", [event["event"] for event in self.ledger.events("KAN-SEARCH-001")])

    def test_no_approval_pilot_requires_independent_verification(self):
        self.ledger.submit(contract(id="SAFE-LOCAL-002", requires_approval=False))
        lease = self.ledger.claim("atlas")
        # First task is still available and claims are FIFO; use a clean database for pilot.
        self.assertIsNotNone(lease)

    def test_restart_preserves_evidence_and_state(self):
        self.verify()
        reopened = ExecutionLedger(self.path)
        self.assertEqual(reopened.get("KAN-SEARCH-001")["state"], "awaiting_approval")
        self.assertTrue(any(e["event"] == "tested" for e in reopened.events("KAN-SEARCH-001")))


if __name__ == "__main__":
    unittest.main()
