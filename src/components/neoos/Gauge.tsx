"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { deploymentBand, deploymentBands } from "@/domain/scoring";
import { regimeView } from "@/domain/report-view";
import type { NeoosReport } from "@/schemas/neoos-report";

/**
 * The Capital Deployment Gauge — the dominant hero component.
 * Server-rendered with the correct fill width so the answer is visible
 * before hydration; motion is decoration, never the content.
 */
export function Gauge({ report }: { report: NeoosReport }) {
  const { deployment } = report;
  const band = deploymentBand(deployment.score);
  const [explainOpen, setExplainOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (explainOpen && !dialog.open) dialog.showModal();
    if (!explainOpen && dialog.open) dialog.close();
  }, [explainOpen]);

  return (
    <section
      aria-label="Capital Deployment Gauge"
      className="relative mb-3.5 overflow-hidden rounded-[28px] border border-[#293540] bg-gradient-to-br from-[#121920]/[0.98] to-[#0a0e12]/[0.98] p-5 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan/[0.06] via-transparent to-green/[0.04]" />
      <div className="microlabel mb-2 text-[11px] text-[#aab6c1]">Primary Decision</div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3 sm:gap-5">
        <div>
          <h2 className="text-2xl font-bold leading-[1.03] tracking-[-0.035em] sm:text-[28px]">
            Capital Deployment Gauge
          </h2>
          <div className="mt-2 text-xs text-[#d8e1e8]">
            Market weather: <b className="text-cyan">{regimeView(report).data}</b>
          </div>
        </div>
        <div className="text-right">
          <div
            data-testid="deployment-score"
            className="text-5xl font-extrabold leading-[0.9] tracking-[-0.07em] text-amber [text-shadow:0_0_28px_rgba(242,181,107,.16)] sm:text-[58px]"
          >
            {Math.round(deployment.score)}%
          </div>
          <div className="microlabel mt-2 text-[10px]">Deployment intensity</div>
        </div>
      </div>

      <div className="mt-5">
        <div
          className="gauge-hatch relative h-[18px] overflow-hidden rounded-[7px] border border-line-strong bg-[#1b232b] p-[3px]"
          role="meter"
          aria-label="Deployment intensity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(deployment.score)}
          aria-valuetext={`${Math.round(deployment.score)} percent — ${band.label}`}
        >
          <motion.div
            data-testid="gauge-fill"
            className="h-full rounded-[4px] bg-gradient-to-r from-[#9aa7b4] via-[#dce7f0] to-amber shadow-[0_0_18px_rgba(242,181,107,.22)]"
            style={{ width: `${deployment.score}%` }}
            animate={{ width: `${deployment.score}%` }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[9px] text-faint">
          <span>PRESERVE CASH</span>
          <span>GRADUAL</span>
          <span>MAXIMUM</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 border-t border-line pt-3.5 sm:flex-row sm:items-end">
        <div>
          <span className="microlabel">Recommendation</span>
          <strong className="mt-1 block text-[22px] tracking-[-0.02em]">
            {deployment.recommendation}
          </strong>
          <small className="mt-1 block max-w-prose text-xs leading-relaxed text-[#9aa7b3]">
            {band.guidance}
          </small>
        </div>
        <div className="sm:text-right">
          <span className="microlabel">Accelerator posture</span>
          <strong className="mt-1 block text-[20px] uppercase text-amber">
            {deployment.posture}
          </strong>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExplainOpen(true)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-cyan transition-colors hover:bg-cyan/20"
      >
        Why this score?
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setExplainOpen(false)}
        aria-labelledby="gauge-explain-title"
        className="m-auto w-[min(92vw,540px)] rounded-3xl border border-line bg-panel p-0 text-ink"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="microlabel">Explainability</div>
              <h3 id="gauge-explain-title" className="mt-1 text-lg font-bold">
                Why {Math.round(deployment.score)}% — {deployment.recommendation}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setExplainOpen(false)}
              aria-label="Close explanation"
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>

          <ul className="mt-4 space-y-2.5">
            {deployment.reasons.map((reason) => (
              <li
                key={reason}
                className="rounded-xl border border-[#222d36] bg-panel2 p-3 text-xs leading-relaxed text-[#c6d0d8]"
              >
                {reason}
              </li>
            ))}
          </ul>

          <div className="microlabel mt-5 mb-2">Deployment bands</div>
          <ol className="space-y-1">
            {deploymentBands.map((b) => {
              const active = b.label === band.label;
              return (
                <li
                  key={b.label}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide ${
                    active ? "border border-amber/40 bg-amber/10 text-amber" : "text-faint"
                  }`}
                >
                  <span>
                    {b.min}–{b.max}
                  </span>
                  <span>{b.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </dialog>
    </section>
  );
}
