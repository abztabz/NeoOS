"use client";

import { ReportGate } from "@/data/portfolio-mode";
import { SectionCard } from "@/components/neoos/SectionCard";
import { UaeGoldBoard } from "@/components/neoos/UaeGoldBoard";
import { RatingPill } from "@/components/neoos/RatingPill";
import { Bar } from "@/components/neoos/Bar";
import { useReport } from "@/data/report-store";
import { goldView, isDemoFallback } from "@/domain/report-view";
import { provenanceLabel, valuationProvenance } from "@/domain/provenance";
import { formatRange } from "@/lib/format";

export default function GoldPage() {
  const { report, engine } = useReport();
  const gold = goldView(report);
  const goldFallback = isDemoFallback(report, gold);
  const goldAsset = report.assets.find((a) => a.id === "gold" || a.ticker === "XAU");
  const goldProvenance = valuationProvenance(engine, goldAsset?.id ?? "gold");

  return (
    <>
      {/*
        Outside the report gate on purpose. The gold price is a fact about the
        market and about the household's own metal; it does not become
        unavailable because no analysed report has been generated yet.
      */}
      <div className="mb-3.5">
        <UaeGoldBoard />
      </div>

      <ReportGate>
        <div className="grid gap-3.5 lg:grid-cols-[1.2fr_.8fr]">
          <SectionCard
            title="GOLD INTELLIGENCE"
            meta={`${gold.data.factors.length} FACTORS`}
            demoFallback={goldFallback}
          >
            <ul className="grid gap-2">
              {gold.data.factors.map((factor) => (
                <li key={factor.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <strong className="text-[12px]">{factor.name}</strong>
                    <em className="font-mono text-[11px] not-italic text-cyan">{factor.score}</em>
                  </div>
                  <p className="mt-1 text-[10px] text-[#8e9aa5]">{factor.note}</p>
                  <Bar value={factor.score} label={`${factor.name}: ${factor.score} out of 100`} />
                </li>
              ))}
            </ul>
          </SectionCard>

          <div className="grid content-start gap-3.5">
            <SectionCard title="FAIR VALUE MODEL" meta="CONSERVATIVE" demoFallback={goldFallback}>
              {goldProvenance ? (
                <>
                  <p className="text-[26px] font-extrabold tracking-[-0.03em]">
                    {goldAsset
                      ? formatRange(goldAsset.intrinsicValueLow, goldAsset.intrinsicValueHigh)
                      : formatRange(gold.data.fairValueLow, gold.data.fairValueHigh)}
                  </p>
                  <p className="mt-1 font-mono text-[9px] leading-snug text-faint">
                    {provenanceLabel(goldProvenance)}
                  </p>
                </>
              ) : (
                <p data-testid="threshold-withheld" className="text-xs leading-relaxed text-amber">
                  Fair-value range withheld — this report carries no valuation trace for gold.
                </p>
              )}
              <div className="mt-3 flex items-center gap-2.5">
                <RatingPill rating={goldAsset?.rating ?? null} />
                {goldAsset ? (
                  <span className="font-mono text-[11px] text-[#8e9aa5]">
                    Score {goldAsset.score ?? "—"} · Confidence {goldAsset.confidence}%
                  </span>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title="PORTFOLIO ROLE" meta="STRATEGIC HEDGE" demoFallback={goldFallback}>
              <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{gold.data.role}</p>
              <p className="mt-3 text-[11px] leading-relaxed text-[#8e9aa5]">
                Gold is protection, not a bet. Accumulate with price discipline; never chase strength.
              </p>
            </SectionCard>
          </div>
        </div>
      </ReportGate>
    </>
  );
}
