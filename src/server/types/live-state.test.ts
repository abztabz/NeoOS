import { describe, expect, it } from "vitest";
import {
  assessAssetLiveState,
  FILING_STALE_AFTER_DAYS,
  rollUpReportState,
  type AssetLiveAssessment,
  type LiveAssessmentInput,
} from "@/server/types/live-state";
import {
  contextIsPersistable,
  contextPermitsLive,
  executionContexts,
} from "@/server/types/execution-context";
import {
  JURISDICTION_POLICIES,
  maximumClaimForAsset,
  policyForJurisdiction,
  PROHIBITED_SOURCE_KINDS,
  sourceKindIsPermitted,
} from "@/server/config/source-policy";

function input(overrides: Partial<LiveAssessmentInput> = {}): LiveAssessmentInput {
  return {
    assetId: "apple",
    hasLiveFiling: true,
    hasLivePrice: true,
    filingAgeDays: 30,
    quoteAgeMinutes: 5,
    quoteTimeliness: "delayed",
    quoteStale: false,
    marketStatus: "open",
    contributingProviders: ["sec-edgar", "market-data"],
    lastRetrievedAt: "2026-07-25T14:00:00.000Z",
    providerErrors: [],
    unresolvedConflicts: [],
    unsupported: false,
    engineInsufficient: false,
    ...overrides,
  };
}

function assessment(overrides: Partial<AssetLiveAssessment>): AssetLiveAssessment {
  return {
    assetId: "x",
    state: "live_verified",
    contributingProviders: [],
    lastRetrievedAt: null,
    filingAgeDays: null,
    quoteAgeMinutes: null,
    quoteTimeliness: null,
    marketStatus: null,
    missingInputs: [],
    blockingConflicts: [],
    reason: "",
    ...overrides,
  };
}

describe("asset live state", () => {
  it("requires both a current filing and a current price", () => {
    expect(assessAssetLiveState(input()).state).toBe("live_verified");
  });

  it("is partial when the price is missing, and names what is missing", () => {
    const result = assessAssetLiveState(input({ hasLivePrice: false }));
    expect(result.state).toBe("partial_live");
    expect(result.missingInputs).toContain("current market price");
    expect(result.reason).toMatch(/current market price/);
  });

  it("is partial when fundamentals are missing", () => {
    const result = assessAssetLiveState(input({ hasLiveFiling: false }));
    expect(result.state).toBe("partial_live");
    expect(result.missingInputs).toContain("current official filing");
  });

  it("goes stale on an old filing even with a fresh price", () => {
    const result = assessAssetLiveState(input({ filingAgeDays: FILING_STALE_AFTER_DAYS + 1 }));
    expect(result.state).toBe("stale");
    expect(result.reason).toMatch(/days old/);
  });

  it("goes stale on an old quote even with fresh fundamentals", () => {
    expect(assessAssetLiveState(input({ quoteStale: true })).state).toBe("stale");
  });

  it("reports a conflict ahead of staleness, because it is the worse problem", () => {
    const result = assessAssetLiveState(
      input({ quoteStale: true, unresolvedConflicts: ["two filings disagree on equity"] }),
    );
    expect(result.state).toBe("conflicted");
    expect(result.blockingConflicts).toHaveLength(1);
  });

  it("reports engine insufficiency ahead of a conflict", () => {
    const result = assessAssetLiveState(
      input({ engineInsufficient: true, unresolvedConflicts: ["disagreement"] }),
    );
    expect(result.state).toBe("insufficient_evidence");
  });

  it("distinguishes an unsupported asset from a failing provider", () => {
    expect(assessAssetLiveState(input({ unsupported: true })).state).toBe("unsupported");
    const failed = assessAssetLiveState(
      input({ hasLiveFiling: false, hasLivePrice: false, providerErrors: ["timeout"] }),
    );
    expect(failed.state).toBe("provider_error");
  });

  it("does not call it a provider error when something still came back", () => {
    const partial = assessAssetLiveState(
      input({ hasLivePrice: false, providerErrors: ["price feed timeout"] }),
    );
    expect(partial.state).toBe("partial_live");
  });
});

