"use client";

import { useEffect, useRef } from "react";
import type { AssetRecommendation } from "@/engine/models";
import { RatingPill } from "@/components/neoos/RatingPill";
import { formatMoney } from "@/lib/format";

/**
 * Per-asset explainability: the score waterfall, the rating gate, the
 * valuation trace, evidence used, conflicts, and invalidation conditions.
 * This is the answer to "why 68 and not 72".
 */
export function ScoreTrace({
  recommendation,
  assetName,
  open,
  onClose,
}: {
  recommendation: AssetRecommendation;
  assetName: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const rec = recommendation;
  const contributing = rec.factorScores.filter((f) => f.weightedContribution !== null);
  const weightSum = contributing.reduce((sum, f) => sum + f.weight, 0);
  const missing = rec.factorScores.filter((f) => f.rawScore === null);
  const failedChecks = rec.eligibilityChecks.filter((c) => !c.passed);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="score-trace-title"
      className="m-auto max-h-[86vh] w-[min(94vw,640px)] overflow-y-auto rounded-3xl border border-line bg-panel p-0 text-ink"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="microlabel">Calculation trace</div>
            <h3 id="score-trace-title" className="mt-1 text-lg font-bold">
              {assetName}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RatingPill rating={rec.finalRating} />
              <span className="font-mono text-[11px] text-[#8e9aa5]">
                {rec.totalScore === null
                  ? "No score — insufficient evidence"
                  : `Total ${rec.totalScore.toFixed(2)} · confidence ${rec.confidence.toFixed(0)} · evidence integrity ${rec.evidenceIntegrity.toFixed(0)}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculation trace"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {rec.status === "insufficient_evidence" ? (
          <div className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3.5">
            <p className="microlabel text-[9px] text-amber">Why no rating was produced</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#ffe1c2]">
              {rec.insufficientReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Score waterfall */}
        <div className="microlabel mt-5 mb-2">Factor contributions</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left">
                {["Factor", "Weight", "Raw", "Adjustments", "Contribution"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="whitespace-nowrap border-b border-[#25303a] p-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#84919d]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rec.factorScores.map((factor) => {
                const adjustments = [
                  factor.freshnessPenalty > 0 ? `−${factor.freshnessPenalty.toFixed(1)} stale` : null,
                  factor.coveragePenalty > 0 ? `−${factor.coveragePenalty.toFixed(1)} coverage` : null,
                  factor.conflictPenalty > 0 ? `−${factor.conflictPenalty.toFixed(1)} conflict` : null,
                ].filter(Boolean);
                return (
                  <tr key={factor.factorName} className="border-b border-[#202a33] last:border-b-0">
                    <td className="p-2">
                      <span className="font-semibold">{factor.factorName}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-[#8e9aa5]">
                        {factor.rationale}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-faint">
                      {(factor.weight * 100).toFixed(0)}%
                    </td>
                    <td className="p-2 font-mono">
                      {factor.rawScore === null ? "—" : factor.rawScore.toFixed(1)}
                    </td>
                    <td className="p-2 text-[10px] text-amber">
                      {adjustments.length > 0 ? adjustments.join(", ") : "none"}
                    </td>
                    <td className="p-2 font-mono font-bold">
                      {factor.weightedContribution === null
                        ? "excluded"
                        : factor.weightedContribution.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rec.totalScore !== null ? (
          <p className="mt-2 rounded-xl border border-[#222d36] bg-panel2 p-3 font-mono text-[10px] leading-relaxed text-[#c6d0d8]">
            Sum of contributions ÷ contributing weight ({weightSum.toFixed(2)}) ={" "}
            <b className="text-ink">{rec.totalScore.toFixed(2)}</b>
            {missing.length > 0
              ? ` · ${missing.length} factor(s) excluded for lack of evidence: ${missing.map((f) => f.factorName).join(", ")}`
              : ""}
          </p>
        ) : null}

        {/* Rating gate */}
        {rec.eligibilityChecks.length > 0 ? (
          <>
            <div className="microlabel mt-5 mb-2">Strong Buy eligibility gate</div>
            <ul className="grid gap-1.5">
              {rec.eligibilityChecks.map((check) => (
                <li
                  key={check.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[11px] ${
                    check.passed
                      ? "border-[#222d36] bg-panel2 text-[#8e9aa5]"
                      : "border-amber/30 bg-amber/5 text-[#ffe1c2]"
                  }`}
                >
                  <span>
                    <b aria-hidden="true" className="mr-2 font-mono">
                      {check.passed ? "PASS" : "FAIL"}
                    </b>
                    {check.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px]">
                    {check.actual} / {check.required}
                  </span>
                </li>
              ))}
            </ul>
            {failedChecks.length > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-[#8e9aa5]">
                {failedChecks.length} check(s) failed, so Strong Buy is not available for this
                asset regardless of its score.
              </p>
            ) : null}
          </>
        ) : null}

        {rec.vetoes.length > 0 ? (
          <>
            <div className="microlabel mt-5 mb-2">Vetoes applied</div>
            <ul className="space-y-1.5">
              {rec.vetoes.map((veto) => (
                <li
                  key={veto}
                  className="rounded-xl border border-red/30 bg-red/5 p-3 text-[11px] leading-relaxed text-[#ffd0d0]"
                >
                  {veto}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/* Valuation trace */}
        {rec.valuation ? (
          <>
            <div className="microlabel mt-5 mb-2">Valuation</div>
            <div className="rounded-xl border border-[#222d36] bg-panel2 p-3.5">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div>
                  <dt className="microlabel text-[8px]">Method</dt>
                  <dd className="mt-0.5 font-semibold">{rec.valuation.method}</dd>
                </div>
                <div>
                  <dt className="microlabel text-[8px]">Calculated</dt>
                  <dd className="mt-0.5 font-semibold">
                    {rec.valuation.calculationDate.slice(0, 10)} · model {rec.valuation.modelVersion}
                  </dd>
                </div>
                <div>
                  <dt className="microlabel text-[8px]">Conservative / base / optimistic</dt>
                  <dd className="mt-0.5 font-semibold">
                    {[
                      rec.valuation.conservativeValue,
                      rec.valuation.baseValue,
                      rec.valuation.optimisticValue,
                    ]
                      .map((v) => (v === null ? "—" : formatMoney(v)))
                      .join(" / ")}
                  </dd>
                </div>
                <div>
                  <dt className="microlabel text-[8px]">Market price / margin of safety</dt>
                  <dd className="mt-0.5 font-semibold">
                    {rec.valuation.marketPrice === null
                      ? "—"
                      : formatMoney(rec.valuation.marketPrice)}{" "}
                    ·{" "}
                    {rec.marginOfSafety === null
                      ? "not measurable"
                      : `${(rec.marginOfSafety * 100).toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 text-[10px] leading-relaxed text-[#8e9aa5]">
                <b className="text-ink">Sensitivity:</b> {rec.valuation.sensitivity}
              </p>
              <div className="mt-2.5">
                <span className="microlabel text-[8px]">Assumptions</span>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-relaxed text-[#8e9aa5]">
                  {rec.valuation.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-2.5">
                <span className="microlabel text-[8px]">Limitations</span>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-relaxed text-[#8e9aa5]">
                  {rec.valuation.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}

        {/* Evidence used */}
        <div className="microlabel mt-5 mb-2">Evidence referenced</div>
        <p className="rounded-xl border border-[#222d36] bg-panel2 p-3 font-mono text-[10px] leading-relaxed text-[#8e9aa5]">
          {rec.factorScores.flatMap((f) => f.evidenceIds).length === 0
            ? "No evidence records are attached to this asset."
            : Array.from(new Set(rec.factorScores.flatMap((f) => f.evidenceIds))).join(", ")}
        </p>

        {rec.invalidationConditions.length > 0 ? (
          <>
            <div className="microlabel mt-5 mb-2">Invalidation conditions</div>
            <ul className="space-y-1.5">
              {rec.invalidationConditions.map((cond) => (
                <li
                  key={cond}
                  className="rounded-xl border border-[#222d36] bg-panel2 p-3 text-[11px] leading-relaxed text-[#c6d0d8]"
                >
                  {cond}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {rec.portfolioFit ? (
          <p className="mt-4 text-[11px] leading-relaxed text-[#8e9aa5]">
            <span className="microlabel mr-1.5 text-[8px]">Portfolio impact</span>
            {rec.portfolioFit}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
