import { describe, expect, it } from "vitest";
import { demoReport, demoSections } from "@/data/demo-report";
import {
  cashView,
  isDemoFallback,
  marketsView,
  providedSections,
  regimeView,
  timelineView,
} from "@/domain/report-view";
import type { NeoosReport } from "@/schemas/neoos-report";

function liveReportWithout(sections: (keyof typeof demoSections)[]): NeoosReport {
  const clone = structuredClone(demoReport);
  clone.mode = "live";
  for (const key of sections) delete clone[key];
  return clone;
}

describe("report-view selectors", () => {
  it("returns report-provided sections with fromReport=true", () => {
    const view = marketsView(demoReport);
    expect(view.fromReport).toBe(true);
    expect(view.data.regions).toHaveLength(6);
  });

  it("falls back to demo content when a section is missing", () => {
    const report = liveReportWithout(["markets", "regime"]);
    const markets = marketsView(report);
    expect(markets.fromReport).toBe(false);
    expect(markets.data).toEqual(demoSections.markets);
    const regime = regimeView(report);
    expect(regime.fromReport).toBe(false);
    expect(regime.data).toBe(demoSections.regime);
  });

  it("flags demo fallback only for non-demo reports", () => {
    const live = liveReportWithout(["cash"]);
    expect(isDemoFallback(live, cashView(live))).toBe(true);
    // Provided section in a live report — no badge.
    expect(isDemoFallback(live, timelineView(live))).toBe(false);
    // Demo-mode report never badges: the whole app is labeled demo already.
    const demoMissing = structuredClone(demoReport);
    delete demoMissing.cash;
    expect(isDemoFallback(demoMissing, cashView(demoMissing))).toBe(false);
  });

  it("lists exactly the sections a report provides", () => {
    expect(providedSections(demoReport).sort()).toEqual(
      (Object.keys(demoSections) as (keyof typeof demoSections)[]).sort(),
    );
    const partial = liveReportWithout([
      "regime",
      "commentary",
      "markets",
      "portfolio",
      "gold",
      "timeline",
      "tiers",
      "deploymentPlan",
    ]);
    expect(providedSections(partial)).toEqual(["cash"]);
  });
});
