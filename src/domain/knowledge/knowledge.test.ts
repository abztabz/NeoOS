import { describe, expect, it } from "vitest";
import {
  applicabilityAssumptions,
  assumptionsRequiringArgument,
  transferabilityCaveat,
  type SourceApplicability,
} from "@/domain/knowledge/applicability";
import {
  CARRIES_MATERIAL_GUIDANCE,
  epistemicStatuses,
  inferFrom,
  requiredQualifier,
  weakestStatus,
  type EpistemicStatement,
} from "@/domain/knowledge/epistemic-status";
import {
  canAdvance,
  isClaimPermitted,
  mayActivateClaims,
  mayHoldRecords,
} from "@/domain/knowledge/approval";
import {
  counterpartsFor,
  isPublishable,
  relationshipKinds,
  REQUIRES_BOTH_SHOWN,
  type SourceRelationship,
} from "@/domain/knowledge/relationships";

const subjectSaid: EpistemicStatement = {
  statement: "I cannot legally send much money outside Nepal.",
  status: "subject_stated_fact",
  restsOn: [],
  evidenceRequired: ["Current Nepal Rastra Bank foreign-exchange rules"],
  reviewBy: "2027-07-26",
  planningImplication: null,
};

const verified: EpistemicStatement = {
  statement: "AED is pegged to USD at a rate published by the central bank.",
  status: "verified_external_fact",
  restsOn: ["CBUAE publication"],
  evidenceRequired: [],
  reviewBy: null,
  planningImplication: null,
};

describe("epistemic status", () => {
  it("downgrades an inference from a subject statement to provisional", () => {
    // The failure this prevents: a correct inference from an unverified premise,
    // written down without its status, reads as a fact about the law.
    const inference = inferFrom([subjectSaid], "Capital in Nepal may be hard to deploy elsewhere.", {
      evidenceRequired: ["Nepal Rastra Bank outward remittance limits"],
      reviewBy: "2027-07-26",
      planningImplication: "Plan as if the Nepal pool were separate, pending verification.",
    });
    expect(inference.status).toBe("provisional_inference");
    expect(inference.restsOn).toContain(subjectSaid.statement);
  });

  it("lets an inference from verified facts be a calculated consequence", () => {
    const inference = inferFrom([verified], "Dollar policy reaches dirham holdings.", {
      evidenceRequired: [],
      reviewBy: null,
      planningImplication: "Treat USD conditions as material to AED assets.",
    });
    expect(inference.status).toBe("calculated_consequence");
  });

  it("is never stronger than its weakest premise", () => {
    const mixed = inferFrom([verified, subjectSaid], "Something combined.", {
      evidenceRequired: [],
      reviewBy: null,
      planningImplication: "x",
    });
    expect(mixed.status).toBe("provisional_inference");
    expect(weakestStatus(["verified_external_fact", "subject_stated_fact"])).toBe("subject_stated_fact");
  });

  it("refuses to let a provisional inference carry material guidance", () => {
    expect(CARRIES_MATERIAL_GUIDANCE.provisional_inference).toBe(false);
    for (const status of epistemicStatuses) {
      if (status !== "provisional_inference") {
        expect(CARRIES_MATERIAL_GUIDANCE[status]).toBe(true);
      }
    }
  });

  it("attaches a qualifier to everything that is not verified or calculated", () => {
    expect(requiredQualifier(subjectSaid)).toMatch(/not independently verified/i);
    expect(requiredQualifier(verified)).toBeNull();

    const provisional = inferFrom([subjectSaid], "x", {
      evidenceRequired: [],
      reviewBy: null,
      planningImplication: "y",
    });
    expect(requiredQualifier(provisional)).toMatch(/Provisional/i);
    expect(requiredQualifier(provisional)).toMatch(/not confirmed against an official source/i);
  });

  it("carries the evidence that would settle it, not just the doubt", () => {
    // A provisional inference with no route to confirmation becomes
    // indistinguishable from a fact after a few weeks.
    const inference = inferFrom([subjectSaid], "x", {
      evidenceRequired: ["Nepal Rastra Bank rules"],
      reviewBy: "2027-01-01",
      planningImplication: "y",
    });
    expect(inference.evidenceRequired).toContain("Nepal Rastra Bank rules");
    expect(inference.evidenceRequired).toContain("Current Nepal Rastra Bank foreign-exchange rules");
    expect(inference.reviewBy).toBe("2027-01-01");
  });

  it("states a domain rule as of a date, subject to verification", () => {
    const rule: EpistemicStatement = {
      statement: "Outward remittance requires approval above a threshold.",
      status: "governing_domain_rule",
      restsOn: ["a regulation"],
      evidenceRequired: [],
      reviewBy: "2026-12-31",
      planningImplication: null,
    };
    expect(requiredQualifier(rule)).toMatch(/As of 2026-12-31, subject to verification/);
  });
});

