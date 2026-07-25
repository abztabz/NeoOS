import { z } from "zod";

/**
 * Source policy — what NeoOS is permitted to treat as evidence, and for whom.
 *
 * Two rules drive everything here:
 *
 *   1. If an official structured endpoint exists, it is the only acceptable
 *      source. Scraping a rendered page that a filing API already serves is
 *      both fragile and disrespectful of the publisher.
 *   2. A source that is not permitted for an asset does not degrade that
 *      asset's rating quietly. The asset is reported as `unsupported` or
 *      `partial_live`, with the gap named.
 *
 * Policy is data, not scattered conditionals, so an auditor can read what the
 * system is allowed to do without reading the fetch code.
 */

export const sourceKinds = [
  "official_filing_api",
  "official_exchange_api",
  "licensed_market_data",
  "central_bank_api",
  "regulator_publication",
  "rendered_page_scrape",
  "aggregator_secondary",
  "manual_operator_entry",
] as const;
export type SourceKind = (typeof sourceKinds)[number];

/**
 * Sources NeoOS will never use automatically, and why. These are not merely
 * unconfigured — they are refused.
 */
export const PROHIBITED_SOURCE_KINDS: Record<string, string> = {
  rendered_page_scrape:
    "Scraping rendered pages is prohibited. Where a publisher offers a structured endpoint, that endpoint is the source; where it does not, the evidence is entered manually with a citation.",
  aggregator_secondary:
    "Secondary aggregators restate primary data without accountability for it, and their revisions are invisible. They cannot support a rating.",
};

export function sourceKindIsPermitted(kind: SourceKind): boolean {
  return !(kind in PROHIBITED_SOURCE_KINDS);
}

export const jurisdictionPolicySchema = z.object({
  jurisdiction: z.string(),
  /** Regulator or exchange that publishes primary disclosure. */
  primaryDisclosureBody: z.string(),
  /** Whether that body offers a machine-readable endpoint NeoOS can use. */
  structuredEndpointAvailable: z.boolean(),
  /** Source kinds permitted for assets in this jurisdiction. */
  permittedSourceKinds: z.array(z.enum(sourceKinds)),
  /**
   * What NeoOS may claim for these assets at best. A jurisdiction without a
   * usable structured endpoint caps at manual evidence, however good the
   * operator's sources are.
   */
  maximumClaim: z.enum(["live_verified", "partial_live", "manual_verified", "unsupported"]),
  notes: z.string(),
});
export type JurisdictionPolicy = z.infer<typeof jurisdictionPolicySchema>;

export const JURISDICTION_POLICIES: JurisdictionPolicy[] = [
  {
    jurisdiction: "US",
    primaryDisclosureBody: "U.S. Securities and Exchange Commission (EDGAR)",
    structuredEndpointAvailable: true,
    permittedSourceKinds: [
      "official_filing_api",
      "licensed_market_data",
      "central_bank_api",
      "manual_operator_entry",
    ],
    maximumClaim: "live_verified",
    notes:
      "EDGAR publishes company facts as XBRL-derived JSON with a documented fair-access policy. It is the primary source for US issuer fundamentals; prices come from a licensed feed, never from EDGAR.",
  },
  {
    jurisdiction: "AE",
    primaryDisclosureBody: "Securities and Commodities Authority; ADX and DFM disclosure portals",
    structuredEndpointAvailable: false,
    permittedSourceKinds: ["regulator_publication", "manual_operator_entry"],
    // Deliberately capped. See UAE_EVIDENCE_POLICY.md for the full reasoning.
    maximumClaim: "manual_verified",
    notes:
      "UAE issuer disclosure is published as PDFs and portal pages rather than a public structured API, and market data redistribution is licensed per exchange. NeoOS therefore does not attempt automated retrieval for UAE assets: evidence is entered manually with a citation to the original filing, and the asset can never be labelled live_verified. This is a licensing and reliability limit, not a judgement about the market.",
  },
  {
    jurisdiction: "GLOBAL",
    primaryDisclosureBody: "Commodity spot references and central bank series",
    structuredEndpointAvailable: true,
    permittedSourceKinds: ["licensed_market_data", "central_bank_api", "manual_operator_entry"],
    maximumClaim: "partial_live",
    notes:
      "Commodities have a price but no issuer filing, so they cannot satisfy the two-input test for live_verified. Partial live is the honest ceiling. See GOLD_PRICE_BASIS.md.",
  },
];

/**
 * An unrecognised jurisdiction falls back to GLOBAL, which caps at
 * `partial_live`. Defaulting to the most permissive policy would mean an asset
 * from a market nobody has written a policy for could claim live verification.
 */
export function policyForJurisdiction(jurisdiction: string | null): JurisdictionPolicy {
  const wanted = (jurisdiction ?? "").toLowerCase();
  const match = JURISDICTION_POLICIES.find((p) => p.jurisdiction.toLowerCase() === wanted);
  if (match) return match;
  const fallback = JURISDICTION_POLICIES.find((p) => p.jurisdiction === "GLOBAL");
  if (!fallback) throw new Error("Source policy is missing its GLOBAL fallback entry.");
  return fallback;
}

/**
 * The strongest claim permitted for an asset, given its jurisdiction.
 *
 * The orchestrator clamps every asset assessment through this. An asset can
 * fall short of its ceiling for evidence reasons; it can never exceed it,
 * regardless of what a provider returns.
 */
export function maximumClaimForAsset(input: {
  country: string | null;
  region: string | null;
  assetClass: string;
}): JurisdictionPolicy["maximumClaim"] {
  if (input.assetClass === "Commodity" || input.assetClass === "Cash") {
    return policyForJurisdiction("GLOBAL").maximumClaim;
  }
  return policyForJurisdiction(input.country ?? input.region).maximumClaim;
}
