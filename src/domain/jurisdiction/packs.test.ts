import { describe, expect, it } from "vitest";
import { emptyProfile, type IntakeProfile } from "@/domain/intake/types";
import {
  activatedJurisdictions,
  COUNTRY_MUST_NOT_OVERRIDE,
  COUNTRY_RELEVANCE_CHANNELS,
  requiredSourceClasses,
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
  it("names the channels country context may reach, and they exclude worth", () => {
    // Country context is to allocation what knowledge is to valuation: it may
    // shape what is permitted and what is risky, never what something is worth.
    expect(COUNTRY_RELEVANCE_CHANNELS).toContain("capital controls");
    expect(COUNTRY_RELEVANCE_CHANNELS).toContain("inheritance");
    for (const forbidden of COUNTRY_MUST_NOT_OVERRIDE) {
      expect(COUNTRY_RELEVANCE_CHANNELS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("keeps valuation and margin of safety out of country reach", () => {
    expect(COUNTRY_MUST_NOT_OVERRIDE).toContain("valuation");
    expect(COUNTRY_MUST_NOT_OVERRIDE).toContain("margin of safety");
    expect(COUNTRY_MUST_NOT_OVERRIDE).toContain("evidence quality");
  });
});
