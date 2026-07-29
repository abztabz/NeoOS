"use client";

import { ReportGate, useActivePortfolio, useReportMode } from "@/data/portfolio-mode";
import { mayRender } from "@/domain/portfolio/portfolio";
import { Gauge } from "@/components/neoos/Gauge";
import { GaugeAwaiting } from "@/components/neoos/GaugeAwaiting";
import { ScoreCard } from "@/components/neoos/ScoreCard";
import { SectionCard } from "@/components/neoos/SectionCard";
import { BriefingCard } from "@/components/neoos/BriefingCard";
import { DecisionCaptureCard } from "@/components/neoos/DecisionCapture";
import { RadarList } from "@/components/neoos/RadarList";
import { Bar } from "@/components/neoos/Bar";
import { useReport } from "@/data/report-store";
import { cashDecision, opportunityLabel, confidenceTier } from "@/domain/scoring";
import {
  commentaryView,
  deploymentPlanView,
  isDemoFallback,
  tiersView,
} from "@/domain/report-view";
import { OpportunityCard } from "@/components/neoos/OpportunityCard";
import {
  opportunityFromReport,
  rankOpportunities,
  type ReportOpportunity,
} from "@/domain/watchlist/from-report";
import { NO_QUALIFYING_OPPORTUNITY } from "@/domain/portfolio/portfolio";
import type { EngineReport } from "@/engine/models";
import type { NeoosAsset } from "@/schemas/neoos-report";

const actionGroups = [
  { key: "Strong Buy", ratings: ["Strong Buy"], tone: "text-green", empty: "None — rarity enforced" },
  { key: "Buy", ratings: ["Buy"], tone: "text-green", empty: "None today" },
  { key: "Accumulate", ratings: ["Accumulate"], tone: "text-cyan", empty: "None today" },
  { key: "Hold", ratings: ["Hold"], tone: "text-ink", empty: "None today" },
  { key: "Reduce", ratings: ["Reduce"], tone: "text-amber", empty: "None today" },
  { key: "Avoid", ratings: ["Sell", "Avoid"], tone: "text-red", empty: "None flagged" },
  // A null rating is the engine refusing to rate — surfaced as its own group
  // so unrated assets are never mistaken for a neutral Hold.
  { key: "Insufficient Evidence", ratings: [null], tone: "text-amber", empty: "None — all assets rated" },
] as const;

/**
 * What belongs on the opportunity board.
 *
 * An asset qualifies by having something to say about it — a valuation, a
 * verified price, or an explicit refusal — not by carrying a `buyBelow` number.
 * That old filter quietly hid every asset NeoOS could not price, which is the
 * one group a reader most needs to see.
 */
function opportunityBoard(assets: NeoosAsset[], engine: EngineReport | null): ReportOpportunity[] {
  const built = assets.map((asset) => opportunityFromReport(asset, engine));
  const meaningful = built.filter(
    (o) => o.fairValue !== null || o.suspendedReason !== null || o.decision === "avoid",
  );
  return rankOpportunities(meaningful).slice(0, 8);
}

