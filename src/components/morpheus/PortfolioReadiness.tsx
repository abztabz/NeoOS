"use client";

import Link from "next/link";
import { useConversation } from "@/data/conversation-store";
import { assessPortfolioReadiness, REMEDY_LABELS } from "@/domain/valuation/readiness";
import { formatCurrency } from "@/lib/format";

/**
 * Complete your portfolio pricing.
 *
 * The card somebody needs after filling in the intake form and finding NeoOS
 * still will not price half of it. It names the holdings and what each one
 * needs, largest first, and says nothing at all when there is nothing to do.
 *
 * It is not a progress bar. A percentage would tell somebody how far along they
 * are without telling them what to do next, which is the wrong half of the
 * answer.
 */

export function PortfolioReadiness() {
  const { profile } = useConversation();
  if (profile === null || profile.assets.length === 0) return null;

  const readiness = assessPortfolioReadiness(profile.assets);
  if (readiness.ready) return null;

  return (
    <section
      data-testid="portfolio-readiness"
      aria-label="Complete your portfolio pricing"
      className="rounded-2xl border border-amber/25 bg-amber/[0.04] p-4"
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-wide text-ink">
          COMPLETE YOUR PORTFOLIO PRICING
        </h3>
        <p className="font-mono text-[9px] uppercase tracking-wider text-amber">
          {readiness.priceable} of {readiness.total} ready
        </p>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-[#9aa7b3]">{readiness.summary}</p>

      <ul className="grid gap-2">
        {readiness.items.map((item) => (
          <li
            key={item.assetHoldingId}
            data-testid="readiness-item"
            data-remedy={item.remedy}
            className="rounded-xl border border-[#222d36] bg-panel2 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[13px] font-semibold text-ink">{item.label}</p>
              <p className="font-mono text-[11px] text-[#8f9daa]">
                {item.declaredValue === null
                  ? "value not stated"
                  : formatCurrency(item.declaredValue, item.currency)}
              </p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8f9daa]">{item.detail}</p>
            {item.remedy !== "none" ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-cyan">
                {REMEDY_LABELS[item.remedy]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <Link
        href="/intake"
        data-testid="readiness-edit"
        className="mt-3 inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
      >
        Edit my holdings
      </Link>
    </section>
  );
}
