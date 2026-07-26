import { describe, expect, it } from "vitest";
import { emptyProfile, type IntakeProfile } from "@/domain/intake/types";
import {
  activatedJurisdictions,
  COUNTRY_MUST_NOT_CREATE,
  COUNTRY_RELEVANCE_CHANNELS,
  mayAffectValuation,
  requiredSourceClasses,
  VALUATION_AFFECTING_CHANNELS,
} from "@/domain/jurisdiction/packs";

const SUBJECT = "subject-operator";

/** A cross-border household: earning in one country, from another. */
function crossBorder(over: Partial<IntakeProfile> = {}): IntakeProfile {
  const base = emptyProfile(SUBJECT, "p", "2026-07-26T00:00:00.000Z");
  return {
    ...base,
    jurisdictionContext: {
      residence: "AE",
      homeCountry: "NP",
      citizenships: ["NP"],
      taxResidences: ["AE"],
      intendsToReturnHome: null,
      constraints: [],
      notes: null,
    },
    ...over,
  };
}

describe("activation", () => {
  it("activates nothing when nothing has been declared", () => {
    // A country with no hook gets no pack, however important it is in the world.
    expect(activatedJurisdictions(emptyProfile(SUBJECT, "p", "2026-07-26T00:00:00.000Z"))).toEqual([]);
  });

  it("keeps residence, home country and citizenship apart", () => {
    const found = activatedJurisdictions(crossBorder());
    const ae = found.find((j) => j.jurisdiction === "AE");
    const np = found.find((j) => j.jurisdiction === "NP");
    expect(ae?.triggers).toEqual(["residence", "tax_residence"]);
    expect(np?.triggers).toEqual(["citizenship", "home_country"]);
  });

  it("gives the home country planning depth and not opportunity depth", () => {
    // Being from somewhere is not a reason to invest there. This is the whole
    // point of the correction.
    const np = activatedJurisdictions(crossBorder()).find((j) => j.jurisdiction === "NP");
    expect(np?.depths).toContain("planning");
    expect(np?.depths).not.toContain("opportunity");
  });

  it("gives citizenship constraint depth even with no assets there", () => {
    // Citizenship often decides what may be held abroad regardless of residence,
    // so it must activate on its own.
    const profile = crossBorder({
      jurisdictionContext: {
        residence: "AE",
        homeCountry: null,
        citizenships: ["NP"],
        taxResidences: [],
        intendsToReturnHome: null,
        constraints: [],
        notes: null,
      },
    });
    const np = activatedJurisdictions(profile).find((j) => j.jurisdiction === "NP");
    expect(np?.depths).toEqual(["constraint"]);
  });

  it("earns opportunity depth only where something is actually held", () => {
    const profile = crossBorder();
    profile.assets = [
      {
        subjectId: SUBJECT,
        assetHoldingId: "us-equities",
        kind: "listed_equity",
        label: "US equities",
        value: { amount: 500_000, currency: "USD", basis: "market_price", asOf: "2026-07-20", note: null },
        registryAssetId: null,
        identifier: null,
        quantity: null,
        liquidity: "days",
        jurisdiction: "US",
        custodian: "IBKR",
        encumberedBy: null,
        restricted: false,
        notes: null,
      },
    ];
    const found = activatedJurisdictions(profile);
    const us = found.find((j) => j.jurisdiction === "US");
    expect(us?.depths).toContain("opportunity");
    expect(us?.triggers).toContain("asset_held");
    // And the home country still does not get it.
    expect(found.find((j) => j.jurisdiction === "NP")?.depths).not.toContain("opportunity");
  });

  it("treats a private business as needing all three depths", () => {
    const profile = crossBorder();
    profile.assets = [
      {
        subjectId: SUBJECT,
        assetHoldingId: "family-business",
        kind: "private_business",
        label: "Family business",
        value: { amount: 4_000_000, currency: "NPR", basis: "subject_estimate", asOf: "2026-01-01", note: null },
        registryAssetId: null,
        identifier: null,
        quantity: null,
        liquidity: "years",
        jurisdiction: "NP",
        custodian: null,
        encumberedBy: null,
        restricted: false,
        notes: null,
      },
    ];
    const np = activatedJurisdictions(profile).find((j) => j.jurisdiction === "NP");
    expect(np?.triggers).toContain("business_owned");
    expect(np?.depths).toEqual(["constraint", "planning", "opportunity"]);
  });

  it("attributes supported family to the home country, not to where you live", () => {
    // The common cross-border case: you earn here and support people there.
    const profile = crossBorder();
    profile.household = {
      ...profile.household,
      dependents: [
        {
          dependentId: "d1",
          relationship: "parent",
          label: "Mother",
          birthYear: 1955,
          financiallySupported: true,
          supportExpectedUntilYear: null,
          supportIsIndefinite: true,
          anticipatedObligation: null,
          notes: null,
        },
      ],
    };
    const np = activatedJurisdictions(profile).find((j) => j.jurisdiction === "NP");
    expect(np?.triggers).toContain("dependent_supported");
  });

  it("explains itself in a sentence rather than a country code", () => {
    const np = activatedJurisdictions(crossBorder()).find((j) => j.jurisdiction === "NP");
    expect(np?.why).toMatch(/home country/i);
    expect(np?.why).toMatch(/not as a place to invest/i);
  });
});

