import { assertPricingStartup, currentDataEnvironment, pricingPolicy } from "@/server/pricing/environment";
import { mayRequestPrice, whyNotPriceable, type InstrumentIdentity } from "@/server/pricing/instrument";
import type { PriceEvidence, PricingProvider, SourceSwitch } from "@/server/pricing/provider";
import {
  canUsePriceForDecision,
  classifyQuoteFreshness,
  validateQuote,
  withCurrentFreshness,
  IDENTITY_UNVERIFIED_MESSAGE,
  PRICE_UNAVAILABLE_MESSAGE,
  type MarketQuote,
} from "@/server/pricing/quote";

/**
 * The pricing service — the only path from a provider to a price on screen.
 *
 * It exists so that four things happen to every quote, in the same order, with
 * no way around them: identity is verified, the response is validated,
 * freshness is recomputed from the clock rather than trusted, and the source is
 * recorded well enough that a reader could go and check.
 *
 * What it will not do, in any environment that calls itself production:
 * substitute a fixture, invent a value, return zero, present a stale quote as
 * current, or switch source without saying so.
 */

export interface PriceResult {
  instrumentId: string;
  quote: MarketQuote | null;
  /** Present when there is no usable quote. Shown to the user verbatim. */
  unavailableReason: string | null;
  /** True when the quote may support a Buy, a ranking or a distance figure. */
  usableForDecision: boolean;
  evidence: PriceEvidence | null;
  /** Every provider consulted, in order, with what each one did. */
  trail: { providerId: string; outcome: string; detail: string }[];
}

export interface PriceCacheEntry {
  quote: MarketQuote;
  /** When this entry stops being reusable. Independent of the quote's own age. */
  expiresAt: string;
  providerId: string;
  sourceSwitches: SourceSwitch[];
}

/**
 * The cache.
 *
 * One rule and it is the whole point: **a cached quote keeps its original
 * `quoteTimestamp`.** Refreshing `retrievedAt` on a cache hit would make an old
 * price look new, which is the exact deception the freshness model exists to
 * prevent. Only `freshness` is recomputed, and it can only get worse.
 */
export class QuoteCache {
  private readonly entries = new Map<string, PriceCacheEntry>();

  constructor(private readonly ttlSeconds = 300) {}

  get(instrumentId: string, now: Date): PriceCacheEntry | null {
    const entry = this.entries.get(instrumentId);
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) <= now.getTime()) {
      this.entries.delete(instrumentId);
      return null;
    }
    return entry;
  }

  set(instrumentId: string, quote: MarketQuote, providerId: string, now: Date, switches: SourceSwitch[] = []): void {
    this.entries.set(instrumentId, {
      // Stored verbatim. The timestamp is a fact about the market, not about
      // this cache, and nothing here is entitled to change it.
      quote,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
      providerId,
      sourceSwitches: switches,
    });
  }

  clear(): void {
    this.entries.clear();
  }
}

export interface PricingServiceOptions {
  providers: PricingProvider[];
  cache?: QuoteCache;
  now?: () => Date;
  environment?: ReturnType<typeof currentDataEnvironment>;
}

export class PricingService {
  private readonly cache: QuoteCache;
  private readonly now: () => Date;

  constructor(private readonly options: PricingServiceOptions) {
    // Refuses to construct in a production deployment configured to serve fake
    // prices. Failing here beats failing quietly on every subsequent quote.
    assertPricingStartup(options.environment);
    this.cache = options.cache ?? new QuoteCache();
    this.now = options.now ?? (() => new Date());
  }

  /** Providers in fallback order. Deterministic, so a trail is reproducible. */
  private ordered(): PricingProvider[] {
    return [...this.options.providers].sort(
      (a, b) => a.describe().priority - b.describe().priority,
    );
  }

