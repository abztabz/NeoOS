"use client";

import { useId, useState } from "react";
import { decisionLabels, decisionMeaning } from "@/domain/watchlist/opportunity";
import type { ReportOpportunity } from "@/domain/watchlist/from-report";
import { priceFreshnessLabels } from "@/server/pricing/quote";
import { formatAsOf, formatCurrency } from "@/lib/format";

/**
 * One opportunity, as a card somebody could act on — or a card that tells them
 * plainly why they shouldn't.
 *
 * The layout puts the three prices side by side because they answer three
 * different questions, and a reader who sees only one of them is guessing.
 * Current Price is the market's answer, Fair Value is ours, Good Buy Price is
 * what we would need before the gap between the two stops mattering.
 *
 * Where the price cannot be verified, the three-price row does not degrade into
 * dashes and a greyed-out Buy. The decision is replaced by the reason, because
 * a suspended card should read as a deliberate refusal rather than a loading
 * state somebody might wait out.
 */

const decisionTone: Record<string, string> = {
  strong_buy: "text-green",
  buy: "text-green",
  watch: "text-cyan",
  hold: "text-ink",
  avoid: "text-red",
  insufficient_evidence: "text-amber",
};

const confidenceTone: Record<string, string> = {
  high: "text-green",
  medium: "text-cyan",
  low: "text-amber",
};

function PriceCell({
  label,
  value,
  currency,
  hint,
}: {
  label: string;
  value: number | null;
  currency: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block font-mono text-[8px] uppercase tracking-wider text-faint">{label}</span>
      <strong className="block truncate font-mono text-[13px] text-ink">
        {value === null ? (
          <span className="text-amber">Not available</span>
        ) : (
          formatCurrency(value, currency, value < 10 ? 2 : 0)
        )}
      </strong>
      {hint ? <span className="block text-[9px] leading-snug text-faint">{hint}</span> : null}
    </div>
  );
}

export function OpportunityCard({ opportunity }: { opportunity: ReportOpportunity }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceId = useId();
  const o = opportunity;

  return (
    <li
      data-testid="opportunity-card"
      data-decision={o.decision}
      // min-w-0 because a grid item defaults to min-width:auto, so the card's
      // min-content width — a long source name, a six-figure currency string —
      // otherwise widens the whole page rather than truncating inside the card.
      className="min-w-0 rounded-[14px] border border-[#222d36] bg-panel2 p-3.5"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <strong className="block truncate text-[12.5px]">{o.assetName}</strong>
          {o.ticker ? (
            <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
              {o.ticker}
            </span>
          ) : null}
        </div>
        <em
          data-testid="opportunity-decision"
          title={decisionMeaning[o.decision]}
          className={`shrink-0 font-mono text-[10px] uppercase tracking-wider not-italic ${decisionTone[o.decision]}`}
        >
          {decisionLabels[o.decision]}
        </em>
      </div>

      {/*
        Three across wherever there is room. Below 360px there is not: three
        currency figures and their labels overflow the viewport, and a price
        card that forces horizontal scrolling is worse than a stacked one.
      */}
      <div className="mt-3 grid gap-2 min-[360px]:grid-cols-3">
        <PriceCell label="Current" value={o.currentPrice} currency={o.currency} />
        <PriceCell
          label="Good Buy Price"
          value={o.goodBuy}
          currency={o.currency}
          hint={
            o.fairValue
              ? `${(o.fairValue.marginOfSafetyRequired * 100).toFixed(0)}% margin`
              : undefined
          }
        />
        <PriceCell
          label="Fair Value"
          value={o.fairValue?.value ?? null}
          currency={o.currency}
          hint={o.fairValue ? o.fairValue.method : "No NeoOS valuation"}
        />
      </div>

      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span
          data-testid="opportunity-status"
          className={`font-mono text-[9px] uppercase tracking-wider ${
            o.distance.status === "above_buy" ? "text-[#8e9aa5]" : decisionTone[o.decision]
          }`}
        >
          {o.distance.label}
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-wider ${confidenceTone[o.confidence]}`}>
          {o.confidence} confidence
        </span>
      </div>

      {o.suspendedReason ? (
        <p
          data-testid="opportunity-suspended"
          className="mt-2 rounded-lg border border-amber/30 bg-amber/[0.07] px-2.5 py-2 text-[10px] leading-snug text-amber"
        >
          {o.suspendedReason}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-[1.6] text-[#c3ccd4]">{o.interpretation}</p>

      <button
        type="button"
        onClick={() => setEvidenceOpen((open) => !open)}
        aria-expanded={evidenceOpen}
        aria-controls={evidenceId}
        className="mt-2.5 font-mono text-[9px] uppercase tracking-wider text-cyan underline-offset-2 hover:underline"
      >
        {evidenceOpen ? "Hide evidence" : "Show evidence"}
      </button>

      {evidenceOpen ? (
        <dl
          id={evidenceId}
          data-testid="opportunity-evidence"
          className="mt-2 grid gap-1.5 border-t border-[#222d36] pt-2.5 text-[10px]"
        >
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Price source</dt>
            <dd className="truncate text-right text-[#c3ccd4]">
              {o.sourceName ?? "No verified source"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Quote status</dt>
            <dd className="text-right text-[#c3ccd4]">
              {priceFreshnessLabels[o.evidenceFreshness as keyof typeof priceFreshnessLabels] ??
                o.evidenceFreshness}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-faint">Verified</dt>
            <dd className="text-right text-[#c3ccd4]">
              {o.lastVerifiedAt ? formatAsOf(o.lastVerifiedAt) : "Never"}
            </dd>
          </div>
          {o.valuationTrace ? (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Valuation method</dt>
                <dd className="text-right text-[#c3ccd4]">
                  {o.valuationTrace.method} · model {o.valuationTrace.modelVersion}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Valued on</dt>
                <dd className="text-right text-[#c3ccd4]">
                  {o.valuationTrace.calculationDate.slice(0, 10)}
                  {o.fairValue && o.fairValue.evidenceStatus !== "current"
                    ? ` · ${o.fairValue.evidenceStatus}`
                    : ""}
                </dd>
              </div>
              {o.valuationTrace.assumptions.length > 0 ? (
                <div className="mt-0.5">
                  <dt className="text-faint">Key assumptions</dt>
                  <dd className="mt-0.5 leading-snug text-[#c3ccd4]">
                    {o.valuationTrace.assumptions.slice(0, 3).join(" · ")}
                  </dd>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex justify-between gap-3">
              <dt className="text-faint">Valuation</dt>
              <dd className="text-right text-amber">No NeoOS valuation trace</dd>
            </div>
          )}
        </dl>
      ) : null}
    </li>
  );
}