describe("source relationships", () => {
  it("supports more than binary disagreement", () => {
    // Flattening every difference into two sides produces debates that do not
    // exist and hides the ones that do.
    expect(relationshipKinds).toContain("partial_agreement");
    expect(relationshipKinds).toContain("different_scope");
    expect(relationshipKinds).toContain("methodological_tension");
    expect(relationshipKinds).toContain("unresolved_controversy");
  });

  it("only obliges both sides where they genuinely meet", () => {
    // Different scope means they do not meet, so presenting them as opposed
    // would invent a conflict.
    expect(REQUIRES_BOTH_SHOWN.different_scope).toBe(false);
    expect(REQUIRES_BOTH_SHOWN.partial_agreement).toBe(false);
    expect(REQUIRES_BOTH_SHOWN.direct_contradiction).toBe(true);
    expect(REQUIRES_BOTH_SHOWN.methodological_tension).toBe(true);
    expect(REQUIRES_BOTH_SHOWN.unresolved_controversy).toBe(true);
  });

  it("refuses to publish a relationship asserted without a citation", () => {
    // A claim about what two authors think is still a claim, and recall is not
    // a source for it.
    const uncited: SourceRelationship = {
      sourceA: "K3.1",
      sourceB: "K4.1",
      topic: "Whether selection beats the market after costs",
      kind: "methodological_tension",
      scope: "Listed equities, long horizon",
      citations: [],
      unresolvedAmbiguity: null,
    };
    expect(isPublishable(uncited)).toBe(false);
    expect(isPublishable({ ...uncited, citations: ["a verified page reference"] })).toBe(true);
  });

  it("finds the counterparts a briefing must also show", () => {
    const relationships: SourceRelationship[] = [
      {
        sourceA: "K3.1",
        sourceB: "K4.1",
        topic: "Persistent active advantage after costs",
        kind: "methodological_tension",
        scope: "Listed equities",
        citations: ["verified"],
        unresolvedAmbiguity: null,
      },
      {
        sourceA: "K3.1",
        sourceB: "K3.2",
        topic: "Cycle awareness",
        kind: "partial_agreement",
        scope: "Emphasis, not substance",
        citations: ["verified"],
        unresolvedAmbiguity: null,
      },
    ];
    const counterparts = counterpartsFor(relationships, "K3.1");
    expect(counterparts).toHaveLength(1);
    expect(counterparts[0]?.sourceB).toBe("K4.1");
  });
});

describe("applicability limits", () => {
  const developedMarketStudy: SourceApplicability = {
    sourceId: "K1.1",
    assumes: ["developed_markets", "liquid_markets", "reliable_accounting"],
    geographicScope: "16 advanced economies",
    assetClassScope: "Equities, bonds, bills, housing",
    statedLimits: "Sample excludes frontier and most emerging markets.",
  };

  it("names every assumption a source makes about the world", () => {
    expect(applicabilityAssumptions).toContain("unrestricted_capital_mobility");
    expect(applicabilityAssumptions).toContain("strong_property_rights");
    expect(applicabilityAssumptions).toContain("stable_legal_enforcement");
    expect(applicabilityAssumptions).toHaveLength(10);
  });

  it("says what would have to be argued before a finding travels", () => {
    // Applying a developed-market finding to a frontier economy is not wrong.
    // Doing it silently is.
    const gaps = assumptionsRequiringArgument(developedMarketStudy, {
      assumptionsHolding: ["reliable_accounting"],
    });
    expect(gaps).toEqual(["developed_markets", "liquid_markets"]);
  });

  it("returns no caveat where a source travels cleanly", () => {
    expect(
      transferabilityCaveat(developedMarketStudy, {
        assumptionsHolding: ["developed_markets", "liquid_markets", "reliable_accounting"],
      }),
    ).toBeNull();
  });

  it("writes the caveat as a sentence, not a list of flags", () => {
    const caveat = transferabilityCaveat(developedMarketStudy, { assumptionsHolding: [] });
    expect(caveat).toMatch(/16 advanced economies/);
    expect(caveat).toMatch(/argued rather than assumed/);
  });
});

describe("corpus approval stages", () => {
  it("does not let approving a title list activate its claims", () => {
    // The failure this prevents: approving a shopping list reads as approving
    // every claim inside those titles.
    expect(mayActivateClaims("list_approved")).toBe(false);
    expect(mayActivateClaims("ingested")).toBe(false);
    expect(mayActivateClaims("claims_activated")).toBe(true);
  });

  it("keeps records out of the corpus until ingestion", () => {
    expect(mayHoldRecords("identity_verified")).toBe(false);
    expect(mayHoldRecords("ingested")).toBe(true);
  });

  it("refuses to skip a verification stage", () => {
    // Every intermediate stage exists because something is checked there, and
    // skipping them is how a recalled edition becomes a citation.
    const skip = canAdvance("list_approved", "ingested");
    expect(skip.allowed).toBe(false);
    expect(skip.reason).toMatch(/Every intermediate stage exists/);
    expect(canAdvance("list_approved", "identity_verified").allowed).toBe(true);
  });

  it("treats a regression as a supersede rather than a move", () => {
    expect(canAdvance("ingested", "proposed").allowed).toBe(false);
  });

  it("keeps a prohibited claim prohibited at every stage, including activated", () => {
    // Approving a title, verifying its edition and ingesting it does not
    // license a claim its own authors withdrew.
    const prohibited = [
      {
        sourceId: "K2.4",
        claim: "a debt-to-GDP threshold",
        reason: "the related paper's threshold work was found to contain a spreadsheet error",
      },
    ];
    const blocked = isClaimPermitted("K2.4", "a debt-to-GDP threshold", "claims_activated", prohibited);
    expect(blocked.permitted).toBe(false);
    expect(blocked.reason).toMatch(/does not license it/);

    const allowed = isClaimPermitted("K2.4", "the crisis chronology", "claims_activated", prohibited);
    expect(allowed.permitted).toBe(true);
  });

  it("blocks any claim from a source that is merely on the approved list", () => {
    const result = isClaimPermitted("K1.1", "long-run real returns", "list_approved", []);
    expect(result.permitted).toBe(false);
    expect(result.reason).toMatch(/separate decision from approving the list/);
  });
});
