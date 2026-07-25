"use client";

import { useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { RatingPill } from "@/components/neoos/RatingPill";
import { ScoreTrace } from "@/components/neoos/ScoreTrace";
import { useReport } from "@/data/report-store";
import { isDemoFallback, marketsView, regimeView } from "@/domain/report-view";
import { opportunityLabel } from "@/domain/scoring";

export default function MarketsPage() {
  const { report, engine } = useReport();
  const [traceId, setTraceId] = useState<string | null>(null);
  const traced = engine?.recommendations.find((r) => r.assetId === traceId) ?? null;
  // Unrated assets sort last — they are listed, never silently dropped.
  const ranked = [...report.assets].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const regime = regimeView(report);
  const markets = marketsView(report);
  const marketsFallback = isDemoFallback(report, markets);

  return (
    <div className="grid gap-3.5">
      <SectionCard title="MARKET REGIME" meta="WEATHER" demoFallback={isDemoFallback(report, regime)}>
        <p className="text-lg font-bold text-cyan">{regime.data}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#9aa7b3]">
          Opportunity index {report.scores.opportunity} — {opportunityLabel(report.scores.opportunity)}.
        </p>
      </SectionCard>

      <SectionCard
        title="GLOBAL OPPORTUNITY HEAT MAP"
        meta={markets.fromReport && report.mode === "live" ? "REPORT SCORES" : "DEMO SCORES"}
        demoFallback={marketsFallback}
      >
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {markets.data.regions.map((region) => (
            <div
              key={region.id}
              className="min-h-[110px] rounded-[17px] border border-[#27333d] bg-gradient-to-br from-[#101820] to-[#0a0f13] p-3.5"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">{region.name}</span>
                <small className="microlabel text-[8px]">{region.stance}</small>
              </div>
              <b className="mt-3 block text-[28px] font-extrabold">{region.score}</b>
              <p className="mt-1.5 text-[10px] leading-snug text-[#8e9aa5]">{region.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="MACRO CONTEXT" meta="BACKDROP" demoFallback={marketsFallback}>
        <p className="text-[13px] leading-[1.65] text-[#d6dee5]">{markets.data.macroContext}</p>
      </SectionCard>

      <SectionCard title="GLOBAL OPPORTUNITY RANKING" meta={`${ranked.length} ASSETS`}>
        {ranked.length === 0 ? (
          <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
            The imported report contains no assets. Import a fuller report or reset to demo data.
          </p>
        ) : (
          <>
            {/* Desktop: table. Mobile: stacked rows — no page-level horizontal overflow. */}
            <div className="hidden overflow-hidden rounded-[13px] border border-[#202a33] md:block">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0b0f13] text-left">
                    {["#", "Asset", "Score", "Rating", "Confidence", ""].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-[#25303a] p-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#84919d]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((asset, i) => (
                    <tr key={asset.id} className="border-b border-[#202a33] last:border-b-0">
                      <td className="p-2.5 font-mono text-faint">{String(i + 1).padStart(2, "0")}</td>
                      <td className="p-2.5">
                        <span className="font-bold">{asset.name}</span>
                        <span className="mt-0.5 block font-mono text-[9px] text-faint">
                          {asset.kind === "category"
                            ? `Category${asset.assetClass ? ` · ${asset.assetClass}` : ""}`
                            : [asset.ticker, asset.exchange, asset.currency]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                      </td>
                      <td className="p-2.5 text-[15px] font-extrabold">{asset.score ?? "—"}</td>
                      <td className="p-2.5">
                        <RatingPill rating={asset.rating} />
                      </td>
                      <td className="p-2.5">{asset.confidence}%</td>
                      <td className="p-2.5 text-right">
                        {engine ? (
                          <button
                            type="button"
                            onClick={() => setTraceId(asset.id)}
                            className="rounded-full border border-cyan/40 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
                          >
                            Why?
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {ranked.map((asset, i) => (
                <li key={asset.id} className="rounded-[14px] border border-[#222d36] bg-panel2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-[12px]">
                      <span className="mr-2 font-mono text-[10px] text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {asset.name}
                    </strong>
                    <RatingPill rating={asset.rating} />
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-[#8e9aa5]">
                    Score {asset.score ?? "—"} · Confidence {asset.confidence}%
                    {asset.kind === "category" ? " · Category" : asset.ticker ? ` · ${asset.ticker}` : ""}
                  </p>
                  {engine ? (
                    <button
                      type="button"
                      onClick={() => setTraceId(asset.id)}
                      className="mt-2 inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-3.5 font-mono text-[9px] uppercase tracking-wider text-cyan"
                    >
                      Why this score?
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      {traced ? (
        <ScoreTrace
          recommendation={traced}
          assetName={report.assets.find((a) => a.id === traced.assetId)?.name ?? traced.assetId}
          open={traceId !== null}
          onClose={() => setTraceId(null)}
        />
      ) : null}
    </div>
  );
}
