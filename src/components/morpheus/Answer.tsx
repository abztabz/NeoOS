"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { MorpheusAnswer } from "@/domain/morpheus/answer";
import { provenanceLabels } from "@/domain/profile/provenance";

/**
 * One Morpheus answer, rendered as speech rather than as a record.
 *
 * The order on screen is the order in the contract — conclusion, why it
 * matters, action, uncertainty, evidence — but only the first two are always
 * visible. Evidence sits behind a disclosure, and that is a presentation choice
 * rather than a reduction: everything is computed, attributed, and one tap
 * away.
 *
 * Typography carries the hierarchy. The conclusion is the largest thing on the
 * card because it is the thing the reader came for, and burying it in a
 * uniform paragraph block would undo the entire point of the rewrite.
 */

export function AnswerBlock({ answer }: { answer: MorpheusAnswer }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const evidenceId = useId();

  return (
    <article
      data-testid="morpheus-answer"
      data-intent={answer.intent}
      className="grid gap-2.5"
    >
      {answer.preview ? (
        <p className="inline-flex w-fit items-center rounded-full border border-amber/40 bg-amber/5 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-amber">
          Preview content — not a statement about your position
        </p>
      ) : null}

      <p
        data-testid="answer-conclusion"
        className="text-[17px] font-semibold leading-snug text-ink sm:text-[19px]"
      >
        {answer.conclusion}
      </p>

      <p className="text-[13px] leading-relaxed text-[#a9b6c1]">{answer.whyItMatters}</p>

      {answer.action ? (
        <p
          data-testid="answer-action"
          className="rounded-xl border border-green/25 bg-green/5 px-3 py-2.5 text-[13px] leading-relaxed text-[#bdfbd5]"
        >
          {answer.action}
        </p>
      ) : null}

      {answer.uncertainty ? (
        <p
          data-testid="answer-uncertainty"
          className="text-[12px] leading-relaxed text-[#8f9daa]"
        >
          {answer.uncertainty}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {answer.evidence.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowEvidence((previous) => !previous)}
            aria-expanded={showEvidence}
            aria-controls={evidenceId}
            data-testid="evidence-toggle"
            className="inline-flex min-h-11 items-center rounded-full border border-line px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#8896a1] transition-colors hover:border-line-strong hover:text-ink"
          >
            {showEvidence ? "Hide what this rests on" : `What this rests on (${answer.evidence.length})`}
          </button>
        ) : null}

        {answer.workspace ? (
          <Link
            href={answer.workspace.href}
            data-testid="answer-workspace-link"
            className="inline-flex min-h-11 items-center rounded-full border border-cyan/35 px-3.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/10"
          >
            {answer.workspace.label}
          </Link>
        ) : null}
      </div>

      {showEvidence ? (
        <ul id={evidenceId} data-testid="evidence-list" className="grid gap-2">
          {answer.evidence.map((item) => (
            <li
              key={item.label}
              className="rounded-xl border border-[#222d36] bg-panel2 px-3 py-2.5"
            >
              <p className="text-[12px] font-semibold text-ink">{item.label}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#9aa7b3]">{item.detail}</p>
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted">
                {provenanceLabels[item.provenance]}
                {item.sourceNote ? ` · ${item.sourceNote}` : ""}
              </p>
            </li>
          ))}

          {/* Shown with the evidence rather than always: what would change his
              mind is the most useful thing on the card for a sceptical reader,
              and clutter for everyone else. */}
          {answer.decision.disconfirmation[0] !== "Not stated for this answer." ? (
            <li className="rounded-xl border border-[#2a3540] px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
                What would change my mind
              </p>
              <ul className="mt-1.5 grid gap-1">
                {answer.decision.disconfirmation.map((item) => (
                  <li key={item} className="text-[12px] leading-relaxed text-[#9aa7b3]">
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
}