export default function CapitalPage() {
  const { report, engine } = useReport();
  const active = useActivePortfolio();
  const reportMode = useReportMode();
  // The real gauge only when the report on screen may actually be shown here.
  const showRealGauge = mayRender(active, reportMode);
  const { scores, assets } = report;
  const opportunities = opportunityBoard(assets, engine);
  const tiers = tiersView(report);
  const plan = deploymentPlanView(report);
  const commentary = commentaryView(report);

  return (
    <>
      {/*
        The gauge sits OUTSIDE the report gate.

        It is the dominant hero component, and gating it meant that declaring a
        real position deleted the flagship element from the product — a blank
        where the primary question belongs. What the gate is for is stopping the
        worked example's *numbers* reaching a real position, not stopping the
        question being asked. So the frame always renders; only the score is
        withheld, and it is withheld visibly.
      */}
      {showRealGauge ? (
        <Gauge report={report} posture={engine?.posture ?? null} />
      ) : (
        <GaugeAwaiting />
      )}

      <ReportGate>
      <>

        <section
          aria-label="Key scores"
          className="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
        >
          <ScoreCard label="Cash Score" value={String(scores.cash)} note={cashDecision(scores.cash)} tone="amber" />
          <ScoreCard label="Market Score" value={String(scores.market)} note="Selective opportunity" tone="cyan" />
          <ScoreCard label="Opportunity Index" value={String(scores.opportunity)} note={opportunityLabel(scores.opportunity)} />
          <ScoreCard label="Confidence" value={`${scores.confidence}%`} note={confidenceTier(scores.confidence)} tone="green" />
          <ScoreCard label="Evidence Integrity" value={String(scores.evidenceIntegrity)} note="Current sources required" tone="green" />
          <ScoreCard label="Reserve Health" value={String(scores.reserveHealth)} note="Reserves before ambition" />
        </section>

        <div className="grid gap-3.5 lg:grid-cols-[1.45fr_.55fr]">
          <div className="grid content-start gap-3.5">
            <BriefingCard />

            <SectionCard title="CAPITAL RADAR" meta="WHAT CHANGED">
              <RadarList items={report.radar} />
            </SectionCard>

            <SectionCard title="ACTION BOARD" meta="POSTURE BEFORE ASSETS">
              <div className="grid gap-2 sm:grid-cols-2">
                {actionGroups.map((group) => {
                  const members = report.assets.filter((a) =>
                    (group.ratings as readonly (string | null)[]).includes(a.rating),
                  );
                  return (
                    <div
                      key={group.key}
                      className="rounded-[15px] border border-[#222d36] bg-panel2 p-3.5"
                    >
                      <b className={`mb-1.5 block font-mono text-[11px] uppercase tracking-wider ${group.tone}`}>
                        {group.key}
                        <span className="ml-2 text-faint">{members.length}</span>
                      </b>
                      <span className="text-[11px] leading-relaxed text-[#8e9aa5]">
                        {members.length > 0
                          ? members.map((m) => m.name).join(" · ")
                          : group.empty}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              title="MORPHEUS COMMENTARY"
              meta="CIO VIEW"
              demoFallback={isDemoFallback(report, commentary)}
            >
              <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{commentary.data}</p>
            </SectionCard>
          </div>

          <aside className="grid content-start gap-3.5">
            <DecisionCaptureCard />

            <SectionCard
              title="FAMILY OFFICE HEALTH"
              meta={`${tiers.data.length} TIERS`}
              demoFallback={isDemoFallback(report, tiers)}
            >
              <ul className="grid gap-2">
                {tiers.data.map((tier) => (
                  <li key={tier.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
                    <div className="flex items-center justify-between gap-2.5">
                      <strong className="text-[12px]">{tier.name}</strong>
                      <em className="font-mono text-[11px] not-italic text-cyan">{tier.score}</em>
                    </div>
                    <p className="mt-1 text-[10px] text-[#8e9aa5]">{tier.status}</p>
                    <Bar value={tier.score} label={`${tier.name}: ${tier.score} out of 100 — ${tier.status}`} />
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="TOP OPPORTUNITIES" meta="PRICE DISCIPLINE">
              {opportunities.length > 0 ? (
                <ul className="grid gap-2">
                  {opportunities.map((opportunity) => (
                    <OpportunityCard key={opportunity.instrumentId} opportunity={opportunity} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
                  {NO_QUALIFYING_OPPORTUNITY}
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="DEPLOYMENT PLAN"
              meta="EXECUTION"
              demoFallback={isDemoFallback(report, plan)}
            >
              <ul className="grid gap-2">
                {plan.data.map((row) => (
                  <li key={row.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
                    <div className="flex items-center justify-between gap-2.5">
                      <strong className="text-[12px]">{row.label}</strong>
                      <em className="font-mono text-[11px] uppercase not-italic text-cyan">{row.value}</em>
                    </div>
                    <p className="mt-1 text-[10px] text-[#8e9aa5]">{row.note}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </aside>
        </div>
      </>
      </ReportGate>
    </>
  );
}
