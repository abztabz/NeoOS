/**
 * What a source assumes about the world it describes.
 *
 * The corpus was previously called "jurisdiction-independent by construction".
 * That was too strong. A source is not independent of geography merely because
 * it is not organised around one: a study of US listed equities assumes reliable
 * accounting, liquid markets, enforceable property rights and disclosure that
 * much of the world does not have.
 *
 * Better wording, and the one the documents now use: **the corpus is not
 * organised around a preferred jurisdiction, and every source retains its
 * geographic, institutional, asset-class and market-structure limits.**
 *
 * This matters directly for this subject. A household with capital in a frontier
 * economy and a developed one cannot have developed-market findings applied
 * uniformly across both, and the failure would be silent — the reasoning reads
 * identically whether or not the assumptions hold.
 */

export const applicabilityAssumptions = [
  "developed_markets",
  "liquid_markets",
  "strong_property_rights",
  "reliable_accounting",
  "unrestricted_capital_mobility",
  "specific_tax_regime",
  "specific_disclosure_regime",
  "specific_asset_class",
  "institutional_investor_access",
  "stable_legal_enforcement",
] as const;
export type ApplicabilityAssumption = (typeof applicabilityAssumptions)[number];

export const applicabilityAssumptionLabels: Record<ApplicabilityAssumption, string> = {
  developed_markets: "Assumes developed markets",
  liquid_markets: "Assumes liquid markets",
  strong_property_rights: "Assumes strong property rights",
  reliable_accounting: "Assumes reliable accounting",
  unrestricted_capital_mobility: "Assumes capital can move freely",
  specific_tax_regime: "Assumes a specific tax regime",
  specific_disclosure_regime: "Assumes a specific disclosure regime",
  specific_asset_class: "Applies to a specific asset class",
  institutional_investor_access: "Assumes institutional-investor access",
  stable_legal_enforcement: "Assumes stable legal enforcement",
};

/**
 * Assumptions that a restricted-mobility jurisdiction is likely to violate.
 *
 * Not a country judgement — a statement about which findings transfer. Where a
 * source assumes any of these and the jurisdiction in question does not supply
 * it, the finding needs explicit reasoning to travel, or it does not travel.
 */
export const MOBILITY_SENSITIVE_ASSUMPTIONS: ApplicabilityAssumption[] = [
  "unrestricted_capital_mobility",
  "liquid_markets",
  "institutional_investor_access",
];

export interface SourceApplicability {
  sourceId: string;
  assumes: ApplicabilityAssumption[];
  /** Countries, regions or markets the evidence is actually drawn from. */
  geographicScope: string;
  /** Asset classes the findings cover. */
  assetClassScope: string;
  /** Where the source's own authors say it should not be extended. */
  statedLimits: string | null;
}

/**
 * Whether a source's findings may be applied to a context without further
 * argument.
 *
 * Returns the assumptions that would have to be argued for, empty when the
 * source travels cleanly. NeoOS must not generalise past these silently.
 */
export function assumptionsRequiringArgument(
  applicability: SourceApplicability,
  context: { assumptionsHolding: ApplicabilityAssumption[] },
): ApplicabilityAssumption[] {
  return applicability.assumes.filter(
    (assumption) => !context.assumptionsHolding.includes(assumption),
  );
}

/** Plain sentence naming what would have to be argued. Null when nothing would. */
export function transferabilityCaveat(
  applicability: SourceApplicability,
  context: { assumptionsHolding: ApplicabilityAssumption[] },
): string | null {
  const gaps = assumptionsRequiringArgument(applicability, context);
  if (gaps.length === 0) return null;
  return `${applicability.sourceId} draws on ${applicability.geographicScope} and assumes ${gaps
    .map((g) => applicabilityAssumptionLabels[g].toLowerCase().replace(/^assumes /, ""))
    .join(", ")}. Applying it here needs that argued rather than assumed.`;
}
