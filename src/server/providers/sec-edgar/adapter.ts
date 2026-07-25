import type {
  ProviderAdapter,
  ProviderDescriptor,
  ProviderFetchRequest,
  ProviderFetchResult,
} from "@/intelligence/types/provider";
import type { RawEvidenceRecord } from "@/intelligence/types/raw-evidence";
import { EdgarClient, type EdgarClientOptions } from "@/server/providers/sec-edgar/client";
import { mapCompanyFacts, mapSubmissions, SEC_EDGAR_ADAPTER_VERSION } from "@/server/providers/sec-edgar/map";

/**
 * SEC EDGAR provider adapter.
 *
 * EDGAR is the strongest evidence NeoOS can obtain: audited figures filed by
 * the company itself with a regulator, free, public, and citable to the exact
 * document. It enters at tier 1 of the evidence hierarchy for that reason.
 *
 * What it is not is a price feed. EDGAR knows what a company earned; it has no
 * opinion on what the market will pay for that today. Fundamentals come from
 * here and prices come from a licensed feed, and the two are never conflated —
 * an asset with EDGAR fundamentals but no price is `partial_live`, not live.
 */

/**
 * Which canonical assets EDGAR can actually cover.
 *
 * An asset is listed here only when its issuer files XBRL financial statements
 * that mean something for the engine's factors. Absence is deliberate and is
 * reported as `unsupported`, never as an error or a silent zero.
 */
export interface EdgarCoverageEntry {
  assetId: string;
  cik: string;
  ticker: string | null;
  exchange: string | null;
}

export const EDGAR_COVERAGE: EdgarCoverageEntry[] = [
  { assetId: "apple", cik: "0000320193", ticker: "AAPL", exchange: "NASDAQ" },
];

/**
 * Assets EDGAR is knowingly not asked about, with the reason. Kept explicit so
 * the provider panel can explain a gap instead of leaving it blank.
 */
export const EDGAR_NON_COVERAGE: Record<string, string> = {
  "us-etf":
    "The trust files with the SEC, but an index ETF's XBRL statements describe the wrapper, not the underlying businesses. Rating it from those figures would be misleading, so fundamentals for this asset come from index-level evidence instead.",
  gold: "A commodity has no issuer and files nothing. Gold is priced, never filed.",
  bills: "Treasury bills are issued by the Treasury, not an EDGAR filer.",
  "uae-equity":
    "UAE issuers file with the Securities and Commodities Authority, not the SEC. See UAE_EVIDENCE_POLICY.md.",
  "value-etf":
    "A fund category rather than a single filer. Category-level evidence is entered manually with citations.",
};

export interface EdgarAdapterOptions extends EdgarClientOptions {
  /** Overrides coverage in tests. Defaults to EDGAR_COVERAGE. */
  coverage?: EdgarCoverageEntry[];
}

export class SecEdgarAdapter implements ProviderAdapter {
  private readonly client: EdgarClient;
  private readonly coverage: EdgarCoverageEntry[];
  private readonly configured: boolean;
  private lastSuccess: string | null = null;
  private lastFailure: string | null = null;

  constructor(private readonly options: EdgarAdapterOptions) {
    this.configured = options.userAgent.trim().length > 0;
    this.client = new EdgarClient(options);
    this.coverage = options.coverage ?? EDGAR_COVERAGE;
  }

  describe(): ProviderDescriptor {
    return {
      providerId: "sec-edgar",
      providerName: "U.S. Securities and Exchange Commission — EDGAR",
      providerType: "official_filing",
      // Tier 1: the company's own audited filing with its regulator.
      sourceTier: 1,
      capabilities: ["fundamentals", "filings", "reference_data"],
      supportedAssetClasses: ["Equity"],
      mode: this.configured ? "live" : "disabled",
      configured: this.configured,
      // EDGAR needs no credential — identification, not authentication.
      authenticated: false,
      health: this.configured ? (this.lastFailure ? "degraded" : "ok") : "unconfigured",
      lastSuccessfulRetrieval: this.lastSuccess,
      failureReason: this.configured
        ? this.lastFailure
        : "SEC_EDGAR_USER_AGENT is not set. The SEC requires a descriptive User-Agent identifying the requester, so NeoOS will not send anonymous traffic to a public agency.",
      legalNotes:
        "Public domain filings published by the U.S. Securities and Exchange Commission. Free to use and redistribute. Subject to the SEC's fair-access policy: a descriptive User-Agent is required and requests are rate-limited.",
      rateLimit: { requestsPerMinute: 480, remaining: null },
    };
  }

  async fetch(request: ProviderFetchRequest): Promise<ProviderFetchResult> {
    if (!this.configured) {
      return {
        providerId: "sec-edgar",
        mode: "disabled",
        ok: false,
        respondedAt: request.asOf,
        rawPayloadRef: "sec-edgar:unconfigured",
        records: [],
        failureReason: this.describe().failureReason,
        warnings: [],
      };
    }

    const wanted = this.coverage.filter((entry) => request.assetIds.includes(entry.assetId));
    const records: RawEvidenceRecord[] = [];
    const warnings: string[] = [];
    const payloadRefs: string[] = [];
    let anySuccess = false;
    let anyFailure = false;

    for (const assetId of request.assetIds) {
      if (!wanted.some((w) => w.assetId === assetId) && EDGAR_NON_COVERAGE[assetId]) {
        warnings.push(`${assetId}: not covered by EDGAR — ${EDGAR_NON_COVERAGE[assetId]}`);
      }
    }

    for (const entry of wanted) {
      const facts = await this.client.companyFacts(entry.cik);
      if (facts.ok) {
        anySuccess = true;
        payloadRefs.push(facts.url);
        const mapped = mapCompanyFacts(facts.data, {
          ticker: entry.ticker,
          exchange: entry.exchange,
          retrievedAt: facts.retrievedAt,
          responseLastModified: facts.lastModified,
        });
        records.push(...mapped.records);
        warnings.push(...mapped.warnings.map((w) => `${entry.assetId}: ${w}`));
      } else {
        anyFailure = true;
        warnings.push(`${entry.assetId}: company facts unavailable — ${facts.message}`);
      }

      const submissions = await this.client.submissions(entry.cik);
      if (submissions.ok) {
        anySuccess = true;
        payloadRefs.push(submissions.url);
        const mapped = mapSubmissions(submissions.data, {
          ticker: entry.ticker,
          exchange: entry.exchange,
          retrievedAt: submissions.retrievedAt,
          responseLastModified: submissions.lastModified,
        });
        records.push(...mapped.records);
        warnings.push(...mapped.warnings.map((w) => `${entry.assetId}: ${w}`));
      } else {
        anyFailure = true;
        warnings.push(`${entry.assetId}: filing history unavailable — ${submissions.message}`);
      }
    }

    const ok = anySuccess;
    if (ok) this.lastSuccess = request.asOf;
    this.lastFailure = anyFailure ? warnings[warnings.length - 1] ?? "Partial failure." : null;

    return {
      providerId: "sec-edgar",
      // The mode reflects what happened. A run that retrieved nothing is an
      // error, not a live run that happened to be empty.
      mode: ok ? "live" : "error",
      ok,
      respondedAt: new Date().toISOString(),
      rawPayloadRef: payloadRefs.join(" "),
      records,
      failureReason: ok ? null : (warnings[0] ?? "EDGAR returned no usable data."),
      warnings,
    };
  }

  static version(): string {
    return SEC_EDGAR_ADAPTER_VERSION;
  }
}
