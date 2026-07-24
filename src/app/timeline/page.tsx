"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import { timelineEvents } from "@/data/workspace-content";
import { CashTrendChart } from "@/components/neoos/CashTrendChart";

const kindLabels: Record<string, string> = {
  deployment: "Deployment change",
  cash: "Cash score change",
  rating: "Rating change",
  decision: "Decision",
  evidence: "Evidence revision",
};

export default function TimelinePage() {
  return (
    <div className="grid gap-3.5">
      <SectionCard title="CASH SCORE VS DEPLOYMENT" meta="TREND">
        <CashTrendChart events={timelineEvents} />
      </SectionCard>

      <SectionCard title="TIMELINE" meta="DECISION RECORD">
        <ol className="grid gap-2">
          {timelineEvents.map((event) => (
            <li key={event.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <strong className="text-[12px]">
                  <span className="mr-2 font-mono text-[10px] text-cyan">{event.date}</span>
                  {event.title}
                </strong>
                <span className="microlabel text-[8px]">{kindLabels[event.kind] ?? event.kind}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[#8e9aa5]">{event.detail}</p>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
