import { z } from "zod";

/**
 * Instrument identity — knowing *what* is being priced before pricing it.
 *
 * A ticker is not an identity. `GOLD` is a symbol on several venues for
 * unrelated things. A two-letter code can be an equity in one market and a fund
 * in another. Pricing an ambiguous symbol produces a number that is precise,
 * confidently sourced, and about the wrong asset — the most expensive kind of
 * wrong, because nothing about it looks wrong.
 *
 * So identity is resolved first and separately, and an unresolved or ambiguous
 * instrument is never priced at all.
 */

export const instrumentAssetTypes = ["stock", "etf", "fund", "index", "commodity", "fx"] as const;
export type InstrumentAssetType = (typeof instrumentAssetTypes)[number];

export const identityStatuses = ["verified", "ambiguous", "unresolved"] as const;
export type IdentityStatus = (typeof identityStatuses)[number];

export const identityStatusMeaning: Record<IdentityStatus, string> = {
  verified:
    "The symbol, venue and currency together identify exactly one instrument, and the provider mapping is known.",
  ambiguous:
    "The symbol matches more than one instrument. NeoOS will not guess which, because guessing right most of the time is worse than refusing every time.",
  unresolved: "No provider mapping exists for this instrument, so nothing can price it.",
};

export const instrumentIdentitySchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  assetType: z.enum(instrumentAssetTypes),
  exchange: z.string().optional(),
  mic: z.string().optional(),
  currency: z.string().length(3),
  /** providerId → the identifier that provider knows this instrument by. */
  providerMappings: z.record(z.string(), z.string()),
  identityStatus: z.enum(identityStatuses),
});
export type InstrumentIdentity = z.infer<typeof instrumentIdentitySchema>;

/**
 * Whether this instrument may be sent to a provider.
 *
 * Verified identity *and* at least one mapping. A "verified" instrument nobody
 * can price is still unpriceable, and treating the two as the same thing is how
 * a coverage gap gets reported as a provider failure.
 */
export function mayRequestPrice(identity: InstrumentIdentity): boolean {
  return identity.identityStatus === "verified" && Object.keys(identity.providerMappings).length > 0;
}

export function whyNotPriceable(identity: InstrumentIdentity): string | null {
  if (identity.identityStatus !== "verified") return identityStatusMeaning[identity.identityStatus];
  if (Object.keys(identity.providerMappings).length === 0) {
    return "No configured provider covers this instrument.";
  }
  return null;
}

/**
 * Resolve a user-supplied instrument description into an identity.
 *
 * Deliberately unforgiving. A bare ticker with no exchange resolves to
 * `ambiguous`, because the same string genuinely does mean different assets on
 * different venues, and the subject holding "40,000 AED of stocks" has not told
 * us which market they were bought on.
 */
export function resolveIdentity(input: {
  symbol: string;
  name?: string;
  assetType?: InstrumentAssetType;
  exchange?: string;
  mic?: string;
  currency?: string;
  providerMappings?: Record<string, string>;
}): InstrumentIdentity {
  const symbol = input.symbol.trim().toUpperCase();
  const mappings = input.providerMappings ?? {};

  const hasVenue = Boolean(input.exchange || input.mic);
  const hasCurrency = Boolean(input.currency && input.currency.length === 3);
  const hasType = Boolean(input.assetType);

  const status: IdentityStatus =
    Object.keys(mappings).length === 0
      ? "unresolved"
      : hasVenue && hasCurrency && hasType
        ? "verified"
        : "ambiguous";

  return {
    id: `instrument-${symbol}${input.mic ? `-${input.mic}` : ""}`,
    symbol,
    name: input.name ?? symbol,
    assetType: input.assetType ?? "stock",
    exchange: input.exchange,
    mic: input.mic,
    currency: (input.currency ?? "USD").toUpperCase(),
    providerMappings: mappings,
    identityStatus: status,
  };
}
