"use client";

import { SectionCard } from "@/components/neoos/SectionCard";
import type { CurrencyTotals, ProfileCalculations } from "@/domain/profile/calculations";
import type { PersonalisationAssessment } from "@/domain/profile/personalisation";
import { provenanceLabels, provenanceMeaning, type Attributed, type ProvenanceKind } from "@/domain/profile/provenance";

/**
 * The calculated profile, with where every number came from.
 *
 * The badge is the point. Once rendered, a figure the subject typed and a figure
 * NeoOS assumed look identical, and no amount of wording elsewhere recovers the
 * difference. So each value carries its provenance next to it, and a value that
 * cannot be computed shows what it needs instead of a dash.
 */

const TONE: Record<ProvenanceKind, string> = {
  user_fact: "border-green/40 bg-green/10 text-green",
  calculated: "border-cyan/40 bg-cyan/10 text-cyan",
  user_assumption: "border-amber/40 bg-amber/10 text-amber",
  model_assumption: "border-amber/60 bg-amber/15 text-amber",
  missing: "border-[#3a4650] bg-[#131a1f] text-[#8896a1]",
};

function Badge({ kind }: { kind: ProvenanceKind }) {
  return (
    <span
      title={provenanceMeaning[kind]}
      className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${TONE[kind]}`}
    >
      {provenanceLabels[kind]}
    </span>
  );
}

function money(totals: CurrencyTotals): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return "—";
  return entries
    .map(([currency, value]) => `${Math.round(value).toLocaleString()} ${currency}`)
    .join(" · ");
}

function Output({
  label,
  attributed,
  children,
}: {
  label: string;
  attributed: Attributed<unknown>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#222d36] bg-panel2 p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8896a1]">{label}</span>
        <Badge kind={attributed.provenance} />
      </div>

      {attributed.value === null ? (
        <p className="text-[12px] leading-relaxed text-[#8896a1]">
          Not known.{" "}
          {attributed.missing.length > 0 ? (
            <>
              Needs: <span className="text-[#c6d0d8]">{attributed.missing.join(", ")}</span>.
            </>
          ) : null}
        </p>
      ) : (
        <>
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ink">{children}</div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#7e8b96]">{attributed.basis}</p>
          {attributed.missing.length > 0 ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber">
              Excluded, because they were not declared: {attributed.missing.join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ProfileOutputs({
  calculations,
  personalisation,
}: {
  calculations: ProfileCalculations;
  personalisation: PersonalisationAssessment;
}) {
  const c = calculations;
  const stateTone =
    personalisation.state === "available"
      ? "border-green/40 bg-green/[0.07]"
      : personalisation.state === "provisional"
        ? "border-amber/40 bg-amber/[0.07]"
        : "border-[#3a4650] bg-[#101619]";

  return (
    <>
      <section
        data-testid="personalisation-state"
        data-state={personalisation.state}
        className={`card border p-4 ${stateTone}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold tracking-[0.04em]">{personalisation.label}</h3>
          <span className="microlabel">{personalisation.completeness.completeness}% COMPLETE</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[#c6d0d8]">{personalisation.meaning}</p>

        {personalisation.nextInputs.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8896a1]">
              Most useful things to add next
            </p>
            <ol className="mt-1.5 grid gap-1">
              {personalisation.nextInputs.slice(0, 5).map((input) => (
                <li key={input} className="text-[11px] text-[#c6d0d8]">
                  · {input}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <SectionCard title="YOUR POSITION" meta="CALCULATED LIVE">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Output label="Net worth" attributed={c.netWorth}>
            {money(c.netWorth.value ?? {})}
          </Output>
          <Output label="Liquid net worth" attributed={c.liquidNetWorth}>
            {money(c.liquidNetWorth.value ?? {})}
          </Output>
          <Output label="Monthly cash flow" attributed={c.monthlyCashFlow}>
            {money(c.monthlyCashFlow.value?.net ?? {})}
          </Output>
          <Output label="Reserve coverage" attributed={c.reserveCoverage}>
            {c.reserveCoverage.value
              ? `${c.reserveCoverage.value.months.toFixed(1)} of ${c.reserveCoverage.value.required} months`
              : null}
          </Output>
          <Output label="Investable cash" attributed={c.investableCash}>
            {c.investableCash.value
              ? `${Math.round(c.investableCash.value.amount).toLocaleString()} ${c.investableCash.value.currency}`
              : null}
          </Output>
          <Output label="Debt burden" attributed={c.debtBurden}>
            {c.debtBurden.value
              ? c.debtBurden.value.serviceRatio !== null
                ? `${Math.round(c.debtBurden.value.serviceRatio * 100)}% of income`
                : money(c.debtBurden.value.totalDebt)
              : null}
          </Output>
          <Output label="Risk capacity" attributed={c.riskCapacity}>
            {c.riskCapacity.value ? (
              <>
                {c.riskCapacity.value.calculated}
                {c.riskCapacity.value.disagreement ? (
                  <span className="ml-2 text-[11px] font-normal text-amber">
                    you said {c.riskCapacity.value.stated}
                  </span>
                ) : null}
              </>
            ) : null}
          </Output>
          <Output label="Concentration" attributed={c.concentrationRisk}>
            {c.concentrationRisk.value
              ? c.concentrationRisk.value.breaches.length > 0
                ? `${c.concentrationRisk.value.breaches.length} limit breached`
                : c.concentrationRisk.value.largest
                  ? `Largest ${Math.round(c.concentrationRisk.value.largest.share * 100)}%`
                  : "—"
              : null}
          </Output>
          <Output label="Deployment status" attributed={c.deploymentStatus}>
            {c.deploymentStatus.value?.headline ?? null}
          </Output>
        </div>

        {c.deploymentStatus.value ? (
          <div className="mt-3 rounded-xl border border-[#222d36] bg-panel2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8896a1]">
              Why
            </p>
            <ul className="mt-1.5 grid gap-1">
              {c.deploymentStatus.value.reasons.map((reason) => (
                <li key={reason} className="text-[12px] leading-relaxed text-[#c6d0d8]">
                  · {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {c.portfolioAllocation.value && c.portfolioAllocation.value.length > 0 ? (
          <div className="mt-3 rounded-xl border border-[#222d36] bg-panel2 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8896a1]">
                Allocation
              </p>
              <Badge kind={c.portfolioAllocation.provenance} />
            </div>
            <ul className="grid gap-1.5">
              {c.portfolioAllocation.value.map((row) => (
                <li key={row.bucket} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-[#c6d0d8]">{row.label}</span>
                  <span className="font-mono text-[11px] text-ink">{Math.round(row.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {c.concentrationRisk.value && c.concentrationRisk.value.breaches.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber/40 bg-amber/[0.07] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-amber">
              Over your own limits
            </p>
            <ul className="mt-1.5 grid gap-1">
              {c.concentrationRisk.value.breaches.map((breach) => (
                <li key={`${breach.dimension}-${breach.bucket}`} className="text-[12px] text-[#e2d3b4]">
                  · {breach.bucket} is {Math.round(breach.share * 100)}% against your{" "}
                  {Math.round(breach.limit * 100)}% limit.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
