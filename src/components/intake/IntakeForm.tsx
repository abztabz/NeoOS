"use client";

import { useCallback, useMemo, useState } from "react";
import { SectionCard } from "@/components/neoos/SectionCard";
import { Field, NumberInput, RepeatableList, Select, TextInput, Toggle, TriToggle } from "@/components/intake/fields";
import { ProfileOutputs } from "@/components/intake/ProfileOutputs";
import type { IntakeSubmission } from "@/domain/intake/submission";
import { emptySubmission } from "@/domain/intake/submission";
import {
  assetKindLabels,
  assetKinds,
  commitmentKindLabels,
  commitmentKinds,
  dependentRelationships,
  goalPriorities,
  incomeFrequencies,
  incomeKindLabels,
  incomeKinds,
  incomeStability,
  INCOME_DEPENDS_ON_WORKING,
  liabilityKinds,
  liquidityTierLabels,
  liquidityTiers,
  obligationCertainties,
  obligationKindLabels,
  obligationKinds,
  successionStructureLabels,
  successionStructures,
  valuationBasisLabels,
  valuationBases,
  DEFAULT_LIQUIDITY,
  type AssetKind,
  type IncomeKind,
  type StatedAmount,
} from "@/domain/intake/types";
import { calculateProfile } from "@/domain/profile/calculations";
import { assessPersonalisation } from "@/domain/profile/personalisation";

/**
 * The intake form.
 *
 * Nothing here is required, and nothing is defaulted to a plausible number. A
 * blank stays blank all the way to storage, and the outputs panel says what each
 * blank is costing rather than filling it in. A form that demands every field
 * gets abandoned or gets invented figures, and an invented figure is worse than
 * a gap because it cannot be told apart from a fact later.
 *
 * Outputs recalculate as you type, from the same domain code the server runs. It
 * is the fastest way to show why a question is worth answering.
 */

const CURRENCY_HINT = "Three-letter code, e.g. AED or USD.";
const today = () => new Date().toISOString().slice(0, 10);

function amount(currency: string): StatedAmount {
  return { amount: null, currency, basis: "subject_estimate", asOf: today(), note: null };
}

const options = <T extends string>(values: readonly T[], labels?: Record<T, string>) =>
  values.map((value) => ({ value, label: labels?.[value] ?? value.replace(/_/g, " ") }));

