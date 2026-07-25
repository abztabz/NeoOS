"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import { useIntelligence } from "@/data/intelligence-store";
import { verifyEntryIntegrity, supersededIds } from "@/intelligence/journal/journal-store";
import { cycleStateLabels } from "@/intelligence/types/cycle";
import { decisionKindLabels, postureDecisionLabels } from "@/intelligence/types/decision";

/**
 * Journal and run history on the Timeline workspace.
 *
 * Entries are append-only. A superseded entry stays visible and is labelled as
 * superseded rather than removed, so the record shows corrections instead of
 * hiding them.
 */
export function JournalList() {
  const { journal, decisions, runHistory, storagePersists } = useIntelligence();
  const superseded = supersededIds(journal);

  if (journal.length === 0 && decisions.length === 0 && runHistory.length === 0) return null;

  return (
    <>
      {runHistory.length > 0 ? (
        <SectionCard title="INTELLIGENCE RUNS" meta={`${runHistory.length} RECORDED`}>
          <ol className="grid gap-2">
            {runHistory.map((run) => (
              <li
                key={run.runId}
                data-testid="timeline-run"
                className="rounded-[14px] border border-[#222d36] bg-panel2 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <strong className="font-mono text-[11px]">{run.runId}</strong>
                  <span className="microlabel text-[8px]">
                    {cycleStateLabels[run.state as keyof typeof cycleStateLabels] ?? run.state}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[#8e9aa5]">
                  {run.dataLabel} · {run.rawIngested} raw, {run.normalized} normalized,{" "}
                  {run.rawRejected} rejected · {run.conflictsUnresolved} unresolved conflict(s)
                </p>
              </li>
            ))}
          </ol>
        </SectionCard>
      ) : null}

      {journal.length > 0 ? (
        <SectionCard title="DECISION JOURNAL" meta={`${journal.length} ENTRIES`}>
          <p className="mb-2.5 text-[10px] leading-relaxed text-[#8e9aa5]">
            Append-only. Corrections add a new entry and leave the original in place. Stored in this
            browser only — see the journal design notes for the durability limitation.
            {storagePersists ? "" : " Browser storage is currently unavailable."}
          </p>
          <ol className="grid gap-2">
            {journal.map((entry) => {
              const intact = verifyEntryIntegrity(entry);
              const isSuperseded = superseded.has(entry.entryId);
              return (
                <li
                  key={entry.entryId}
                  data-testid="journal-entry"
                  className={`rounded-[14px] border p-3 ${
                    isSuperseded ? "border-[#1b242c] opacity-70" : "border-[#222d36]"
                  } bg-panel2`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong className="text-[12px]">{entry.summary}</strong>
                    <span className="microlabel text-[8px]">
                      {isSuperseded ? "Superseded" : "Current"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-[#8e9aa5]">
                    {entry.recommendation} · deployment {entry.deploymentScore.toFixed(1)} · engine{" "}
                    {entry.engineVersion} · integrity {entry.integrityHash.slice(0, 8)}
                    {intact ? "" : " — INTEGRITY CHECK FAILED"}
                  </p>
                  {entry.supersedes ? (
                    <p className="mt-1 text-[10px] text-cyan">Corrects {entry.supersedes}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      ) : null}

      {decisions.length > 0 ? (
        <SectionCard title="RECORDED DECISIONS" meta={`${decisions.length}`}>
          <ol className="grid gap-2">
            {decisions.map((decision) => (
              <li
                key={decision.decisionId}
                data-testid="timeline-decision"
                className="rounded-[14px] border border-[#222d36] bg-panel2 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <strong className="text-[12px]">{decision.assetId ?? "Capital posture"}</strong>
                  <span className="microlabel text-[8px]">
                    {decision.assetId
                      ? decisionKindLabels[decision.kind]
                      : postureDecisionLabels[decision.postureDecision ?? "no_decision"]}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-[#8e9aa5]">
                  Engine recommended: {decision.recommendationSnapshot}
                  {decision.reason ? ` · reason: ${decision.reason}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </SectionCard>
      ) : null}
    </>
  );
}
