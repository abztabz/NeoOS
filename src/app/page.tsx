"use client";

import { Gauge } from "@/components/neoos/Gauge";
import { ScoreCard } from "@/components/neoos/ScoreCard";
import { SectionCard } from "@/components/neoos/SectionCard";
import { RadarList } from "@/components/neoos/RadarList";
import { Bar } from "@/components/neoos/Bar";
import { useReport } from "@/data/report-store";
import { cashDecision, opportunityLabel, confidenceTier } from "@/domain/scoring";
import {
  deploymentPlan,
  morpheusCommentary,
  tierStatuses,
} from "@/data/workspace-content";
import { formatMoney } from "@/lib/format";
import type { NeoosAsset } from "@/schemas/neoos-report";

const actionGroups = [
  { key: "Strong Buy", ratings: ["Strong Buy"], tone: "text-green", empty: "None — rarity enforced" },
  { key: "Buy", ratings: ["Buy"], tone: "text-green", empty: "None today" },
  { key: "Accumulate", ratings: ["Accumulate"], tone: "text-cyan", empty: "None today" },
  { key: "Hold", ratings: ["Hold"], tone: "text-ink", empty: "None today" },
  { key: "Reduce", ratings: ["Reduce"], tone: "text-amber", empty: "None today" },
  { key: "Avoid", ratings: ["Sell", "Avoid"], tone: "text-red", empty: "None flagged" },
] as const;

function watchlistAssets(assets: NeoosAsset[]): NeoosAsset[] {
  return assets.filter((a) => a.buyBelow != null || a.strongBuyBelow != null);
}

export default function CapitalPage() {
  const { report } = useReport();
  const { scores, assets } = report;
  const watchlist = watchlistAssets(assets);

  return (
    <>
      <Gauge report={report} />

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
          <SectionCard title="CAPITAL RADAR" meta="WHAT CHANGED">
            <RadarList items={report.radar} />
          </SectionCard>

          <SectionCard title="ACTION BOARD" meta="POSTURE BEFORE ASSETS">
            <div className="grid gap-2 sm:grid-cols-2">
              {actionGroups.map((group) => {
                const members = report.assets.filter((a) =>
                  (group.ratings as readonly string[]).includes(a.rating),
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

          <SectionCard title="MORPHEUS COMMENTARY" meta="CIO VIEW">
            <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{morpheusCommentary}</p>
          </SectionCard>
        </div>

        <aside className="grid content-start gap-3.5">
          <SectionCard title="FAMILY OFFICE HEALTH" meta="5 TIERS">
            <ul className="grid gap-2">
              {tierStatuses.map((tier) => (
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

          <SectionCard title="WATCHLIST" meta="PRICE DISCIPLINE">
            {watchlist.length > 0 ? (
              <ul className="grid gap-2">
                {watchlist.map((asset) => (
                  <li key={asset.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
                    <div className="flex items-center justify-between gap-2.5">
                      <strong className="text-[12px]">{asset.name}</strong>
                      <em className="font-mono text-[11px] not-italic text-cyan">WATCH</em>
                    </div>
                    <p className="mt-1 text-[10px] text-[#8e9aa5]">
                      {asset.buyBelow != null ? `Buy below ${formatMoney(asset.buyBelow)}` : "No buy level set"}
                      {asset.strongBuyBelow != null
                        ? ` · Strong Buy below ${formatMoney(asset.strongBuyBelow)}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
                No assets are close enough to a buy threshold to watch.
              </p>
            )}
          </SectionCard>

          <SectionCard title="DEPLOYMENT PLAN" meta="EXECUTION">
            <ul className="grid gap-2">
              {deploymentPlan.map((row) => (
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
  );
}
