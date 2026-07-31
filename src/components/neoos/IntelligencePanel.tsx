"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIntelligence } from "@/data/intelligence-store";
import { useActivePortfolio } from "@/data/portfolio-mode";
import { useReport } from "@/data/report-store";
import {
  describeOutcome,
  isFault,
  readOperatorToken,
  triggerServerRun,
  NO_TOKEN_MESSAGE,
  type RunNowOutcome,
} from "@/data/run-now";
import { cycleStateLabels } from "@/intelligence/types/cycle";
import { providerModeLabels } from "@/intelligence/types/provider";
import type { DailyCycleResult } from "@/intelligence/orchestration/cycle";

/**
 * Operating surface for the intelligence loop: run status, provider states,
 * evidence summary, identity and conflict warnings, and manual evidence import.
 * Advanced diagnostics sit behind disclosure so the panel stays readable.
 */

const stateTone: Record<string, string> = {
  success: "border-green/40 text-green",
  partial_success: "border-amber/40 text-amber",
  insufficient_evidence: "border-amber/40 text-amber",
  failed: "border-red/40 text-red",
  cancelled: "border-line text-muted",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#1b242c] py-1.5 last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono text-[11px] tabular-nums">{value}</span>
    </div>
  );
}

function RunSummary({ run }: { run: DailyCycleResult }) {
  const counts = run.evidenceCounts;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="cycle-state"
          className={`inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider ${stateTone[run.state] ?? "border-line"}`}
        >
          {cycleStateLabels[run.state]}
        </span>
        <span
          data-testid="run-data-label"
          className="inline-flex items-center rounded-full border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-amber"
        >
          {run.dataLabel}
        </span>
      </div>

      <section aria-label="Evidence summary" className="rounded-xl border border-[#222d36] bg-panel2 p-3 text-[11px]">
        <h4 className="microlabel mb-1.5 text-[9px]">Evidence ingested</h4>
        <Row label="Raw records ingested" value={String(counts.rawIngested)} />
        <Row label="Duplicates dropped" value={String(counts.duplicatesDropped)} />
        <Row label="Rejected with reasons" value={String(counts.rawRejected)} />
        <Row label="Normalized for scoring" value={String(counts.normalized)} />
      </section>

      <section aria-label="Identity resolution" className="rounded-xl border border-[#222d36] bg-panel2 p-3 text-[11px]">
        <h4 className="microlabel mb-1.5 text-[9px]">Identity resolution</h4>
        <Row label="Matched" value={String(counts.identityMatched)} />
        <Row label="Ambiguous" value={String(counts.identityAmbiguous)} />
        <Row label="Unmatched" value={String(counts.identityUnmatched)} />
        <Row label="Conflicting identifiers" value={String(counts.identityConflicted)} />
        {counts.identityAmbiguous + counts.identityUnmatched + counts.identityConflicted > 0 ? (
          <p data-testid="identity-warning" className="mt-2 text-[10px] leading-relaxed text-amber">
            Records that could not be attributed were dropped, never guessed at. Each one is listed
            in the diagnostics below with the candidates considered.
          </p>
        ) : null}
      </section>

      <section aria-label="Conflicts" className="rounded-xl border border-[#222d36] bg-panel2 p-3 text-[11px]">
        <h4 className="microlabel mb-1.5 text-[9px]">Evidence conflicts</h4>
        <Row label="Detected" value={String(counts.conflictsDetected)} />
        <Row label="Unresolved" value={String(counts.conflictsUnresolved)} />
        {run.report && run.report.engine.conflicts.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {run.report.engine.conflicts.map((conflict) => (
              <li
                key={conflict.conflictId}
                data-testid="conflict-item"
                className={`rounded-lg border p-2 text-[10px] leading-snug ${
                  conflict.resolution === "unresolved"
                    ? "border-red/30 bg-red/5 text-[#ffd0d0]"
                    : "border-[#222d36] text-[#8e9aa5]"
                }`}
              >
                <b className="font-mono uppercase">{conflict.severity}</b> · {conflict.note}
                <span className="mt-1 block text-faint">{conflict.confidenceEffect}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {run.excludedAssets.length > 0 ? (
        <section aria-label="Excluded assets" className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-[11px]">
          <h4 className="microlabel mb-1.5 text-[9px] text-amber">Excluded from scoring</h4>
          <ul className="space-y-1 text-[10px] leading-snug text-[#ffe1c2]">
            {run.excludedAssets.map((asset) => (
              <li key={asset.assetId}>
                <b>{asset.assetId}</b> — {asset.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rounded-xl border border-[#222d36] bg-panel2">
        <summary className="min-h-11 cursor-pointer list-none p-3 font-mono text-[10px] uppercase tracking-wider text-cyan [&::-webkit-details-marker]:hidden">
          Diagnostics — rejected records, issues, audit trace
        </summary>
        <div className="border-t border-[#222d36] p-3 text-[10px] leading-relaxed">
          {run.rejectedRecords.length > 0 ? (
            <>
              <h5 className="microlabel mb-1 text-[8px]">Rejected records</h5>
              <ul className="mb-3 space-y-1">
                {run.rejectedRecords.map((rejected) => (
                  <li key={rejected.rawEvidenceId} data-testid="rejected-record" className="text-[#ffe1c2]">
                    <b className="font-mono">{rejected.rawEvidenceId}</b> ({rejected.providerId}):{" "}
                    {rejected.reasons.map((r) => `${r.code} — ${r.message}`).join(" · ")}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {run.issues.length > 0 ? (
            <>
              <h5 className="microlabel mb-1 text-[8px]">Validation issues</h5>
              <ul className="mb-3 space-y-1">
                {run.issues.slice(0, 25).map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="text-[#8e9aa5]">
                    <b className="font-mono uppercase">{issue.severity}</b> · {issue.code} ·{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h5 className="microlabel mb-1 text-[8px]">Audit trace</h5>
          <ol className="space-y-1">
            {run.auditTrace.map((step, index) => (
              <li key={`${step.step}-${index}`} className="font-mono text-[#8e9aa5]">
                {step.ok ? "OK " : "FAIL"} · {step.step} — {step.detail}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </div>
  );
}

export function IntelligencePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    running,
    lastRun,
    history,
    runFixtureDay,
    runManualEvidence,
    applyRunReport,
    confirmJournalEntry,
    storagePersists,
  } = useIntelligence();
  const { hasUserPortfolio } = useActivePortfolio();
  const { importReport } = useReport();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [serverRunning, setServerRunning] = useState(false);
  const [serverOutcome, setServerOutcome] = useState<RunNowOutcome | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * Ask the server for a real run.
   *
   * The endpoint existed before this button did, which meant the only runs
   * reachable from the interface were fixtures over an invented household.
   * Pressing this may well produce a refusal — the server declines when it
   * cannot run against verified sources — and that refusal is the point: it
   * names the missing input instead of failing silently.
   */
  const handleServerRun = async () => {
    setError(null);
    setStatus(null);
    setServerOutcome(null);

    const token = readOperatorToken();
    if (!token) {
      setError(NO_TOKEN_MESSAGE);
      return;
    }

    setServerRunning(true);
    try {
      const outcome = await triggerServerRun({ token });
      // Apply before describing, so the description reflects what actually
      // happened to the cockpit rather than what was expected to.
      const applied =
        outcome.kind === "ran" && outcome.reportText !== null
          ? importReport(outcome.reportText)
          : null;
      setServerOutcome(outcome);
      const described = describeOutcome(outcome, applied);
      if (isFault(outcome)) setError(described);
      else setStatus(described);
    } finally {
      setServerRunning(false);
    }
  };

  const handleFixture = async (day: 1 | 2) => {
    setError(null);
    setStatus(null);
    const run = await runFixtureDay(day);
    setStatus(`Run ${run.runId} finished: ${cycleStateLabels[run.state]}.`);
  };

  const handleManual = async (file: File) => {
    setError(null);
    setStatus(null);
    const text = await file.text();
    const outcome = await runManualEvidence(text);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setStatus(`Manual evidence run finished: ${cycleStateLabels[outcome.state]}.`);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="intelligence-title"
      className="m-auto max-h-[88vh] w-[min(94vw,620px)] overflow-y-auto rounded-3xl border border-line bg-panel p-0 text-ink"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="microlabel">Morpheus intelligence</div>
            <h3 id="intelligence-title" className="mt-1 text-lg font-bold">
              Daily cycle
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close intelligence panel"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-[#8e9aa5]">
          Runs the full loop — ingest, identify, normalize, validate, resolve conflicts, build
          inputs, score, compare, brief. Every score comes from the scoring engine; the pipeline
          never writes one.
        </p>

        {/*
          The real run, given its own row above the fixtures. It is the only
          control here that produces numbers about the operator's own position,
          so it does not sit in a line of buttons that mostly do not.
        */}
        <div className="mt-4 rounded-xl border border-green/30 bg-green/[0.06] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b className="block text-[12px] text-ink">Run against your own position</b>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-[#8e9aa5]">
                Server-side, signed and stored. Declines rather than guesses when a source
                cannot be verified.
              </span>
            </div>
            <button
              type="button"
              data-testid="run-now"
              onClick={() => void handleServerRun()}
              disabled={serverRunning || running}
              className="inline-flex min-h-11 items-center rounded-full border border-green/50 bg-green/15 px-5 font-mono text-[10px] font-bold uppercase tracking-wider text-green transition-colors hover:bg-green/25 disabled:opacity-50"
            >
              {serverRunning ? "Running…" : "Run now"}
            </button>
          </div>

          {serverOutcome?.kind === "refused" ? (
            /*
              A refusal is an answer, not an error. It is rendered in the
              product's "here is what is missing" register rather than as a
              failure, because the server behaved correctly and the operator
              now has something specific to go and fix.
            */
            <div
              data-testid="run-refusal"
              className="mt-3 rounded-lg border border-amber/30 bg-amber/[0.07] p-3 text-[11px] leading-relaxed text-[#ffe1c2]"
            >
              <b className="block text-amber">The server declined to run.</b>
              <p className="mt-1">{serverOutcome.reason}</p>
              {serverOutcome.missing.length > 0 ? (
                <>
                  <span className="microlabel mt-2 block text-[8px] text-amber">Not configured</span>
                  <ul className="mt-1 grid gap-0.5">
                    {serverOutcome.missing.map((item) => (
                      <li key={item} className="font-mono text-[10px]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          {serverOutcome?.kind === "ran" && serverOutcome.alerts.length > 0 ? (
            <ul data-testid="run-alerts" className="mt-3 grid gap-1 text-[10px] leading-snug text-amber">
              {serverOutcome.alerts.map((alert, index) => (
                <li key={`${alert}-${index}`}>{alert}</li>
              ))}
            </ul>
          ) : null}

          {/*
            Not `text-faint`: against this card's green tint it measures 4.4:1,
            just under the AA threshold. The tinted panel is what moved it —
            the same token clears the bar on the neutral background elsewhere.
          */}
          <p className="mt-2.5 text-[10px] leading-relaxed text-[#8e9aa5]">
            Uses the operator token held in this session. Enter it on{" "}
            <Link href="/intake" className="text-cyan underline underline-offset-2">
              Intake
            </Link>{" "}
            if the run reports that none is held.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {/*
            The fixture days run the pipeline over an invented household. They
            are a way to see the machinery work, and once a real position exists
            they are also a way to overwrite it with somebody else's numbers —
            so they are withdrawn rather than merely labelled.
          */}
          {hasUserPortfolio ? (
            <p
              data-testid="fixture-runs-withheld"
              className="text-[11px] leading-relaxed text-muted"
            >
              Fixture days are unavailable now that you have declared a position. Use{" "}
              <em className="not-italic text-ink">Import evidence</em> to run the pipeline over
              your own sources.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleFixture(1)}
                disabled={running || serverRunning}
                className="inline-flex min-h-11 items-center rounded-full border border-cyan/40 bg-cyan/10 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
              >
                Run fixture day 1
              </button>
              <button
                type="button"
                onClick={() => void handleFixture(2)}
                disabled={running || serverRunning}
                className="inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10 disabled:opacity-50"
              >
                Run fixture day 2
              </button>
            </>
          )}
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink">
            Import evidence
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleManual(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {running ? (
          <p role="status" className="mt-3 font-mono text-[10px] uppercase tracking-wider text-cyan">
            Running cycle…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 rounded-xl border border-red/40 bg-red/10 p-3 text-xs text-[#ffd0d0]">
            {error}
          </p>
        ) : null}
        {status ? (
          <p role="status" className="mt-3 font-mono text-[10px] uppercase tracking-wider text-green">
            {status}
          </p>
        ) : null}

        {lastRun ? (
          <div className="mt-4">
            <RunSummary run={lastRun} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!lastRun.report}
                onClick={() => {
                  applyRunReport(lastRun);
                  setStatus("Report applied to the cockpit.");
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-green/40 bg-green/10 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-green transition-colors hover:bg-green/20 disabled:opacity-40"
              >
                Apply report
              </button>
              <button
                type="button"
                disabled={!lastRun.draftJournalEntry}
                onClick={() => {
                  const outcome = confirmJournalEntry(lastRun);
                  setStatus(
                    outcome.ok
                      ? "Journal entry appended."
                      : (outcome.reason ?? "Could not append entry."),
                  );
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-cyan/40 px-4 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10 disabled:opacity-40"
              >
                Append journal entry
              </button>
            </div>
            {!storagePersists ? (
              <p className="mt-2 text-[10px] text-amber">
                Browser storage is unavailable — journal entries last only for this session.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
            No cycle has run yet in this session.
          </p>
        )}

        <details className="mt-4 rounded-xl border border-[#222d36] bg-panel2">
          <summary className="min-h-11 cursor-pointer list-none p-3 font-mono text-[10px] uppercase tracking-wider text-cyan [&::-webkit-details-marker]:hidden">
            Provider status ({lastRun ? lastRun.providers.length : 0})
          </summary>
          <div className="border-t border-[#222d36] p-3">
            {lastRun ? (
              <ul className="space-y-2">
                {lastRun.providers.map((provider) => (
                  <li
                    key={provider.providerId}
                    data-testid="provider-row"
                    className="rounded-lg border border-[#222d36] p-2.5 text-[10px] leading-snug"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="text-[11px]">{provider.providerName}</b>
                      <span
                        className={`font-mono uppercase ${
                          provider.mode === "live"
                            ? "text-green"
                            : provider.mode === "error"
                              ? "text-red"
                              : "text-amber"
                        }`}
                      >
                        {providerModeLabels[provider.mode]}
                      </span>
                    </div>
                    <p className="mt-1 text-[#8e9aa5]">
                      Tier {provider.sourceTier} · health {provider.health} ·{" "}
                      {provider.configured ? "configured" : "not configured"}
                      {provider.authenticated ? " · authenticated" : ""}
                    </p>
                    {provider.failureReason ? (
                      <p className="mt-1 text-amber">{provider.failureReason}</p>
                    ) : null}
                    <p className="mt-1 text-faint">{provider.legalNotes}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-muted">Run a cycle to see provider status.</p>
            )}
          </div>
        </details>

        {history.length > 0 ? (
          <details className="mt-3 rounded-xl border border-[#222d36] bg-panel2">
            <summary className="min-h-11 cursor-pointer list-none p-3 font-mono text-[10px] uppercase tracking-wider text-cyan [&::-webkit-details-marker]:hidden">
              Run history ({history.length})
            </summary>
            <ol className="border-t border-[#222d36] p-3 text-[10px]">
              {history.map((run) => (
                <li key={run.runId} data-testid="run-history-row" className="border-b border-[#1b242c] py-1.5 last:border-b-0">
                  <span className="font-mono">{run.runId}</span> · {cycleStateLabels[run.state]} ·{" "}
                  {run.dataLabel} · {run.evidenceCounts.normalized} evidence
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </dialog>
  );
}
