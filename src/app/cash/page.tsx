"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import { ScoreCard } from "@/components/neoos/ScoreCard";
import { useReport } from "@/data/report-store";
import { cashDecision } from "@/domain/scoring";
import { cashPosition } from "@/data/workspace-content";
import { formatMoney } from "@/lib/format";

export default function CashPage() {
  const { report } = useReport();
  const cashScore = report.scores.cash;

  return (
    <div className="grid gap-3.5">
      <SectionCard title="CASH OPERATING SYSTEM" meta={`SCORE ${cashScore}`}>
        <p className="mb-3 text-xs leading-relaxed text-[#9aa7b3]">
          Cash is a first-class asset. Its score answers whether waiting currently beats deploying.
        </p>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <ScoreCard label="Available" value={formatMoney(cashPosition.available)} note="Total cash on hand" />
          <ScoreCard label="Emergency reserve" value={formatMoney(cashPosition.emergencyReserve)} note="Protected — never deployed" tone="green" />
          <ScoreCard label="Deployable" value={formatMoney(cashPosition.deployable)} note="Investable after reserves" tone="cyan" />
          <ScoreCard label="Monthly surplus" value={formatMoney(cashPosition.monthlySurplus)} note="Adds to deployable each month" />
        </div>
      </SectionCard>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <SectionCard title="CASH SCORE" meta="DECISION">
          <div className="flex items-baseline gap-3">
            <span className="text-[44px] font-extrabold tracking-[-0.05em] text-amber">
              {cashScore}
            </span>
            <span className="text-[15px] font-bold">{cashDecision(cashScore)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#8e9aa5]">
            Cash yield ~{cashPosition.cashYieldPct}%. {cashPosition.opportunityCost}
          </p>
        </SectionCard>

        <SectionCard title="RECOMMENDATION" meta="RESERVES FIRST">
          <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{cashPosition.recommendation}</p>
        </SectionCard>
      </div>
    </div>
  );
}
