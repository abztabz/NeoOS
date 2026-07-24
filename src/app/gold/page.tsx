"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import { RatingPill } from "@/components/neoos/RatingPill";
import { Bar } from "@/components/neoos/Bar";
import { useReport } from "@/data/report-store";
import { goldFactors, goldSummary } from "@/data/workspace-content";
import { formatRange } from "@/lib/format";

export default function GoldPage() {
  const { report } = useReport();
  const goldAsset = report.assets.find((a) => a.id === "gold" || a.ticker === "XAU");

  return (
    <div className="grid gap-3.5 lg:grid-cols-[1.2fr_.8fr]">
      <SectionCard title="GOLD INTELLIGENCE" meta="6 FACTORS">
        <ul className="grid gap-2">
          {goldFactors.map((factor) => (
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
        <SectionCard title="FAIR VALUE MODEL" meta="CONSERVATIVE">
          <p className="text-[26px] font-extrabold tracking-[-0.03em]">
            {goldAsset
              ? formatRange(goldAsset.intrinsicValueLow, goldAsset.intrinsicValueHigh)
              : formatRange(goldSummary.fairValueLow, goldSummary.fairValueHigh)}
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <RatingPill rating={goldAsset?.rating ?? goldSummary.rating} />
            {goldAsset ? (
              <span className="font-mono text-[11px] text-[#8e9aa5]">
                Score {goldAsset.score} · Confidence {goldAsset.confidence}%
              </span>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="PORTFOLIO ROLE" meta="STRATEGIC HEDGE">
          <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{goldSummary.role}</p>
          <p className="mt-3 text-[11px] leading-relaxed text-[#8e9aa5]">
            Gold is protection, not a bet. Accumulate with price discipline; never chase strength.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
