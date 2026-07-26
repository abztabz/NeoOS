import { describe, expect, it } from "vitest";
import {
  isMoneyIllusion,
  readNominalWithoutIndex,
  realChange,
  realSignal,
} from "@/domain/purchasing-power/real-terms";
import { assessObservation, isPublicationOverdue, latestObservation } from "@/domain/statistics/freshness";
import { deflatorFor, findSeries } from "@/domain/statistics/registry";
import {
  statisticalObservationSchema,
  STATISTICS_SCHEMA_VERSION,
  type StatisticalObservation,
} from "@/domain/statistics/types";

const NOW = new Date("2026-07-26T00:00:00.000Z");

function observation(over: Partial<StatisticalObservation> = {}): StatisticalObservation {
  return statisticalObservationSchema.parse({
    schemaVersion: STATISTICS_SCHEMA_VERSION,
    observationId: over.observationId ?? "ae-cpi-2026-06-v0",
    seriesId: "ae.cpi.all-items",
    evidenceKind: "domestic_price_level",
    jurisdiction: "AE",
    referencePeriodStart: "2026-06-01",
    referencePeriodEnd: "2026-06-30",
    publishedAt: "2026-07-15",
    retrievedAt: "2026-07-20T00:00:00.000Z",
    vintage: 0,
    supersedes: null,
    value: 112,
    unit: "index_level",
    seasonalAdjustment: "unadjusted",
    sourceRef: "https://example.invalid/uae-cpi-2026-06",
    sourceName: "UAE Federal Competitiveness and Statistics Centre",
    sourceClass: "A2",
    notes: null,
    ...over,
  });
}

/** A price series a year apart: index 100 → 112, so prices up 12%. */
function aedIndexPair(): StatisticalObservation[] {
  return [
    observation({
      observationId: "ae-cpi-2025-06-v0",
      referencePeriodStart: "2025-06-01",
      referencePeriodEnd: "2025-06-30",
      publishedAt: "2025-07-15",
      retrievedAt: "2025-07-20T00:00:00.000Z",
      value: 100,
    }),
    observation({ value: 112 }),
  ];
}

describe("the correction, without an index", () => {
  it("lets a nominal fall support a real-erosion warning", () => {
    // Sound on the evidence available: unless prices fell, a nominal fall is a
    // real fall of at least the same size.
    const reading = readNominalWithoutIndex("fell");
    expect(reading.claimable).toBe(true);
    expect(reading.signal).toBe("threat");
    expect(reading.statement).toMatch(/at least as much/i);
  });

  it("keeps a nominal rise neutral and says why", () => {
    const reading = readNominalWithoutIndex("rose");
    expect(reading.claimable).toBe(false);
    expect(reading.signal).toBe("neutral");
    expect(reading.statement).toMatch(/will not guess/i);
  });

  it("does not claim a flat figure held its purchasing power", () => {
    expect(readNominalWithoutIndex("flat").claimable).toBe(false);
  });
});

describe("deflation refuses what it cannot know", () => {
  it("will not use another jurisdiction's index, whatever the currency arrangement", () => {
    // The specific error: the dirham is pegged to the dollar, so it imports US
    // monetary policy. It does not import US prices.
    const usObservations = aedIndexPair().map((o) => ({
      ...o,
      seriesId: "us.cpi.all-items",
      jurisdiction: "US",
    }));
    const result = realChange({
      nominalFrom: 1_000_000,
      nominalTo: 1_120_000,
      jurisdiction: "AE",
      observations: usObservations,
      now: NOW,
    });
    expect(result.value).toBeNull();
    expect(result.missing.join(" ")).toMatch(/Published UAE consumer price index/i);
  });

  it("has no deflator for a jurisdiction it does not track, and says so plainly", () => {
    const result = realChange({
      nominalFrom: 100,
      nominalTo: 120,
      jurisdiction: "ZZ",
      observations: aedIndexPair(),
      now: NOW,
    });
    expect(result.value).toBeNull();
    expect(result.missing.join(" ")).toMatch(/will not substitute another jurisdiction/i);
  });

  it("refuses to deflate from a single index level", () => {
    const result = realChange({
      nominalFrom: 100,
      nominalTo: 120,
      jurisdiction: "AE",
      observations: [observation()],
      now: NOW,
    });
    expect(result.value).toBeNull();
    expect(result.missing.join(" ")).toMatch(/a change needs two/i);
  });

  it("refuses to compare adjusted with unadjusted figures", () => {
    // A mistake that looks exactly like a signal.
    const [earlier, later] = aedIndexPair();
    const result = realChange({
      nominalFrom: 100,
      nominalTo: 120,
      jurisdiction: "AE",
      observations: [{ ...earlier!, seasonalAdjustment: "adjusted" }, later!],
      now: NOW,
    });
    expect(result.value).toBeNull();
    expect(result.missing.join(" ")).toMatch(/manufacture a movement/i);
  });

  it("will not let a policy rate deflate anything", () => {
    // Related evidence about the same economy, measuring a different thing.
    const rates = aedIndexPair().map((o) => ({
      ...o,
      evidenceKind: "domestic_policy_rate" as const,
    }));
    const result = realChange({
      nominalFrom: 100,
      nominalTo: 120,
      jurisdiction: "AE",
      observations: rates,
      now: NOW,
    });
    expect(result.value).toBeNull();
  });
});

