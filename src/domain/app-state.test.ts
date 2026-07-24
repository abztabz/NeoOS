import { describe, expect, it } from "vitest";
import { demoReport } from "@/data/demo-report";
import {
  deriveDataState,
  formatRelativeAge,
  isReportStale,
  REPORT_STALE_AFTER_HOURS,
} from "@/domain/app-state";
import type { NeoosReport } from "@/schemas/neoos-report";

const NOW = new Date("2026-07-24T18:00:00Z");

function report(overrides: Partial<NeoosReport> = {}): NeoosReport {
  return { ...structuredClone(demoReport), mode: "live", asOf: NOW.toISOString(), ...overrides };
}

describe("deriveDataState", () => {
  it("error state wins over everything", () => {
    expect(
      deriveDataState({ report: report(), source: "imported", loadError: "corrupt", now: NOW }),
    ).toBe("error");
  });

  it("demo when the source or report says demo", () => {
    expect(
      deriveDataState({ report: demoReport, source: "demo", loadError: null, now: NOW }),
    ).toBe("demo");
  });

  it("insufficient_evidence when the posture could not be computed", () => {
    const r = report();
    r.deployment.recommendation = "Insufficient Evidence";
    expect(deriveDataState({ report: r, source: "imported", loadError: null, now: NOW })).toBe(
      "insufficient_evidence",
    );
  });

  it("stale for non-demo reports past the horizon; imported when fresh", () => {
    const oldIso = new Date(
      NOW.getTime() - (REPORT_STALE_AFTER_HOURS + 1) * 3_600_000,
    ).toISOString();
    expect(
      deriveDataState({ report: report({ asOf: oldIso }), source: "imported", loadError: null, now: NOW }),
    ).toBe("stale");
    expect(
      deriveDataState({ report: report(), source: "imported", loadError: null, now: NOW }),
    ).toBe("imported");
  });

  it("live_verified only for a live source", () => {
    expect(
      deriveDataState({ report: report(), source: "live", loadError: null, now: NOW }),
    ).toBe("live_verified");
  });
});

describe("freshness", () => {
  it("boundary: exactly the horizon is fresh; one minute past is stale", () => {
    const atHorizon = new Date(NOW.getTime() - REPORT_STALE_AFTER_HOURS * 3_600_000);
    expect(isReportStale(atHorizon.toISOString(), NOW)).toBe(false);
    const past = new Date(atHorizon.getTime() - 60_000);
    expect(isReportStale(past.toISOString(), NOW)).toBe(true);
  });

  it("invalid dates are treated as stale, never fresh", () => {
    expect(isReportStale("garbage", NOW)).toBe(true);
  });

  it("relative ages read naturally", () => {
    expect(formatRelativeAge(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
    expect(formatRelativeAge(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
    expect(formatRelativeAge(new Date(NOW.getTime() - 72 * 3_600_000).toISOString(), NOW)).toBe("3d ago");
  });
});
