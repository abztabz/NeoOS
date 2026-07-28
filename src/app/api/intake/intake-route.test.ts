import { describe, expect, it } from "vitest";
import { emptyProfile, intakeProfileSchema, INTAKE_SCHEMA_VERSION } from "@/domain/intake/types";
import { SOLE_SUBJECT_ID } from "@/domain/intake/subject";
import { assessPersonalisation } from "@/domain/profile/personalisation";
import { computePositionTrends } from "@/domain/trends/position-history";

/**
 * The no-profile-stored path.
 *
 * This is the first request every new deployment makes, and it was broken: the
 * route built its own empty profile by hand, that duplicate omitted
 * `jurisdictionContext` when the schema gained it, and `parse()` threw. The
 * failure surfaced as a bare 500 with no body, on the one path nobody exercises
 * again once a position exists.
 *
 * These tests hold that path shut. They assert against the canonical factory the
 * route now delegates to, so a future schema addition breaks a test rather than
 * a first deployment.
 */

describe("the empty profile the intake route reports against", () => {
  const empty = emptyProfile(SOLE_SUBJECT_ID, "none", "2026-07-28T00:00:00.000Z");

  it("satisfies the current schema", () => {
    const result = intakeProfileSchema.safeParse(empty);
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues.slice(0, 5)),
    ).toBe(true);
  });

  it("carries the schema version the route reports", () => {
    expect(empty.schemaVersion).toBe(INTAKE_SCHEMA_VERSION);
  });

  it("has every top-level section the schema requires", () => {
    // Named explicitly rather than inferred: the drift that caused the outage
    // was a whole section going missing, and a shape test that derives its own
    // expectations from the object under test cannot catch that.
    for (const section of [
      "jurisdictionContext",
      "incomeSources",
      "assets",
      "liabilities",
      "commitments",
      "futureObligations",
      "household",
      "objective",
    ] as const) {
      expect(empty, `missing ${section}`).toHaveProperty(section);
    }
  });

  it("can be assessed without throwing", () => {
    // What the route actually does with it on the null-profile branch.
    const assessment = assessPersonalisation(empty);
    expect(assessment.state).toBe("unavailable");
    expect(assessment.meaning).toBeTruthy();
  });

  it("declares nothing, so nothing reads as owned", () => {
    expect(empty.assets).toHaveLength(0);
    expect(empty.liabilities).toHaveLength(0);
    expect(empty.incomeSources).toHaveLength(0);
  });

  it("computes empty trends without throwing", () => {
    expect(() => computePositionTrends([])).not.toThrow();
  });
});