export function IntakeForm({
  initial,
  onSave,
  saving,
  error,
  savedAt,
}: {
  initial: IntakeSubmission | null;
  onSave: (draft: IntakeSubmission) => void;
  saving: boolean;
  error: string | null;
  savedAt: string | null;
}) {
  const [draft, setDraft] = useState<IntakeSubmission>(initial ?? emptySubmission());

  const patch = useCallback((next: Partial<IntakeSubmission>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  const patchObjective = useCallback(
    (next: Partial<IntakeSubmission["objective"]>) => {
      setDraft((current) => ({ ...current, objective: { ...current.objective, ...next } }));
    },
    [],
  );

  const base = draft.objective.baseCurrency ?? "AED";

  // The same domain functions the server runs, so the panel cannot drift from
  // what actually gets stored.
  const { calculations, personalisation } = useMemo(() => {
    const profile = {
      schemaVersion: "6.0" as const,
      subjectId: "preview",
      profileId: "preview",
      recordedAt: new Date().toISOString(),
      supersedes: null,
      ...draft,
    };
    const calculated = calculateProfile(profile);
    return { calculations: calculated, personalisation: assessPersonalisation(profile, calculated) };
  }, [draft]);

  return (
    <form
      className="grid gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <ProfileOutputs calculations={calculations} personalisation={personalisation} />

      {/* ---------------- objectives ---------------- */}
      <SectionCard title="OBJECTIVES AND CONSTRAINTS" meta="WHAT THIS IS FOR">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Base currency" hint={CURRENCY_HINT} htmlFor="base-currency">
            <TextInput
              id="base-currency"
              maxLength={3}
              value={draft.objective.baseCurrency ?? ""}
              onChange={(value) => patchObjective({ baseCurrency: value.toUpperCase() || null })}
              placeholder="AED"
            />
          </Field>
          <Field
            label="Time horizon (years)"
            hint="How long this capital is being managed for. Generational objectives run to decades."
            htmlFor="horizon"
          >
            <NumberInput
              id="horizon"
              value={draft.objective.horizonYears}
              onChange={(value) => patchObjective({ horizonYears: value })}
            />
          </Field>
          <Field
            label="Emergency reserve (months)"
            hint="Months of obligations you want held back before any capital is deployed."
            htmlFor="reserve"
          >
            <NumberInput
              id="reserve"
              value={draft.objective.reserveMonths}
              onChange={(value) => patchObjective({ reserveMonths: value })}
            />
          </Field>
          <Field
            label="Monthly investable amount"
            hint="What you intend to invest each month. Kept separate from what NeoOS calculates you can."
            htmlFor="monthly-investable"
          >
            <NumberInput
              id="monthly-investable"
              value={draft.objective.monthlyInvestable?.amount ?? null}
              onChange={(value) =>
                patchObjective({
                  monthlyInvestable: value === null ? null : { ...amount(base), amount: value, basis: "subject_estimate" },
                })
              }
            />
          </Field>
          <Field
            label="Minimum liquid holding"
            hint="Cash you want reachable beyond the emergency reserve, for reasons you need not explain."
            htmlFor="liquidity-floor"
          >
            <NumberInput
              id="liquidity-floor"
              value={draft.objective.minimumLiquidHolding?.amount ?? null}
              onChange={(value) =>
                patchObjective({
                  minimumLiquidHolding: value === null ? null : { ...amount(base), amount: value },
                })
              }
            />
          </Field>
          <Field
            label="Drawdown you could sit through (%)"
            hint="A fall you could hold through without selling. Tolerance, not capacity — NeoOS calculates capacity separately."
            htmlFor="drawdown"
          >
            <NumberInput
              id="drawdown"
              value={draft.objective.maxDrawdownTolerancePercent}
              onChange={(value) => patchObjective({ maxDrawdownTolerancePercent: value })}
            />
          </Field>
          <Field label="Your read on your risk capacity" htmlFor="stated-capacity">
            <Select
              id="stated-capacity"
              value={draft.objective.statedRiskCapacity}
              onChange={(value) => patchObjective({ statedRiskCapacity: value })}
              options={options(["low", "moderate", "high"] as const)}
              allowEmpty
            />
          </Field>
          <Field
            label="Creation versus preservation (0–100)"
            hint="0 is pure preservation, 100 pure growth."
            htmlFor="creation"
          >
            <NumberInput
              id="creation"
              value={draft.objective.creationVersusPreservation}
              onChange={(value) => patchObjective({ creationVersusPreservation: value })}
            />
          </Field>
        </div>

        <h4 className="mt-4 mb-2 text-[12px] font-semibold">Concentration limits</h4>
        <p className="mb-3 text-[10px] leading-relaxed text-[#7e8b96]">
          Set these calmly now. They are what NeoOS checks new capital against later, when setting
          them would be harder.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["maxSingleAssetPercent", "Max in one holding (%)"],
              ["maxAssetKindPercent", "Max in one asset kind (%)"],
              ["maxCurrencyPercent", "Max in one currency (%)"],
              ["maxJurisdictionPercent", "Max in one jurisdiction (%)"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={key}>
              <NumberInput
                id={key}
                value={draft.objective[key]}
                onChange={(value) => patchObjective({ [key]: value })}
              />
            </Field>
          ))}
        </div>

        <div className="mt-4">
          <RepeatableList
            title="Goal"
            description="What this capital is for. Priority decides the order goals are abandoned in if a decade goes badly — better decided now than under pressure."
            items={draft.objective.goals}
            keyOf={(goal) => goal.goalId}
            addLabel="Add a goal"
            emptyLabel="No goals recorded."
            onAdd={() =>
              patchObjective({
                goals: [
                  ...draft.objective.goals,
                  { goalId: `goal-${Date.now()}`, label: "", targetAmount: null, targetYear: null, priority: "important", notes: null },
                ],
              })
            }
            onRemove={(index) =>
              patchObjective({ goals: draft.objective.goals.filter((_, i) => i !== index) })
            }
            render={(goal, index) => {
              const update = (next: Partial<typeof goal>) =>
                patchObjective({
                  goals: draft.objective.goals.map((g, i) => (i === index ? { ...g, ...next } : g)),
                });
              return (
                <>
                  <Field label="Goal" htmlFor={`goal-label-${index}`}>
                    <TextInput
                      id={`goal-label-${index}`}
                      value={goal.label}
                      onChange={(value) => update({ label: value })}
                      placeholder="Educate both children abroad"
                    />
                  </Field>
                  <Field label="Priority" htmlFor={`goal-priority-${index}`}>
                    <Select
                      id={`goal-priority-${index}`}
                      value={goal.priority}
                      onChange={(value) => update({ priority: value ?? "important" })}
                      options={options(goalPriorities)}
                    />
                  </Field>
                  <Field label="Target amount" htmlFor={`goal-amount-${index}`}>
                    <NumberInput
                      id={`goal-amount-${index}`}
                      value={goal.targetAmount?.amount ?? null}
                      onChange={(value) =>
                        update({ targetAmount: value === null ? null : { ...amount(base), amount: value } })
                      }
                    />
                  </Field>
                  <Field label="Target year" htmlFor={`goal-year-${index}`}>
                    <NumberInput
                      id={`goal-year-${index}`}
                      value={goal.targetYear}
                      onChange={(value) => update({ targetYear: value })}
                    />
                  </Field>
                </>
              );
            }}
          />
        </div>
      </SectionCard>

      {/* ---------------- income ---------------- */}
      <SectionCard title="INCOME" meta="WHAT COMES IN">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          The field that matters most for a generational objective is whether each source continues
          if you stop working. Earned income stops and does not transfer. Asset income persists.
        </p>
        <RepeatableList
          title="Income source"
          items={draft.incomeSources}
          keyOf={(source) => source.incomeId}
          addLabel="Add income"
          emptyLabel="No income recorded. Without it, monthly cash flow and deployable capital cannot be calculated."
          onAdd={() =>
            patch({
              incomeSources: [
                ...draft.incomeSources,
                {
                  incomeId: `income-${Date.now()}`,
                  subjectId: "preview",
                  kind: "salary",
                  label: "",
                  gross: { ...amount(base), basis: "statement_balance" },
                  frequency: "monthly",
                  stability: "stable",
                  producedByAssetId: null,
                  dependsOnSubjectWorking: "yes",
                  jurisdiction: null,
                  expectedUntil: null,
                  notes: null,
                },
              ],
            })
          }
          onRemove={(index) => patch({ incomeSources: draft.incomeSources.filter((_, i) => i !== index) })}
          render={(source, index) => {
            const update = (next: Partial<typeof source>) =>
              patch({ incomeSources: draft.incomeSources.map((s, i) => (i === index ? { ...s, ...next } : s)) });
            return (
              <>
                <Field label="What is it" htmlFor={`income-label-${index}`}>
                  <TextInput
                    id={`income-label-${index}`}
                    value={source.label}
                    onChange={(value) => update({ label: value })}
                    placeholder="Consulting retainer"
                  />
                </Field>
                <Field label="Kind" htmlFor={`income-kind-${index}`}>
                  <Select
                    id={`income-kind-${index}`}
                    value={source.kind}
                    onChange={(value) => {
                      const kind = (value ?? "other") as IncomeKind;
                      update({ kind, dependsOnSubjectWorking: INCOME_DEPENDS_ON_WORKING[kind] });
                    }}
                    options={options(incomeKinds, incomeKindLabels)}
                  />
                </Field>
                <Field label="Gross amount" htmlFor={`income-amount-${index}`}>
                  <NumberInput
                    id={`income-amount-${index}`}
                    value={source.gross.amount}
                    onChange={(value) => update({ gross: { ...source.gross, amount: value } })}
                  />
                </Field>
                <Field label="Currency" htmlFor={`income-currency-${index}`}>
                  <TextInput
                    id={`income-currency-${index}`}
                    maxLength={3}
                    value={source.gross.currency}
                    onChange={(value) => update({ gross: { ...source.gross, currency: value.toUpperCase() } })}
                  />
                </Field>
                <Field label="How often" htmlFor={`income-frequency-${index}`}>
                  <Select
                    id={`income-frequency-${index}`}
                    value={source.frequency}
                    onChange={(value) => update({ frequency: value ?? "monthly" })}
                    options={options(incomeFrequencies)}
                  />
                </Field>
                <Field
                  label="Continues if you stop working"
                  hint="Only you know whether the business runs without you."
                  htmlFor={`income-depends-${index}`}
                >
                  <Select
                    id={`income-depends-${index}`}
                    value={source.dependsOnSubjectWorking}
                    onChange={(value) => update({ dependsOnSubjectWorking: value ?? "partly" })}
                    options={[
                      { value: "no" as const, label: "Yes — it continues" },
                      { value: "partly" as const, label: "Partly" },
                      { value: "yes" as const, label: "No — it stops" },
                    ]}
                  />
                </Field>
                <Field label="How reliable" htmlFor={`income-stability-${index}`}>
                  <Select
                    id={`income-stability-${index}`}
                    value={source.stability}
                    onChange={(value) => update({ stability: value ?? "stable" })}
                    options={options(incomeStability)}
                  />
                </Field>
                <Field label="Expected to end" htmlFor={`income-until-${index}`}>
                  <TextInput
                    id={`income-until-${index}`}
                    type="date"
                    value={source.expectedUntil ?? ""}
                    onChange={(value) => update({ expectedUntil: value || null })}
                  />
                </Field>
              </>
            );
          }}
        />
      </SectionCard>

      {/* ---------------- assets ---------------- */}
      <SectionCard title="ASSETS" meta="CASH, INVESTMENTS, PROPERTY, METALS">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          One list for everything you hold — cash, investments, gold, property, a business. If you
          hold something but do not know its current value, leave the amount blank. That is a real
          answer and is very different from zero.
        </p>
        <RepeatableList
          title="Holding"
          items={draft.assets}
          keyOf={(asset) => asset.assetHoldingId}
          addLabel="Add a holding"
          emptyLabel="Nothing recorded. Net worth, concentration and any personal guidance depend on this."
          onAdd={() =>
            patch({
              assets: [
                ...draft.assets,
                {
                  assetHoldingId: `asset-${Date.now()}`,
                  subjectId: "preview",
                  kind: "cash",
                  label: "",
                  value: { ...amount(base), basis: "statement_balance" },
                  registryAssetId: null,
                  identifier: null,
                  quantity: null,
                  liquidity: "immediate",
                  jurisdiction: null,
                  custodian: null,
                  encumberedBy: null,
                  restricted: false,
                  notes: null,
                },
              ],
            })
          }
          onRemove={(index) => patch({ assets: draft.assets.filter((_, i) => i !== index) })}
          render={(asset, index) => {
            const update = (next: Partial<typeof asset>) =>
              patch({ assets: draft.assets.map((a, i) => (i === index ? { ...a, ...next } : a)) });
            return (
              <>
                <Field label="What is it" htmlFor={`asset-label-${index}`}>
                  <TextInput
                    id={`asset-label-${index}`}
                    value={asset.label}
                    onChange={(value) => update({ label: value })}
                    placeholder="Dubai flat"
                  />
                </Field>
                <Field label="Kind" htmlFor={`asset-kind-${index}`}>
                  <Select
                    id={`asset-kind-${index}`}
                    value={asset.kind}
                    onChange={(value) => {
                      const kind = (value ?? "other") as AssetKind;
                      update({ kind, liquidity: DEFAULT_LIQUIDITY[kind] });
                    }}
                    options={options(assetKinds, assetKindLabels)}
                  />
                </Field>
                <Field label="Value" htmlFor={`asset-amount-${index}`}>
                  <NumberInput
                    id={`asset-amount-${index}`}
                    value={asset.value.amount}
                    onChange={(value) => update({ value: { ...asset.value, amount: value } })}
                  />
                </Field>
                <Field label="Currency" htmlFor={`asset-currency-${index}`}>
                  <TextInput
                    id={`asset-currency-${index}`}
                    maxLength={3}
                    value={asset.value.currency}
                    onChange={(value) => update({ value: { ...asset.value, currency: value.toUpperCase() } })}
                  />
                </Field>
                <Field
                  label="How that value was arrived at"
                  hint="A market price and a number you remember are both 'the value' in conversation. NeoOS ages them differently."
                  htmlFor={`asset-basis-${index}`}
                >
                  <Select
                    id={`asset-basis-${index}`}
                    value={asset.value.basis}
                    onChange={(value) => update({ value: { ...asset.value, basis: value ?? "subject_estimate" } })}
                    options={options(valuationBases, valuationBasisLabels)}
                  />
                </Field>
                <Field label="Value as at" htmlFor={`asset-asof-${index}`}>
                  <TextInput
                    id={`asset-asof-${index}`}
                    type="date"
                    value={asset.value.asOf}
                    onChange={(value) => update({ value: { ...asset.value, asOf: value || today() } })}
                  />
                </Field>
                <Field
                  label="How quickly it sells"
                  hint="Without a forced discount."
                  htmlFor={`asset-liquidity-${index}`}
                >
                  <Select
                    id={`asset-liquidity-${index}`}
                    value={asset.liquidity}
                    onChange={(value) => update({ liquidity: value ?? "months" })}
                    options={options(liquidityTiers, liquidityTierLabels)}
                  />
                </Field>
                <Field label="Jurisdiction" htmlFor={`asset-jurisdiction-${index}`}>
                  <TextInput
                    id={`asset-jurisdiction-${index}`}
                    value={asset.jurisdiction ?? ""}
                    onChange={(value) => update({ jurisdiction: value || null })}
                    placeholder="AE"
                  />
                </Field>
                <Field
                  label="Held with"
                  hint="Bank, broker, vault. Everything behind one institution is one point of failure."
                  htmlFor={`asset-custodian-${index}`}
                >
                  <TextInput
                    id={`asset-custodian-${index}`}
                    value={asset.custodian ?? ""}
                    onChange={(value) => update({ custodian: value || null })}
                  />
                </Field>
                <Toggle
                  id={`asset-restricted-${index}`}
                  checked={asset.restricted}
                  onChange={(checked) => update({ restricted: checked })}
                  label="Locked up, vesting, or otherwise not sellable by me"
                />
              </>
            );
          }}
        />
      </SectionCard>

      {/* ---------------- liabilities ---------------- */}
      <SectionCard title="DEBTS" meta="BALANCES, RATES, PAYMENTS">
        <RepeatableList
          title="Debt"
          items={draft.liabilities}
          keyOf={(liability) => liability.liabilityId}
          addLabel="Add a debt"
          emptyLabel="None recorded. If you genuinely have none, that is worth recording as a fact rather than a blank."
          onAdd={() =>
            patch({
              liabilities: [
                ...draft.liabilities,
                {
                  liabilityId: `liability-${Date.now()}`,
                  subjectId: "preview",
                  kind: "mortgage",
                  label: "",
                  outstanding: { ...amount(base), basis: "statement_balance" },
                  paymentAmount: null,
                  paymentFrequency: "monthly",
                  interestRatePercent: null,
                  securedAgainstAssetId: null,
                  maturityDate: null,
                  notes: null,
                },
              ],
            })
          }
          onRemove={(index) => patch({ liabilities: draft.liabilities.filter((_, i) => i !== index) })}
          render={(liability, index) => {
            const update = (next: Partial<typeof liability>) =>
              patch({ liabilities: draft.liabilities.map((l, i) => (i === index ? { ...l, ...next } : l)) });
            return (
              <>
                <Field label="What is it" htmlFor={`debt-label-${index}`}>
                  <TextInput
                    id={`debt-label-${index}`}
                    value={liability.label}
                    onChange={(value) => update({ label: value })}
                    placeholder="Flat mortgage"
                  />
                </Field>
                <Field label="Kind" htmlFor={`debt-kind-${index}`}>
                  <Select
                    id={`debt-kind-${index}`}
                    value={liability.kind}
                    onChange={(value) => update({ kind: value ?? "other" })}
                    options={options(liabilityKinds)}
                  />
                </Field>
                <Field label="Outstanding balance" htmlFor={`debt-balance-${index}`}>
                  <NumberInput
                    id={`debt-balance-${index}`}
                    value={liability.outstanding.amount}
                    onChange={(value) => update({ outstanding: { ...liability.outstanding, amount: value } })}
                  />
                </Field>
                <Field label="Currency" htmlFor={`debt-currency-${index}`}>
                  <TextInput
                    id={`debt-currency-${index}`}
                    maxLength={3}
                    value={liability.outstanding.currency}
                    onChange={(value) =>
                      update({ outstanding: { ...liability.outstanding, currency: value.toUpperCase() } })
                    }
                  />
                </Field>
                <Field label="Minimum payment" htmlFor={`debt-payment-${index}`}>
                  <NumberInput
                    id={`debt-payment-${index}`}
                    value={liability.paymentAmount}
                    onChange={(value) => update({ paymentAmount: value })}
                  />
                </Field>
                <Field label="Payment frequency" htmlFor={`debt-frequency-${index}`}>
                  <Select
                    id={`debt-frequency-${index}`}
                    value={liability.paymentFrequency}
                    onChange={(value) => update({ paymentFrequency: value })}
                    options={options(incomeFrequencies)}
                    allowEmpty
                  />
                </Field>
                <Field label="Interest rate (%)" htmlFor={`debt-rate-${index}`}>
                  <NumberInput
                    id={`debt-rate-${index}`}
                    value={liability.interestRatePercent}
                    onChange={(value) => update({ interestRatePercent: value })}
                  />
                </Field>
                <Field
                  label="Matures"
                  hint="A debt with no maturity is counted as near-term, which is the cautious reading rather than one you stated."
                  htmlFor={`debt-maturity-${index}`}
                >
                  <TextInput
                    id={`debt-maturity-${index}`}
                    type="date"
                    value={liability.maturityDate ?? ""}
                    onChange={(value) => update({ maturityDate: value || null })}
                  />
                </Field>
              </>
            );
          }}
        />
      </SectionCard>

      {/* ---------------- commitments ---------------- */}
      <SectionCard title="INSURANCE AND LONG-TERM COMMITMENTS" meta="COST AND COVER">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          A policy is two facts. What it costs reduces what you can invest. What it pays out is the
          only asset that arrives exactly when income stops. Recording only the premium makes
          insurance look like a pure cost.
        </p>
        <RepeatableList
          title="Commitment"
          items={draft.commitments}
          keyOf={(commitment) => commitment.commitmentId}
          addLabel="Add a commitment"
          emptyLabel="None recorded. With no cover recorded, a shock lands directly on the portfolio."
          onAdd={() =>
            patch({
              commitments: [
                ...draft.commitments,
                {
                  commitmentId: `commitment-${Date.now()}`,
                  subjectId: "preview",
                  kind: "life_insurance",
                  label: "",
                  premium: { ...amount(base), basis: "statement_balance" },
                  premiumFrequency: "monthly",
                  coverAmount: null,
                  beneficiary: null,
                  endsOn: null,
                  cancellable: null,
                  jurisdiction: null,
                  notes: null,
                },
              ],
            })
          }
          onRemove={(index) => patch({ commitments: draft.commitments.filter((_, i) => i !== index) })}
          render={(commitment, index) => {
            const update = (next: Partial<typeof commitment>) =>
              patch({ commitments: draft.commitments.map((c, i) => (i === index ? { ...c, ...next } : c)) });
            return (
              <>
                <Field label="What is it" htmlFor={`commitment-label-${index}`}>
                  <TextInput
                    id={`commitment-label-${index}`}
                    value={commitment.label}
                    onChange={(value) => update({ label: value })}
                  />
                </Field>
                <Field label="Kind" htmlFor={`commitment-kind-${index}`}>
                  <Select
                    id={`commitment-kind-${index}`}
                    value={commitment.kind}
                    onChange={(value) => update({ kind: value ?? "other" })}
                    options={options(commitmentKinds, commitmentKindLabels)}
                  />
                </Field>
                <Field label="Premium" htmlFor={`commitment-premium-${index}`}>
                  <NumberInput
                    id={`commitment-premium-${index}`}
                    value={commitment.premium?.amount ?? null}
                    onChange={(value) =>
                      update({
                        premium: value === null ? null : { ...(commitment.premium ?? amount(base)), amount: value },
                      })
                    }
                  />
                </Field>
                <Field label="Premium frequency" htmlFor={`commitment-frequency-${index}`}>
                  <Select
                    id={`commitment-frequency-${index}`}
                    value={commitment.premiumFrequency}
                    onChange={(value) => update({ premiumFrequency: value })}
                    options={options(incomeFrequencies)}
                    allowEmpty
                  />
                </Field>
                <Field
                  label="Amount it pays out"
                  hint="Leave blank where the commitment is a cost with no cover."
                  htmlFor={`commitment-cover-${index}`}
                >
                  <NumberInput
                    id={`commitment-cover-${index}`}
                    value={commitment.coverAmount?.amount ?? null}
                    onChange={(value) =>
                      update({
                        coverAmount: value === null ? null : { ...(commitment.coverAmount ?? amount(base)), amount: value },
                      })
                    }
                  />
                </Field>
                <Field label="Who it pays" htmlFor={`commitment-beneficiary-${index}`}>
                  <TextInput
                    id={`commitment-beneficiary-${index}`}
                    value={commitment.beneficiary ?? ""}
                    onChange={(value) => update({ beneficiary: value || null })}
                  />
                </Field>
              </>
            );
          }}
        />
      </SectionCard>

      {/* ---------------- future obligations ---------------- */}
      <SectionCard title="KNOWN FUTURE OBLIGATIONS" meta="COSTS ALREADY COMING">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          A school fee due in four years changes what is deployable today. Capital earmarked for a
          known cost is not available, and treating it as available is how a family ends up selling
          at the wrong moment to meet a bill they saw coming for years.
        </p>
        <RepeatableList
          title="Obligation"
          items={draft.futureObligations}
          keyOf={(obligation) => obligation.obligationId}
          addLabel="Add an obligation"
          emptyLabel="None recorded."
          onAdd={() =>
            patch({
              futureObligations: [
                ...draft.futureObligations,
                {
                  obligationId: `obligation-${Date.now()}`,
                  subjectId: "preview",
                  kind: "education",
                  label: "",
                  amount: { ...amount(base) },
                  dueYear: null,
                  certainty: "likely",
                  fundedByAssetId: null,
                  notes: null,
                },
              ],
            })
          }
          onRemove={(index) =>
            patch({ futureObligations: draft.futureObligations.filter((_, i) => i !== index) })
          }
          render={(obligation, index) => {
            const update = (next: Partial<typeof obligation>) =>
              patch({
                futureObligations: draft.futureObligations.map((o, i) => (i === index ? { ...o, ...next } : o)),
              });
            return (
              <>
                <Field label="What is it" htmlFor={`obligation-label-${index}`}>
                  <TextInput
                    id={`obligation-label-${index}`}
                    value={obligation.label}
                    onChange={(value) => update({ label: value })}
                  />
                </Field>
                <Field label="Kind" htmlFor={`obligation-kind-${index}`}>
                  <Select
                    id={`obligation-kind-${index}`}
                    value={obligation.kind}
                    onChange={(value) => update({ kind: value ?? "other" })}
                    options={options(obligationKinds, obligationKindLabels)}
                  />
                </Field>
                <Field label="Amount" htmlFor={`obligation-amount-${index}`}>
                  <NumberInput
                    id={`obligation-amount-${index}`}
                    value={obligation.amount?.amount ?? null}
                    onChange={(value) =>
                      update({ amount: value === null ? null : { ...(obligation.amount ?? amount(base)), amount: value } })
                    }
                  />
                </Field>
                <Field label="Due year" htmlFor={`obligation-year-${index}`}>
                  <NumberInput
                    id={`obligation-year-${index}`}
                    value={obligation.dueYear}
                    onChange={(value) => update({ dueYear: value })}
                  />
                </Field>
                <Field
                  label="How firm"
                  hint="Only committed obligations are held back from deployable capital."
                  htmlFor={`obligation-certainty-${index}`}
                >
                  <Select
                    id={`obligation-certainty-${index}`}
                    value={obligation.certainty}
                    onChange={(value) => update({ certainty: value ?? "possible" })}
                    options={options(obligationCertainties)}
                  />
                </Field>
              </>
            );
          }}
        />
      </SectionCard>

      {/* ---------------- household ---------------- */}
      <SectionCard title="WHO THIS IS FOR" meta="HOUSEHOLD AND SUCCESSION">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Recurring household obligations, monthly"
            hint="Living costs, separate from debt payments. The other half of sizing a reserve."
            htmlFor="household-obligations"
          >
            <NumberInput
              id="household-obligations"
              value={draft.household.monthlyObligations?.amount ?? null}
              onChange={(value) =>
                patch({
                  household: {
                    ...draft.household,
                    monthlyObligations:
                      value === null ? null : { ...(draft.household.monthlyObligations ?? amount(base)), amount: value },
                  },
                })
              }
            />
          </Field>
          <Field label="Succession structure" htmlFor="succession">
            <Select
              id="succession"
              value={draft.household.succession.structure}
              onChange={(value) =>
                patch({
                  household: {
                    ...draft.household,
                    succession: { ...draft.household.succession, structure: value ?? "unknown" },
                  },
                })
              }
              options={options(successionStructures, successionStructureLabels)}
            />
          </Field>
          <TriToggle
            id="continuity"
            label="Could anyone else take over these affairs?"
            hint="A single point of failure in a family's finances is a preservation risk no allocation offsets."
            value={draft.household.continuityContactExists}
            onChange={(value) =>
              patch({ household: { ...draft.household, continuityContactExists: value } })
            }
          />
          <TriToggle
            id="succession-reviewed"
            label="Does it still reflect your intent?"
            value={draft.household.succession.reviewedRecently}
            onChange={(value) =>
              patch({
                household: {
                  ...draft.household,
                  succession: { ...draft.household.succession, reviewedRecently: value },
                },
              })
            }
          />
        </div>

        <div className="mt-4">
          <RepeatableList
            title="Dependent"
            description="Support commonly flows to parents and siblings as well as children. Support that never ends is a perpetuity rather than a horizon, and it is a different problem."
            items={draft.household.dependents}
            keyOf={(dependent) => dependent.dependentId}
            addLabel="Add a dependent"
            emptyLabel="None recorded. A system that speaks about protecting a family while not knowing whether there is one is performing concern."
            onAdd={() =>
              patch({
                household: {
                  ...draft.household,
                  dependents: [
                    ...draft.household.dependents,
                    {
                      dependentId: `dependent-${Date.now()}`,
                      relationship: "child",
                      label: "",
                      birthYear: null,
                      financiallySupported: true,
                      supportExpectedUntilYear: null,
                      supportIsIndefinite: false,
                      anticipatedObligation: null,
                      notes: null,
                    },
                  ],
                },
              })
            }
            onRemove={(index) =>
              patch({
                household: {
                  ...draft.household,
                  dependents: draft.household.dependents.filter((_, i) => i !== index),
                },
              })
            }
            render={(dependent, index) => {
              const update = (next: Partial<typeof dependent>) =>
                patch({
                  household: {
                    ...draft.household,
                    dependents: draft.household.dependents.map((d, i) => (i === index ? { ...d, ...next } : d)),
                  },
                });
              return (
                <>
                  <Field label="Who" hint="Any label. A real name is never required." htmlFor={`dependent-label-${index}`}>
                    <TextInput
                      id={`dependent-label-${index}`}
                      value={dependent.label}
                      onChange={(value) => update({ label: value })}
                    />
                  </Field>
                  <Field label="Relationship" htmlFor={`dependent-relationship-${index}`}>
                    <Select
                      id={`dependent-relationship-${index}`}
                      value={dependent.relationship}
                      onChange={(value) => update({ relationship: value ?? "other" })}
                      options={options(dependentRelationships)}
                    />
                  </Field>
                  <Toggle
                    id={`dependent-supported-${index}`}
                    checked={dependent.financiallySupported}
                    onChange={(checked) => update({ financiallySupported: checked })}
                    label="I support them financially"
                  />
                  <Toggle
                    id={`dependent-indefinite-${index}`}
                    checked={dependent.supportIsIndefinite}
                    onChange={(checked) => update({ supportIsIndefinite: checked })}
                    label="That support does not have an end"
                  />
                  <Field label="Supported until (year)" htmlFor={`dependent-until-${index}`}>
                    <NumberInput
                      id={`dependent-until-${index}`}
                      value={dependent.supportExpectedUntilYear}
                      onChange={(value) => update({ supportExpectedUntilYear: value })}
                    />
                  </Field>
                  <Field label="Cost you are planning for" htmlFor={`dependent-obligation-${index}`}>
                    <TextInput
                      id={`dependent-obligation-${index}`}
                      value={dependent.anticipatedObligation ?? ""}
                      onChange={(value) => update({ anticipatedObligation: value || null })}
                    />
                  </Field>
                </>
              );
            }}
          />
        </div>
      </SectionCard>

      {/* ---------------- exchange rates ---------------- */}
      <SectionCard title="EXCHANGE RATES" meta="YOUR FIGURES, NOT OURS">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          Currency exposure is the one measure that cannot be produced without conversion. NeoOS has
          no rate provider and will not invent one, so supply rates you are willing to stand behind.
          Anything computed from them is marked as your assumption, never as a hard figure.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[...new Set(draft.assets.map((a) => a.value.currency))]
            .filter((currency) => currency !== draft.objective.baseCurrency && currency.length === 3)
            .map((currency) => (
              <Field
                key={currency}
                label={`1 ${currency} in ${draft.objective.baseCurrency ?? "base currency"}`}
                htmlFor={`rate-${currency}`}
              >
                <NumberInput
                  id={`rate-${currency}`}
                  value={draft.objective.exchangeRatesToBase[currency] ?? null}
                  onChange={(value) => {
                    const rates = { ...draft.objective.exchangeRatesToBase };
                    if (value === null) delete rates[currency];
                    else rates[currency] = value;
                    patchObjective({ exchangeRatesToBase: rates });
                  }}
                />
              </Field>
            ))}
          {draft.assets.every((a) => a.value.currency === draft.objective.baseCurrency) ? (
            <p className="text-[11px] text-[#7e8b96]">
              Everything is in one currency, so no rate is needed.
            </p>
          ) : null}
        </div>
      </SectionCard>

      {/* ---------------- save ---------------- */}
      <SectionCard title="SAVE" meta="APPEND-ONLY">
        <p className="mb-3 text-[11px] leading-relaxed text-[#9aa7b3]">
          Saving writes a new version. The figures being replaced stay readable, so a revaluation
          shows up as a revaluation rather than disappearing. Nothing is edited in place.
        </p>
        {error ? (
          <p role="alert" className="mb-3 rounded-lg border border-[#5a343c] bg-[#1a0f12] px-3 py-2 text-[12px] text-[#e39ba5]">
            {error}
          </p>
        ) : null}
        {savedAt ? (
          <p role="status" className="mb-3 text-[12px] text-green">
            Saved at {new Date(savedAt).toLocaleTimeString()}.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 w-full rounded-lg bg-gradient-to-r from-cyan to-green px-4 text-[13px] font-bold text-[#071015] disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {saving ? "Saving…" : "Save this version"}
        </button>
      </SectionCard>
    </form>
  );
}
