"use client";

import { ReportGate } from "@/data/portfolio-mode";
import { SectionCard } from "@/components/neoos/SectionCard";
import { ScoreCard } from "@/components/neoos/ScoreCard";
import { useReport } from "@/data/report-store";
import { cashDecision } from "@/domain/scoring";
import { cashView, isDemoFallback } from "@/domain/report-view";
import { formatMoney } from "@/lib/format";

export default function CashPage() {
  const { report } = useReport();
  const cashScore = report.scores.cash;
  const cash = cashView(report);
  const cashFallback = isDemoFallback(report, cash);

  return (
    <ReportGate>
      <div className="grid gap-3.5">
        <SectionCard
          title="CASH OPERATING SYSTEM"
          meta={`SCORE ${cashScore}`}
          demoFallback={cashFallback}
        >
          <p className="mb-3 text-xs leading-relaxed text-[#9aa7b3]">
            Cash is a first-class asset. Its score answers whether waiting currently beats deploying.
          </p>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <ScoreCard label="Available" value={formatMoney(cash.data.available)} note="Total cash on hand" />
            <ScoreCard label="Emergency reserve" value={formatMoney(cash.data.emergencyReserve)} note="Protected — never deployed" tone="green" />
            <ScoreCard label="Deployable" value={formatMoney(cash.data.deployable)} note="Investable after reserves" tone="cyan" />
            <ScoreCard label="Monthly surplus" value={formatMoney(cash.data.monthlySurplus)} note="Adds to deployable each month" />
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
              Cash yield ~{cash.data.cashYieldPct}%. {cash.data.opportunityCost}
            </p>
            <p
              data-testid="cash-score-explainer"
              className="mt-3 rounded-xl border border-[#222d36] bg-panel2 p-3 text-[11px] leading-relaxed text-[#c6d0d8]"
            >
              <strong className="text-ink">What this score means:</strong> a high Cash Score means
              cash and cash-equivalents are currently <em>attractive to hold</em> relative to the
              opportunity set — waiting is being paid for. It is a statement about markets, not about
              your cash position: it never means your cash balance is unhealthy.
            </p>
          </SectionCard>

          <SectionCard title="RECOMMENDATION" meta="RESERVES FIRST" demoFallback={cashFallback}>
            <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{cash.data.recommendation}</p>
          </SectionCard>
        </div>
      </div>
    </ReportGate>
  );
}
