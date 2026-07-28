"use client";

import { useConversation } from "@/data/conversation-store";
import { toBase } from "@/domain/profile/calculations";
import { provenanceLabels } from "@/domain/profile/provenance";
import { describeHoldingValuation } from "@/domain/valuation/holding-valuation";

import type { AssetHolding } from "@/domain/intake/types";

/**
 * What the household actually owns.
 *
 * This exists because of a gap that took a while to surface: the workspaces
 * render the *report*, and the report's holdings are the engine's — fixture
 * ones until a live cycle produces real ones. The declared position is a
 * separate object entirely, so a person could fill in every asset they own and
 * still see somebody else's portfolio on the Portfolio page.
 *
 * The two are not merged, and should not be. A declared holding is something
 * the subject stated; an analysed holding carries a rating, an intrinsic value
 * and a thesis the engine produced. Presenting a declared estimate inside the
 * analysed table would give it a credibility it has not earned. So this renders
 * above that table, labelled as what it is, and the two stay visibly distinct.
 *
 * Every figure here traces to something the subject typed. Nothing is priced,
 * because nothing has been priced.
 */

const KIND_LABELS: Record<string, string> = {
  cash: "Cash",
  fixed_income: "Fixed income",
  listed_equity: "Listed equity",
  fund: "Fund",
  private_business: "Private business",
  real_estate: "Property",
  metals: "Metals",
  crypto: "Crypto",
  collectible: "Collectible",
  other: "Other",
};

const LIQUIDITY_LABELS: Record<string, string> = {
  immediate: "Reachable immediately",
  days: "Days to reach",
  weeks: "Weeks to reach",
  months: "Months to reach",
  illiquid: "Not realistically sellable",
  unknown: "Liquidity not stated",
};

function money(amount: number | null, currency: string | null): string {
  if (amount === null) return "value not stated";
  return `${Math.round(amount).toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

export function DeclaredHoldings() {
  const { profile, calculations } = useConversation();
  if (profile === null || calculations === null) return null;
  if (profile.assets.length === 0) return null;

  const allocation = calculations.portfolioAllocation;
  const netWorth = calculations.netWorth;
  const converted = netWorth.value === null ? null : toBase(netWorth.value, profile);

  // Largest first. A list ordered by declaration order tells the reader nothing
  // about where their money actually is.
  const sorted = [...profile.assets].sort(
    (a, b) => (b.value.amount ?? 0) - (a.value.amount ?? 0),
  );

  return (
    <section
      data-testid="declared-holdings"
      aria-label="What you have declared"
      className="rounded-2xl border border-cyan/25 bg-cyan/[0.03] p-4"
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-wide text-ink">WHAT YOU OWN</h3>
        <p className="font-mono text-[9px] uppercase tracking-wider text-cyan">
          {profile.assets.length} declared
        </p>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-[#9aa7b3]">
        Your declared position, in your own figures. These are not priced and not rated — the
        analysed holdings below are the engine&apos;s worked example, not yours.
      </p>

      {converted !== null && converted.usedRates ? (
        <p data-testid="declared-total" className="mb-3 text-[15px] font-semibold text-ink">
          {Math.round(converted.total).toLocaleString("en-US")} {converted.currency}
          {converted.unrated.length > 0 ? (
            <span className="ml-1.5 text-[12px] font-normal text-amber">
              plus unrated {converted.unrated.join(", ")}
            </span>
          ) : null}
        </p>
      ) : null}

      <ul className="grid gap-2">
        {sorted.map((asset: AssetHolding) => {
          const share = allocation.value?.find((row) => row.bucket === asset.kind)?.share ?? null;
          const valuation = describeHoldingValuation(asset);
          return (
            <li
              key={asset.assetHoldingId}
              data-testid="declared-holding"
              className="rounded-xl border border-[#222d36] bg-panel2 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[13px] font-semibold text-ink">{asset.label}</p>
                <p className="font-mono text-[12px] text-[#c6d0d8]">
                  {money(asset.value.amount, asset.value.currency)}
                </p>
              </div>

              <p className="mt-1 text-[11px] leading-relaxed text-[#8f9daa]">
                {KIND_LABELS[asset.kind] ?? asset.kind}
                {asset.jurisdiction ? ` · held in ${asset.jurisdiction}` : ""}
                {share !== null ? ` · ${share.toFixed(0)}% of what you own` : ""}
              </p>

              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                {LIQUIDITY_LABELS[asset.liquidity] ?? asset.liquidity}
                {asset.custodian ? ` · held with ${asset.custodian}` : ""}
              </p>

              {/* The method travels with the number, always. An owner's
                  estimate and a struck price rendered in the same style become
                  the same claim in the reader's head. */}
              <p
                data-testid="holding-valuation-method"
                data-method={valuation.method}
                className={`mt-1 text-[11px] leading-relaxed ${
                  valuation.needsItemization ? "text-amber" : "text-muted"
                }`}
              >
                {valuation.valuationNote}
              </p>

              {valuation.refreshPrompt ? (
                <p
                  data-testid="holding-refresh-prompt"
                  className="mt-1 text-[11px] leading-relaxed text-amber"
                >
                  {valuation.refreshPrompt}
                </p>
              ) : null}

              {asset.value.note ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{asset.value.note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 font-mono text-[9px] uppercase tracking-wider text-muted">
        {provenanceLabels[allocation.provenance]}
      </p>
    </section>
  );
}