describe("deflation when it can be done", () => {
  const result = realChange({
    nominalFrom: 1_000_000,
    nominalTo: 1_120_000,
    jurisdiction: "AE",
    observations: aedIndexPair(),
    now: NOW,
  });

  it("deflates rather than subtracting", () => {
    // (1.12 / 1.12) − 1 = 0, not 12% − 12% by coincidence of arithmetic. The
    // difference matters at high rates, and a generational horizon sees them.
    expect(result.value?.nominalChange).toBeCloseTo(0.12, 6);
    expect(result.value?.priceChange).toBeCloseTo(0.12, 6);
    expect(result.value?.realChange).toBeCloseTo(0, 6);
  });

  it("is a calculation, and cites both observations", () => {
    expect(result.provenance).toBe("calculated");
    expect(result.value?.citations).toHaveLength(2);
  });

  it("names the case that is invisible in every nominal report", () => {
    // Up 4% with prices up 12% is erosion, and it is how a large cash position
    // loses a generation's purchasing power while looking safe.
    const eroding = realChange({
      nominalFrom: 1_000_000,
      nominalTo: 1_040_000,
      jurisdiction: "AE",
      observations: aedIndexPair(),
      now: NOW,
    });
    expect(eroding.value?.realChange).toBeLessThan(0);
    expect(isMoneyIllusion(eroding.value!)).toBe(true);
    expect(realSignal(eroding.value!)).toBe("threat");
  });

  it("keeps the threat threshold below the opportunity threshold", () => {
    const gain = { ...result.value!, realChange: 0.03 };
    const loss = { ...result.value!, realChange: -0.03 };
    expect(realSignal(gain)).toBe("neutral");
    expect(realSignal(loss)).toBe("threat");
  });

  it("drops to an assumption when the index is stale, and says so on the figure", () => {
    const stale = aedIndexPair().map((o) => ({
      ...o,
      referencePeriodStart: "2024-01-01",
      referencePeriodEnd: "2024-01-31",
      publishedAt: "2024-02-15",
    }));
    // Both now share a period end, so give the later one a distinct, still-old one.
    stale[1] = { ...stale[1]!, referencePeriodEnd: "2024-06-30", referencePeriodStart: "2024-06-01" };
    const result = realChange({
      nominalFrom: 100,
      nominalTo: 120,
      jurisdiction: "AE",
      observations: stale,
      now: NOW,
    });
    // Computed, not withheld: a stale index is still the best available
    // measure of purchasing power, and discarding it would leave a nominal
    // figure standing unchallenged, which is worse. But "real return using an
    // index eighteen months old" is a different claim from "real return", so
    // the difference sits on the figure rather than in a footnote.
    expect(result.value).not.toBeNull();
    expect(result.value?.indexState).toBe("stale");
    expect(result.provenance).toBe("model_assumption");
    expect(result.basis).toMatch(/stale/i);
  });
});

