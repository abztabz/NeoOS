"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import type { UaeGoldBoard as GoldBoard } from "@/server/gold/uae-gold-service";
import { GOLD_REFERENCE_EXCLUSIONS, goldKarats } from "@/domain/gold/uae-gold";
import { priceFreshnessLabels } from "@/server/pricing/quote";
import { formatAsOf, formatCurrency } from "@/lib/format";

/**
 * The two numbers on the board in every shop on the Gold Souk.
 *
 * 24K and 22K, in dirhams per gram. That is how the person holding this gold
 * thinks about it, so that is the headline. XAU/USD per troy ounce is how the
 * figure was derived and lives in the evidence line underneath, where it can be
 * checked without being mistaken for the price.
 *
 * When there is no verified spot price the card does not fall back to a stale
 * figure or a plausible-looking constant. It says what is missing and what would
 * fix it, and shows no number at all.
 */

type LoadState =
  | { status: "loading" }
  | { status: "ready"; board: GoldBoard }
  | { status: "error"; message: string };

export function UaeGoldBoard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gold/uae", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Gold board unavailable (${response.status}).`);
        return response.json() as Promise<GoldBoard>;
      })
      .then((board) => {
        if (!cancelled) setState({ status: "ready", board });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Gold board unavailable.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard title="UAE GOLD PRICE" meta="AED PER GRAM">
      {state.status === "loading" ? (
        <p className="text-xs text-muted">Checking the gold reference…</p>
      ) : state.status === "error" ? (
        <p data-testid="gold-board-unavailable" className="text-[11px] leading-relaxed text-amber">
          {state.message}
        </p>
      ) : state.board.available && state.board.prices ? (
        <Available board={state.board} />
      ) : (
        <div>
          <p
            data-testid="gold-board-unavailable"
            className="rounded-lg border border-amber/30 bg-amber/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber"
          >
            {state.board.unavailableReason}
          </p>
          <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
            No price is shown rather than an approximate one. A gold figure that
            looks current and is not would misstate a large part of this household&rsquo;s
            wealth.
          </p>
        </div>
      )}
      <p className="mt-3 border-t border-[#222d36] pt-2.5 text-[10px] leading-relaxed text-faint">
        {GOLD_REFERENCE_EXCLUSIONS}
      </p>
    </SectionCard>
  );
}

function Available({ board }: { board: GoldBoard }) {
  const prices = board.prices!;
  const headline = prices["24K"];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {goldKarats.map((karat) => {
          const price = prices[karat];
          const goodBuy = board.goodBuyPerGram?.[karat] ?? null;
          return (
            <div
              key={karat}
              data-testid={`gold-price-${karat}`}
              className="rounded-[14px] border border-[#222d36] bg-panel2 p-3"
            >
              <span className="block font-mono text-[9px] uppercase tracking-wider text-faint">
                {karat} · per gram
              </span>
              <strong className="mt-0.5 block text-[22px] font-extrabold tracking-[-0.03em]">
                {formatCurrency(price.pricePerGram, "AED", 2)}
              </strong>
              {goodBuy !== null ? (
                <span className="mt-1 block text-[10px] text-[#8e9aa5]">
                  Good Buy Price {formatCurrency(goodBuy, "AED", 2)}
                </span>
              ) : (
                <span className="mt-1 block text-[10px] text-faint">
                  No Good Buy Price — NeoOS has not published a gold discipline
                </span>
              )}
            </div>
          );
        })}
      </div>

      <dl className="mt-3 grid gap-1.5 border-t border-[#222d36] pt-2.5 text-[10px]">
        <div className="flex justify-between gap-3">
          <dt className="text-faint">Quote status</dt>
          <dd className="text-right text-[#c3ccd4]">
            {priceFreshnessLabels[headline.freshness] ?? headline.freshness}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">Struck</dt>
          <dd className="text-right text-[#c3ccd4]">{formatAsOf(headline.quoteTimestamp)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">Underlying</dt>
          <dd className="text-right text-[#c3ccd4]">
            {headline.underlyingPrice !== undefined
              ? `${formatCurrency(headline.underlyingPrice, "USD", 2)} / troy oz (XAU/USD)`
              : "XAU/USD"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">USD/AED</dt>
          <dd className="text-right text-[#c3ccd4]">
            {headline.fxRate?.toFixed(4) ?? "—"}
            {board.fxIsPolicyFallback ? " · documented peg" : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-faint">Source</dt>
          <dd className="truncate text-right text-[#c3ccd4]">{headline.sourceName}</dd>
        </div>
      </dl>
    </div>
  );
}