describe("report state roll-up", () => {
  const live = { anyLiveProvider: true, anyManualProvider: false, runFailed: false };

  it("requires every supported asset to be live before the report is", () => {
    expect(
      rollUpReportState([assessment({ state: "live_verified" }), assessment({ state: "live_verified" })], live),
    ).toBe("live_verified");
  });

  it("lets one partial asset make the whole report partial", () => {
    expect(
      rollUpReportState([assessment({ state: "live_verified" }), assessment({ state: "partial_live" })], live),
    ).toBe("partial_live");
  });

  it("ignores unsupported assets when deciding, rather than being dragged down by them", () => {
    expect(
      rollUpReportState([assessment({ state: "live_verified" }), assessment({ state: "unsupported" })], live),
    ).toBe("live_verified");
  });

  it("says live_stale when live evidence exists but all of it has aged out", () => {
    expect(rollUpReportState([assessment({ state: "stale" }), assessment({ state: "stale" })], live)).toBe(
      "live_stale",
    );
  });

  it("never claims live without a live provider", () => {
    expect(
      rollUpReportState([assessment({ state: "live_verified" })], {
        anyLiveProvider: false,
        anyManualProvider: true,
        runFailed: false,
      }),
    ).toBe("manual_verified");
    expect(
      rollUpReportState([assessment({ state: "live_verified" })], {
        anyLiveProvider: false,
        anyManualProvider: false,
        runFailed: false,
      }),
    ).toBe("fixture");
  });

  it("reports failure and emptiness distinctly", () => {
    expect(rollUpReportState([], { ...live, runFailed: true })).toBe("failed");
    expect(rollUpReportState([], live)).toBe("insufficient_evidence");
    expect(rollUpReportState([assessment({ state: "unsupported" })], live)).toBe("insufficient_evidence");
  });

  it("reports insufficient evidence when nothing could be rated", () => {
    expect(
      rollUpReportState(
        [assessment({ state: "insufficient_evidence" }), assessment({ state: "insufficient_evidence" })],
        live,
      ),
    ).toBe("insufficient_evidence");
  });
});

describe("execution context", () => {
  it("permits live only from a credentialed server run", () => {
    const permitted = executionContexts.filter(contextPermitsLive);
    expect(permitted).toEqual(["server_live"]);
  });

  it("persists only server runs", () => {
    expect(contextIsPersistable("server_live")).toBe(true);
    expect(contextIsPersistable("server_manual")).toBe(true);
    expect(contextIsPersistable("client_fixture")).toBe(false);
    expect(contextIsPersistable("client_manual")).toBe(false);
  });
});

describe("source policy", () => {
  it("refuses page scraping and secondary aggregators outright", () => {
    expect(sourceKindIsPermitted("rendered_page_scrape")).toBe(false);
    expect(sourceKindIsPermitted("aggregator_secondary")).toBe(false);
    expect(sourceKindIsPermitted("official_filing_api")).toBe(true);
  });

  it("gives a reason for every prohibition", () => {
    for (const [kind, reason] of Object.entries(PROHIBITED_SOURCE_KINDS)) {
      expect(reason.length, kind).toBeGreaterThan(40);
    }
  });

  it("caps UAE assets at manual evidence, never live", () => {
    const uae = policyForJurisdiction("AE");
    expect(uae.structuredEndpointAvailable).toBe(false);
    expect(uae.maximumClaim).toBe("manual_verified");
    expect(uae.permittedSourceKinds).not.toContain("rendered_page_scrape");
  });

  it("falls back to the stricter global policy for an unknown jurisdiction", () => {
    // Defaulting to the most permissive policy would let an unwritten-for
    // market claim live verification.
    expect(policyForJurisdiction("ZZ").jurisdiction).toBe("GLOBAL");
    expect(policyForJurisdiction(null).maximumClaim).toBe("partial_live");
  });

  it("caps commodities at partial regardless of where they trade", () => {
    expect(maximumClaimForAsset({ country: "US", region: "US", assetClass: "Commodity" })).toBe("partial_live");
    expect(maximumClaimForAsset({ country: "US", region: "US", assetClass: "Equity" })).toBe("live_verified");
    expect(maximumClaimForAsset({ country: "AE", region: "MENA", assetClass: "Equity" })).toBe(
      "manual_verified",
    );
  });

  it("names a primary disclosure body for every jurisdiction it covers", () => {
    for (const policy of JURISDICTION_POLICIES) {
      expect(policy.primaryDisclosureBody.length, policy.jurisdiction).toBeGreaterThan(5);
      expect(policy.notes.length, policy.jurisdiction).toBeGreaterThan(60);
    }
  });
});