  async getPrice(identity: InstrumentIdentity): Promise<PriceResult> {
    const now = this.now();
    const trail: PriceResult["trail"] = [];

    // Identity before price, always. A quote for an ambiguous symbol is a
    // confident number about possibly the wrong asset.
    if (!mayRequestPrice(identity)) {
      return {
        instrumentId: identity.id,
        quote: null,
        unavailableReason:
          identity.identityStatus === "verified"
            ? `${PRICE_UNAVAILABLE_MESSAGE} — ${whyNotPriceable(identity) ?? "no provider covers it"}`
            : IDENTITY_UNVERIFIED_MESSAGE,
        usableForDecision: false,
        evidence: null,
        trail,
      };
    }

    const cached = this.cache.get(identity.id, now);
    if (cached) {
      const quote = withCurrentFreshness(cached.quote, now);
      trail.push({
        providerId: cached.providerId,
        outcome: "cache_hit",
        detail: `Served from cache, struck ${quote.quoteTimestamp}, now classified ${quote.freshness}.`,
      });
      return this.present(quote, cached.providerId, cached.sourceSwitches, trail);
    }

    const switches: SourceSwitch[] = [];

    for (const provider of this.ordered()) {
      const descriptor = provider.describe();

      if (!descriptor.assetTypes.includes(identity.assetType)) {
        trail.push({
          providerId: descriptor.providerId,
          outcome: "no_coverage",
          detail: `Does not cover ${identity.assetType}.`,
        });
        continue;
      }

      const health = await provider.getHealthStatus().catch(() => null);
      if (health && (health.state === "unconfigured" || health.state === "failing")) {
        trail.push({
          providerId: descriptor.providerId,
          outcome: "unavailable",
          detail: health.reason ?? `Provider is ${health.state}.`,
        });
        continue;
      }

      let raw: unknown;
      try {
        raw = await provider.getQuote(identity);
      } catch (error) {
        trail.push({
          providerId: descriptor.providerId,
          outcome: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const validated = validateQuote(raw);
      if (!validated.ok) {
        trail.push({
          providerId: descriptor.providerId,
          outcome: "rejected",
          detail: validated.rejection.reason,
        });
        continue;
      }

      // A source change is recorded rather than performed silently, so the
      // evidence view can never attribute a price to a source that did not
      // return it. Built from the trail, so the recorded reason is the actual
      // failure rather than a generic one.
      const displaced = [...trail].reverse().find((step) => step.outcome !== "no_coverage");
      if (displaced && displaced.providerId !== descriptor.providerId) {
        switches.push({
          from: displaced.providerId,
          to: descriptor.providerId,
          reason: displaced.detail,
          at: now.toISOString(),
        });
      }

      const quote = withCurrentFreshness(validated.quote, now);
      this.cache.set(identity.id, validated.quote, descriptor.providerId, now, switches);
      trail.push({
        providerId: descriptor.providerId,
        outcome: "quoted",
        detail: `${quote.price} ${quote.currency}, struck ${quote.quoteTimestamp}, ${quote.freshness}.`,
      });
      return this.present(quote, descriptor.providerId, switches, trail);
    }

    return {
      instrumentId: identity.id,
      quote: null,
      // Never a fixture, never zero, never a last-known value dressed as current.
      unavailableReason: PRICE_UNAVAILABLE_MESSAGE,
      usableForDecision: false,
      evidence: null,
      trail,
    };
  }

  private present(
    quote: MarketQuote,
    providerId: string,
    switches: SourceSwitch[],
    trail: PriceResult["trail"],
  ): PriceResult {
    const descriptor = this.options.providers.find(
      (p) => p.describe().providerId === providerId,
    )?.describe();

    return {
      instrumentId: quote.instrumentId,
      quote,
      unavailableReason: null,
      usableForDecision: canUsePriceForDecision(quote),
      evidence: {
        providerName: descriptor?.providerName ?? providerId,
        sourceId: quote.sourceId,
        sourceName: quote.sourceName,
        providerInstrumentId: quote.providerInstrumentId ?? null,
        venue: quote.venue ?? null,
        quoteType: quote.freshness,
        nativeCurrency: quote.currency,
        quoteTimestamp: quote.quoteTimestamp,
        retrievedAt: quote.retrievedAt,
        freshness: quote.freshness,
        marketState: quote.marketState,
        rawUnit: quote.unit ?? null,
        fxConversion: null,
        unitConversion: null,
        sourceSwitches: switches,
        attribution: descriptor?.attribution ?? "Attribution not stated by the provider.",
      },
      trail,
    };
  }

  /** What this deployment can honestly claim about pricing. */
  describeCapability(): {
    environment: string;
    policy: ReturnType<typeof pricingPolicy>;
    providers: { providerId: string; requiresCredentials: boolean; requiresPaidSubscription: boolean }[];
    livePricingActive: boolean;
    detail: string;
  } {
    const environment = this.options.environment ?? currentDataEnvironment();
    const providers = this.options.providers.map((p) => {
      const d = p.describe();
      return {
        providerId: d.providerId,
        requiresCredentials: d.requiresCredentials,
        requiresPaidSubscription: d.requiresPaidSubscription,
      };
    });

    const livePricingActive = providers.length > 0;
    return {
      environment,
      policy: pricingPolicy(environment),
      providers,
      livePricingActive,
      detail: livePricingActive
        ? `${providers.length} pricing provider(s) registered.`
        : "Production pricing architecture is implemented, but live pricing remains inactive until approved provider credentials are configured.",
    };
  }
}

/** Re-exported so callers gate on the same function the service does. */
export { canUsePriceForDecision, classifyQuoteFreshness };
