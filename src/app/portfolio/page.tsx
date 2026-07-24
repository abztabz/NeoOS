"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import { RatingPill } from "@/components/neoos/RatingPill";
import { useReport } from "@/data/report-store";
import { isDemoFallback, portfolioView } from "@/domain/report-view";
import { confidenceTier } from "@/domain/scoring";
import { formatRange } from "@/lib/format";

export default function PortfolioPage() {
  const { report } = useReport();
  const portfolio = portfolioView(report);

  const holdings = portfolio.data
    .map((detail) => {
      const asset = report.assets.find((a) => a.id === detail.assetId);
      return asset ? { detail, asset } : null;
    })
    .filter((h): h is NonNullable<typeof h> => h !== null);

  return (
    <div className="grid gap-3.5">
      <SectionCard
        title="PORTFOLIO"
        meta={`${holdings.length} HOLDINGS`}
        demoFallback={isDemoFallback(report, portfolio)}
      >
        {holdings.length === 0 ? (
          <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
            No holdings match the current report&apos;s assets. Reset to demo data to see the
            reference portfolio.
          </p>
        ) : (
          <ul className="grid gap-2">
            {holdings.map(({ detail, asset }) => (
              // min-w-0 stops summary min-content propagating into the grid,
              // which otherwise widens the mobile layout viewport past 390px.
              <li key={asset.id} className="min-w-0">
                <details className="group overflow-hidden rounded-[14px] border border-[#222d36] bg-panel2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2.5 p-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="text-faint transition-transform group-open:rotate-90"
                      >
                        ▸
                      </span>
                      <strong className="truncate text-[12px]">
                        {asset.name}
                        {asset.ticker ? (
                          <span className="ml-1.5 font-mono text-[9px] text-[#6f7d89]">
                            {asset.ticker}
                          </span>
                        ) : null}
                      </strong>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[13px] font-extrabold">{asset.score}</span>
                      <RatingPill rating={asset.rating} />
                    </div>
                  </summary>
                  <div className="border-t border-[#222d36] p-3.5">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-3">
                      <div>
                        <dt className="microlabel text-[8px]">Allocation</dt>
                        <dd className="mt-0.5 font-semibold">{detail.allocation}</dd>
                      </div>
                      <div>
                        <dt className="microlabel text-[8px]">Target range</dt>
                        <dd className="mt-0.5 font-semibold">{detail.targetRange}</dd>
                      </div>
                      <div>
                        <dt className="microlabel text-[8px]">Intrinsic value</dt>
                        <dd className="mt-0.5 font-semibold">
                          {formatRange(asset.intrinsicValueLow, asset.intrinsicValueHigh)}
                        </dd>
                      </div>
                      <div>
                        <dt className="microlabel text-[8px]">Confidence</dt>
                        <dd className="mt-0.5 font-semibold">
                          {asset.confidence}% · {confidenceTier(asset.confidence)}
                        </dd>
                      </div>
                      <div>
                        <dt className="microlabel text-[8px]">Thesis status</dt>
                        <dd className="mt-0.5 font-semibold">{detail.thesisStatus}</dd>
                      </div>
                      <div>
                        <dt className="microlabel text-[8px]">Tier / role</dt>
                        <dd className="mt-0.5 font-semibold">
                          {detail.tier} · {detail.role}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <dt className="microlabel text-[8px]">Key risks</dt>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {detail.keyRisks.map((risk) => (
                          <li
                            key={risk}
                            className="rounded-full border border-amber/30 bg-amber/5 px-2.5 py-1 text-[10px] text-[#ffe1c2]"
                          >
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="mt-3 text-[11px] text-[#8e9aa5]">
                      <span className="microlabel mr-1.5 text-[8px]">Next review</span>
                      {detail.reviewTrigger}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