describe("freshness states", () => {
  it("treats a recent monthly figure as current", () => {
    expect(assessObservation(observation(), { now: NOW }).state).toBe("current");
  });

  it("goes stale past the series horizon rather than a global one", () => {
    // UAE CPI is stale after 120 days; a filing horizon of 120 days would be
    // coincidence, not policy. The series carries its own cadence.
    const old = observation({ referencePeriodEnd: "2025-06-30", referencePeriodStart: "2025-06-01" });
    const assessed = assessObservation(old, { now: NOW });
    expect(assessed.state).toBe("stale");
    expect(assessed.confidenceMultiplier).toBe(0.75);
  });

  it("marks a revised vintage superseded and stops using it", () => {
    const assessed = assessObservation(observation(), { now: NOW, supersededBy: "ae-cpi-2026-06-v1" });
    expect(assessed.state).toBe("superseded");
    expect(assessed.confidenceMultiplier).toBe(0);
    expect(assessed.reason).toMatch(/Kept for the record/i);
  });

  it("does not age a standing policy fact, but does expect re-verification", () => {
    const peg = observation({
      seriesId: "ae.currency-regime.aed-usd",
      evidenceKind: "currency_regime",
      unit: "currency_per_unit",
      value: 3.6725,
      sourceClass: "A1",
      referencePeriodStart: "1997-11-01",
      referencePeriodEnd: "1997-11-30",
      publishedAt: "1997-11-30",
      retrievedAt: "2026-07-01T00:00:00.000Z",
    });
    // Thirty years old and current, because it is a standing fact.
    expect(assessObservation(peg, { now: NOW }).state).toBe("current");
    // Unverified for over a year and it says so, because a change here is the
    // largest single event this position can face.
    const unverified = { ...peg, retrievedAt: "2024-01-01T00:00:00.000Z" };
    const assessed = assessObservation(unverified, { now: NOW });
    expect(assessed.state).toBe("stale");
    expect(assessed.reason).toMatch(/largest single event/i);
  });

  it("refuses to call an unregistered series current", () => {
    const unknownSeries = observation({ seriesId: "xx.made-up.series" });
    const assessed = assessObservation(unknownSeries, { now: NOW });
    expect(assessed.state).toBe("stale");
    expect(assessed.reason).toMatch(/not in the series registry/i);
  });
});

describe("delayed is not missing", () => {
  it("reports an overdue publication as delayed, with the last figure still standing", () => {
    const check = isPublicationOverdue("ae.cpi.all-items", "2026-01-31", NOW);
    expect(check.overdue).toBe(true);
    expect(check.reason).toMatch(/Delayed, not missing/i);
    expect(check.reason).toMatch(/last figure still stands/i);
  });

  it("is not overdue when the next release is not yet due", () => {
    expect(isPublicationOverdue("ae.cpi.all-items", "2026-06-30", NOW).overdue).toBe(false);
  });

  it("never calls a standing fact overdue", () => {
    expect(isPublicationOverdue("ae.currency-regime.aed-usd", "1997-11-30", NOW).overdue).toBe(false);
  });
});

describe("vintages", () => {
  it("returns the highest vintage for a period and never a superseded one", () => {
    const first = observation({ observationId: "v0", value: 111 });
    const revision = observation({
      observationId: "v1",
      vintage: 1,
      value: 112.4,
      supersedes: "v0",
    });
    const latest = latestObservation([first, revision], "ae.cpi.all-items");
    expect(latest?.observationId).toBe("v1");
    expect(latest?.value).toBe(112.4);
  });

  it("prefers the most recent period over a higher vintage of an older one", () => {
    const older = observation({
      observationId: "old-v3",
      vintage: 3,
      referencePeriodStart: "2026-01-01",
      referencePeriodEnd: "2026-01-31",
    });
    const newer = observation({ observationId: "new-v0" });
    expect(latestObservation([older, newer], "ae.cpi.all-items")?.observationId).toBe("new-v0");
  });
});

describe("the registry", () => {
  it("knows a deflator for each jurisdiction it tracks", () => {
    expect(deflatorFor("AE")?.seriesId).toBe("ae.cpi.all-items");
    expect(deflatorFor("NP")?.seriesId).toBe("np.cpi.all-items");
    expect(deflatorFor("US")?.seriesId).toBe("us.cpi.all-items");
    expect(deflatorFor("ZZ")).toBeNull();
  });

  it("keeps the four evidence kinds distinct rather than merging them", () => {
    // A peg, a price level, a domestic rate and an imported rate are related
    // evidence about the same economy. None substitutes for another.
    expect(findSeries("ae.currency-regime.aed-usd")?.evidenceKind).toBe("currency_regime");
    expect(findSeries("ae.cpi.all-items")?.evidenceKind).toBe("domestic_price_level");
    expect(findSeries("ae.policy-rate.base")?.evidenceKind).toBe("domestic_policy_rate");
    expect(findSeries("us.policy-rate.fed-funds")?.evidenceKind).toBe("imported_monetary_conditions");
  });

  it("gives each series its own horizon rather than one global number", () => {
    const uae = findSeries("ae.cpi.all-items")!;
    const nepal = findSeries("np.cpi.all-items")!;
    expect(nepal.publicationLagDays).toBeGreaterThan(uae.publicationLagDays);
    expect(nepal.staleAfterDays).toBeGreaterThan(uae.staleAfterDays);
  });
});
