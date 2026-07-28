import { describe, expect, it } from "vitest";
import {
  DEMO_PORTFOLIO_ID,
  mayRender,
  positionsFor,
  reportForSurface,
  resolveActivePortfolio,
  USER_PORTFOLIO_ID,
} from "@/domain/portfolio/portfolio";
import { emptyProfile, type IntakeProfile } from "@/domain/intake/types";
import { demoReport } from "@/data/demo-report";

/**
 * The boundary between the worked example and somebody's money.
 *
 * The bug these hold shut: the report store defaults to a fixture report, so
 * every workspace rendered Apple and an S&P tracker under "PORTFOLIO", marked
 * only by a badge. A badge is not a boundary, and a person who has declared
 * their whole net worth should never be shown a holding they do not own.
 */

function profileWithAssets(): IntakeProfile {
  const profile = emptyProfile("subject-test", "profile-test", "2026-07-28T00:00:00.000Z");
  profile.assets = [
    {
      assetHoldingId: "asset-1",
      subjectId: "subject-test",
      kind: "real_estate",
      label: "Family House",
      value: {
        amount: 25_218_960,
        currency: "NPR",
        basis: "subject_estimate",
        asOf: "2026-07-26",
        note: null,
      },
      registryAssetId: null,
      identifier: null,
      quantity: null,
      liquidity: "months",
      jurisdiction: "NP",
      custodian: null,
      encumberedBy: null,
      restricted: false,
      notes: null,
    },
  ];
  return profile;
}

describe("which portfolio is active", () => {
  it("makes a declared position active automatically, with no prompt", () => {
    const active = resolveActivePortfolio({ profile: profileWithAssets() });
    expect(active.mode).toBe("user");
    expect(active.portfolioId).toBe(USER_PORTFOLIO_ID);
    expect(active.hasUserPortfolio).toBe(true);
  });

  it("hides the demo entirely once a real portfolio exists", () => {
    // Not a preference and not a default — there is no route back. A toggle
    // would leave a way to read fixture holdings as your own.
    const active = resolveActivePortfolio({ profile: profileWithAssets(), exploringDemo: true });
    expect(active.demoVisible).toBe(false);
    expect(active.mode).toBe("user");
  });

  it("keeps the demo hidden before anything is declared, unless explicitly opened", () => {
    const untouched = resolveActivePortfolio({ profile: null });
    expect(untouched.demoVisible).toBe(false);

    const exploring = resolveActivePortfolio({ profile: null, exploringDemo: true });
    expect(exploring.demoVisible).toBe(true);
    expect(exploring.portfolioId).toBe(DEMO_PORTFOLIO_ID);
    expect(exploring.reason).toContain("Nothing here is about your money");
  });

  it("treats a profile with no assets as no portfolio", () => {
    const empty = emptyProfile("subject-test", "profile-test", "2026-07-28T00:00:00.000Z");
    expect(resolveActivePortfolio({ profile: empty }).hasUserPortfolio).toBe(false);
  });
});

describe("the isolation rule", () => {
  const withPosition = resolveActivePortfolio({ profile: profileWithAssets() });
  const firstRun = resolveActivePortfolio({ profile: null, exploringDemo: true });

  it("forbids demo content on a user surface", () => {
    expect(mayRender(withPosition, "demo")).toBe(false);
    expect(mayRender(withPosition, "user")).toBe(true);
  });

  it("permits demo content only while explicitly exploring", () => {
    expect(mayRender(firstRun, "demo")).toBe(true);
  });

  it("withholds the fixture report from a user surface", () => {
    // The load-bearing assertion. Returning the fixture here is the bug.
    expect(reportForSurface(withPosition, demoReport, "demo")).toBeNull();
    expect(reportForSurface(firstRun, demoReport, "demo")).not.toBeNull();
  });

  it("never leaks a demo position into a user portfolio's positions", () => {
    const positions = [
      { portfolioId: USER_PORTFOLIO_ID, label: "Family House" },
      { portfolioId: DEMO_PORTFOLIO_ID, label: "Apple Inc." },
    ];
    const mine = positionsFor(positions, USER_PORTFOLIO_ID);
    expect(mine).toHaveLength(1);
    expect(mine.map((p) => p.label)).not.toContain("Apple Inc.");
  });

  it("excludes demo positions from a total computed for the user portfolio", () => {
    const positions = [
      { portfolioId: USER_PORTFOLIO_ID, value: 100 },
      { portfolioId: DEMO_PORTFOLIO_ID, value: 9_999_999 },
    ];
    const total = positionsFor(positions, USER_PORTFOLIO_ID).reduce((sum, p) => sum + p.value, 0);
    expect(total).toBe(100);
  });
});

describe("the demo fixture universe", () => {
  it("contains instruments this household does not own", () => {
    // Named explicitly. If a future change puts these on a user surface, this
    // test is the record of why that is wrong.
    const names = demoReport.assets.map((a) => a.name.toLowerCase());
    expect(names.some((n) => n.includes("apple"))).toBe(true);
    expect(demoReport.assets.length).toBeGreaterThan(0);
  });
});
