import { describe, expect, it } from "vitest";
import {
  classifyFreshness,
  FRESHNESS_PERMISSIONS,
  mayClaimRealTime,
  moveIsPlausible,
  observationClasses,
  OPERATOR_RESOLVABLE_FAILURES,
  unavailable,
  type ObservationClass,
} from "@/server/types/market-observation";

const NOW = new Date("2026-07-24T18:00:00Z");

/**
 * These tests encode the substantive claim of this change: that a long-horizon
 * decision can be made on a delayed or end-of-day observation, and that doing so
 * is a considered rule rather than a shortcut.
 */

describe("freshness by observation class and decision horizon", () => {
  it("accepts an end-of-day mark from yesterday for a daily briefing", () => {
    const result = classifyFreshness({
      observationClass: "end_of_day",
      observedAt: "2026-07-23T20:00:00Z",
      now: NOW,
      horizon: "daily",
    });
    // 22 hours old. Rejecting this would reject the exact data most valuation
    // work is built on, and would be the mistake that produced "we need a paid
    // real-time feed".
    expect(result.state).toBe("fresh");
    expect(FRESHNESS_PERMISSIONS[result.state].mayRate).toBe(true);
  });

  it("accepts an official rate several days old for a strategic decision", () => {
    const result = classifyFreshness({
      observationClass: "latest_official",
      observedAt: "2026-07-18T00:00:00Z",
      now: NOW,
      horizon: "strategic",
    });
    expect(result.state).toBe("fresh");
  });

  it("refuses an end-of-day mark for an intraday decision at any age", () => {
    const result = classifyFreshness({
      observationClass: "end_of_day",
      observedAt: "2026-07-24T17:59:00Z",
      now: NOW,
      horizon: "intraday",
    });
    // Expired rather than stale: waiting does not help, the wrong instrument is
    // being used for the job.
    expect(result.state).toBe("expired");
    expect(result.reason).toContain("at any age");
  });

  it("ages a delayed quote past its window and blocks Strong Buy before blocking the rating", () => {
    const aging = classifyFreshness({
      observationClass: "delayed",
      observedAt: "2026-07-24T09:00:00Z",
      now: NOW,
      horizon: "daily",
    });
    expect(aging.state).toBe("aging");
    expect(FRESHNESS_PERMISSIONS.aging.mayRate).toBe(true);
    expect(FRESHNESS_PERMISSIONS.aging.maySupportStrongBuy).toBe(false);
  });

  it("lets stale evidence hold or reduce but never upgrade", () => {
    // The asymmetry is the safeguard: conservative directions survive stale
    // evidence, deploying capital on it does not.
    expect(FRESHNESS_PERMISSIONS.stale.mayRate).toBe(true);
    expect(FRESHNESS_PERMISSIONS.stale.mayUpgrade).toBe(false);
    expect(FRESHNESS_PERMISSIONS.stale.maySupportStrongBuy).toBe(false);
    expect(FRESHNESS_PERMISSIONS.stale.confidenceMultiplier).toBeLessThan(1);
  });

  it("treats an undatable observation as unusable rather than current", () => {
    const result = classifyFreshness({
      observationClass: "delayed",
      observedAt: "not-a-timestamp",
      now: NOW,
      horizon: "daily",
    });
    expect(result.state).toBe("unknown");
    expect(FRESHNESS_PERMISSIONS.unknown.mayRate).toBe(false);
  });

  it("never rates from an expired observation regardless of horizon", () => {
    const result = classifyFreshness({
      observationClass: "real_time",
      observedAt: "2026-06-01T00:00:00Z",
      now: NOW,
      horizon: "strategic",
    });
    expect(result.state).toBe("expired");
    expect(FRESHNESS_PERMISSIONS.expired.mayRate).toBe(false);
  });
});

describe("latency claims", () => {
  it("permits a real-time claim for exactly one class", () => {
    const claimable = observationClasses.filter((c: ObservationClass) => mayClaimRealTime(c));
    expect(claimable).toEqual(["real_time"]);
  });
});

describe("failure classification", () => {
  it("marks a blocked environment as operator-resolvable and not about the instrument", () => {
    const failure = unavailable("gold", "environment_no_network", ["ecb-fx"]);
    expect(failure.operatorResolvable).toBe(true);
    expect(failure.message).toContain("deploying with network access rather than by buying a licence");
  });

  it("does not treat missing coverage as something the operator can configure away", () => {
    const failure = unavailable("nepse-stock", "instrument_not_covered", ["manual-evidence"]);
    expect(failure.operatorResolvable).toBe(false);
  });

  it("lists no paid-subscription failure as operator-resolvable by payment alone", () => {
    // Nothing in the resolvable set implies a purchase; every entry is fixed by
    // deploying or configuring differently.
    expect(OPERATOR_RESOLVABLE_FAILURES).toEqual([
      "environment_no_network",
      "no_provider_configured",
      "provider_unauthorized",
    ]);
  });
});

describe("plausibility guard", () => {
  it("applies to official sources exactly as to licensed ones", () => {
    expect(moveIsPlausible(10.845, 1.0812)).toBe(false);
    expect(moveIsPlausible(1.0845, 1.0812)).toBe(true);
    expect(moveIsPlausible(1.0845, null)).toBe(true);
  });
});