describe("source classes", () => {
  it("always carries the global and USD benchmark classes", () => {
    // Global institutional data and dollar conditions bear on every
    // jurisdiction, and on a pegged one they bear on it most.
    const classes = requiredSourceClasses(["constraint"]);
    expect(classes).toContain("A5_global_institutional");
    expect(classes).toContain("A6_usd_benchmark");
  });

  it("does not load an exchange for a jurisdiction nothing is held in", () => {
    expect(requiredSourceClasses(["planning"])).not.toContain(
      "A3_securities_regulator_and_exchange",
    );
  });

  it("loads the exchange once something is held there", () => {
    expect(requiredSourceClasses(["constraint", "opportunity"])).toContain(
      "A3_securities_regulator_and_exchange",
    );
  });
});

describe("the firewall", () => {
  it("names the channels country context may reach", () => {
    expect(COUNTRY_RELEVANCE_CHANNELS).toContain("capital controls");
    expect(COUNTRY_RELEVANCE_CHANNELS).toContain("inheritance");
    expect(COUNTRY_RELEVANCE_CHANNELS).toContain("liability matching");
  });

  it("forbids preference rather than forbidding economics", () => {
    // The earlier invariant said jurisdiction may never affect worth. That was
    // an over-correction: a verified capital control genuinely reduces
    // realisable value. What must be forbidden is the automatic preference, not
    // the economics.
    expect(COUNTRY_MUST_NOT_CREATE).toContain("automatic country premium");
    expect(COUNTRY_MUST_NOT_CREATE).toContain("automatic country penalty");
    expect(COUNTRY_MUST_NOT_CREATE).toContain("override of asset-specific evidence");
    expect(COUNTRY_MUST_NOT_CREATE).toContain("preference derived from residence");
    expect(COUNTRY_MUST_NOT_CREATE).toContain("preference derived from home country");
  });

  it("lets a verified jurisdictional condition reach a valuation input", () => {
    const verified = mayAffectValuation("capital controls", "verified_external_fact");
    expect(verified.permitted).toBe(true);
    expect(verified.reason).toMatch(/realisable cash flows|discount rate/i);

    const rule = mayAffectValuation("taxation", "governing_domain_rule");
    expect(rule.permitted).toBe(true);
  });

  it("refuses to let an unverified belief about a country move a number", () => {
    // A valuation moved by an unverified belief is indistinguishable from a
    // valuation moved by a prejudice.
    for (const status of ["subject_stated_fact", "provisional_inference"] as const) {
      const result = mayAffectValuation("capital controls", status);
      expect(result.permitted).toBe(false);
      expect(result.reason).toMatch(/may not move a valuation input until it is verified/i);
    }
  });

  it("keeps planning-only channels out of valuation however well verified", () => {
    // Inheritance law changes who receives an asset, not what it is worth to
    // its holder.
    for (const channel of ["inheritance", "family obligations", "liability matching"]) {
      const result = mayAffectValuation(channel, "verified_external_fact");
      expect(result.permitted).toBe(false);
      expect(result.reason).toMatch(/not on what an asset is worth/i);
    }
  });

  it("keeps the valuation-affecting channels a strict subset of the relevance channels", () => {
    for (const channel of VALUATION_AFFECTING_CHANNELS) {
      expect(COUNTRY_RELEVANCE_CHANNELS as readonly string[]).toContain(channel);
    }
    expect(VALUATION_AFFECTING_CHANNELS.length).toBeLessThan(COUNTRY_RELEVANCE_CHANNELS.length);
  });
});
