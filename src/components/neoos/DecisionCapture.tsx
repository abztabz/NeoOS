"use client";

import { useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { useIntelligence } from "@/data/intelligence-store";
import {
  decisionKindLabels,
  decisionKinds,
  emptyDecision,
  postureDecisionLabels,
  postureDecisions,
  type DecisionKind,
  type PostureDecision,
} from "@/intelligence/types/decision";

/**
 * Decision capture.
 *
 * A recommendation and a user action are separate records. NeoOS never infers
 * that a recommendation was executed — nothing is recorded here unless the user
 * records it.
 */

const inputClass =
  "min-h-11 w-full rounded-lg border border-[#222d36] bg-panel2 px-3 text-[12px] text-ink outline-none focus-visible:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/30";

export function DecisionCaptureCard() {
  const { lastRun, decisions, saveDecision, storagePersists } = useIntelligence();
  const [kind, setKind] = useState<DecisionKind>("no_action");
  const [posture, setPosture] = useState<PostureDecision>("no_decision");
  const [assetId, setAssetId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [amountUnit, setAmountUnit] = useState<"currency" | "percent">("percent");
  const [notes, setNotes] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [reviewDate, setReviewDate] = useState<string>("");
  const [saved, setSaved] = useState<string | null>(null);

  if (!lastRun?.report) return null;
  const report = lastRun.report.engine;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const recommendation =
      assetId === ""
        ? `${report.posture.recommendation} at ${report.posture.deploymentScore.toFixed(1)}`
        : (report.recommendations.find((r) => r.assetId === assetId)?.finalRating ??
          "Insufficient Evidence");

    const parsedAmount = amount.trim() === "" ? null : Number.parseFloat(amount);

    saveDecision({
      ...emptyDecision({
        decisionId: `decision-${Date.now()}`,
        runId: lastRun.runId,
        reportHash: report.journalEntry.reportHash,
        recordedAt: new Date().toISOString(),
        assetId: assetId === "" ? null : assetId,
        recommendationSnapshot: recommendation,
      }),
      kind,
      postureDecision: assetId === "" ? posture : null,
      amount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
      amountUnit: parsedAmount !== null && Number.isFinite(parsedAmount) ? amountUnit : null,
      notes: notes.trim() === "" ? null : notes.trim(),
      reason: reason.trim() === "" ? null : reason.trim(),
      reviewDate: reviewDate === "" ? null : reviewDate,
    });
    setSaved(
      assetId === ""
        ? `Capital posture decision recorded: ${postureDecisionLabels[posture]}.`
        : `Decision recorded for ${assetId}: ${decisionKindLabels[kind]}.`,
    );
  };

  return (
    <SectionCard title="RECORD YOUR DECISION" meta={`${decisions.length} RECORDED`}>
      <p className="mb-3 text-[11px] leading-relaxed text-[#8e9aa5]">
        What the engine recommends and what you decide are separate records. Nothing is recorded
        here unless you record it.
      </p>

      <form onSubmit={submit} className="grid gap-2.5">
        <label className="grid gap-1">
          <span className="microlabel text-[8px]">Scope</span>
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className={inputClass}
          >
            <option value="">Capital posture (whole portfolio)</option>
            {report.recommendations.map((rec) => (
              <option key={rec.assetId} value={rec.assetId}>
                {rec.assetId} — {rec.finalRating ?? "Insufficient Evidence"}
              </option>
            ))}
          </select>
        </label>

        {assetId === "" ? (
          <label className="grid gap-1">
            <span className="microlabel text-[8px]">Posture decision</span>
            <select
              value={posture}
              onChange={(event) => setPosture(event.target.value as PostureDecision)}
              className={inputClass}
            >
              {postureDecisions.map((option) => (
                <option key={option} value={option}>
                  {postureDecisionLabels[option]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="grid gap-1">
            <span className="microlabel text-[8px]">Decision</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as DecisionKind)}
              className={inputClass}
            >
              {decisionKinds.map((option) => (
                <option key={option} value={option}>
                  {decisionKindLabels[option]}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="grid gap-1">
            <span className="microlabel text-[8px]">Amount (optional)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </label>
          <label className="grid gap-1">
            <span className="microlabel text-[8px]">Unit</span>
            <select
              value={amountUnit}
              onChange={(event) => setAmountUnit(event.target.value as "currency" | "percent")}
              className={inputClass}
            >
              <option value="percent">%</option>
              <option value="currency">USD</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1">
          <span className="microlabel text-[8px]">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={inputClass}
            placeholder="Why you decided this"
          />
        </label>

        <label className="grid gap-1">
          <span className="microlabel text-[8px]">Notes (optional)</span>
          <input
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
            placeholder="Anything worth remembering later"
          />
        </label>

        <label className="grid gap-1">
          <span className="microlabel text-[8px]">Review date (optional)</span>
          <input
            type="date"
            value={reviewDate}
            onChange={(event) => setReviewDate(event.target.value)}
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full border border-green/40 bg-green/10 px-5 font-mono text-[10px] font-bold uppercase tracking-wider text-green transition-colors hover:bg-green/20"
        >
          Record decision
        </button>
      </form>

      {saved ? (
        <p role="status" data-testid="decision-saved" className="mt-3 text-[11px] text-green">
          {saved}
          {storagePersists ? "" : " (session only — browser storage is unavailable)"}
        </p>
      ) : null}

      {decisions.length > 0 ? (
        <details className="mt-3 rounded-xl border border-[#222d36] bg-panel2">
          <summary className="min-h-11 cursor-pointer list-none p-3 font-mono text-[10px] uppercase tracking-wider text-cyan [&::-webkit-details-marker]:hidden">
            Recorded decisions ({decisions.length})
          </summary>
          <ul className="border-t border-[#222d36] p-3 text-[10px]">
            {decisions.map((decision) => (
              <li
                key={decision.decisionId}
                data-testid="recorded-decision"
                className="border-b border-[#1b242c] py-1.5 last:border-b-0"
              >
                <b>{decision.assetId ?? "Capital posture"}</b> —{" "}
                {decision.assetId
                  ? decisionKindLabels[decision.kind]
                  : postureDecisionLabels[decision.postureDecision ?? "no_decision"]}
                {decision.amount !== null
                  ? ` · ${decision.amount}${decision.amountUnit === "percent" ? "%" : " USD"}`
                  : ""}
                <span className="mt-0.5 block text-faint">
                  engine said: {decision.recommendationSnapshot}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionCard>
  );
}
