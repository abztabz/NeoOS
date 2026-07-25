"use client";

import { useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { useIntelligence } from "@/data/intelligence-store";
import { MOBILE_SECTIONS, statementKindLabels } from "@/intelligence/types/briefing";
import { briefingToMarkdown } from "@/intelligence/briefing/briefing";
import type { StatementKind } from "@/intelligence/types/briefing";

/**
 * The Morpheus daily briefing. Concise by default — the sections a decision
 * actually needs — with the rest behind disclosure.
 *
 * Every statement carries its epistemic kind so a measured fact is never
 * mistaken for an inference.
 */

const kindTone: Record<StatementKind, string> = {
  fact: "border-[#222d36] text-[#c6d0d8]",
  engine_output: "border-cyan/25 text-[#c8f3ff]",
  inference: "border-[#2a3540] text-[#9aa7b3]",
  warning: "border-amber/30 bg-amber/5 text-[#ffe1c2]",
  decision_needed: "border-green/30 bg-green/5 text-[#bdfbd5]",
};

export function BriefingCard() {
  const { lastRun } = useIntelligence();
  const [showAll, setShowAll] = useState(false);

  if (!lastRun?.briefing) return null;
  const briefing = lastRun.briefing;

  const visible = showAll
    ? briefing.sections
    : briefing.sections.filter((s) => MOBILE_SECTIONS.includes(s.id));

  const download = () => {
    const blob = new Blob([briefingToMarkdown(briefing)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `morpheus-briefing-${briefing.generatedAt.slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard title="MORPHEUS DAILY BRIEFING" meta={briefing.dataLabel.toUpperCase()}>
      <p data-testid="briefing-headline" className="text-[15px] font-bold leading-snug">
        {briefing.headline}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[#9aa7b3]">{briefing.summary}</p>

      <div className="mt-3 grid gap-3">
        {visible.map((section) => (
          <section key={section.id} aria-label={section.title}>
            <h4 className="microlabel mb-1.5 text-[9px]">{section.title}</h4>
            {section.statements.length === 0 ? (
              <p className="text-[11px] text-muted">Nothing to report.</p>
            ) : (
              <ul className="grid gap-1.5">
                {section.statements.map((statement, index) => (
                  <li
                    key={`${section.id}-${index}`}
                    data-testid="briefing-statement"
                    className={`rounded-lg border p-2.5 text-[11px] leading-relaxed ${kindTone[statement.kind]}`}
                  >
                    <span className="mr-1.5 font-mono text-[8px] uppercase tracking-wider opacity-70">
                      {statementKindLabels[statement.kind]}
                    </span>
                    {statement.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          aria-expanded={showAll}
          className="inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
        >
          {showAll ? "Show key sections" : `Show all ${briefing.sections.length} sections`}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink"
        >
          Export markdown
        </button>
      </div>
    </SectionCard>
  );
}
