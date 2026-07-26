"use client";

import type { ReactNode } from "react";

/**
 * Form primitives for intake.
 *
 * Every control has a real label tied to its control, a hit area that clears
 * 44px, and an optional hint that says why the question is being asked. The
 * hint matters more than usual here: a form that asks a household for its
 * succession arrangements without saying why reads as intrusive, and people
 * abandon it.
 */

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold tracking-[0.02em] text-[#c6d0d8]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[10px] leading-relaxed text-[#7e8b96]">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  "min-h-11 w-full rounded-lg border border-[#27323b] bg-[#0b1014] px-3 py-2 text-[13px] text-ink placeholder:text-[#5d6b76] focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan";

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: "text" | "decimal" | "numeric";
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      maxLength={maxLength}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    />
  );
}

/**
 * A number that may be empty.
 *
 * Empty means not known and is preserved as null all the way to storage. It is
 * never coerced to zero, because "I do not know what this is worth" and "this is
 * worth nothing" are entirely different facts about a position.
 */
export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={value === null ? "" : String(value)}
      placeholder={placeholder ?? "Leave blank if not known"}
      onChange={(event) => {
        const raw = event.target.value.replace(/[,\s]/g, "");
        if (raw === "") return onChange(null);
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      className={CONTROL}
    />
  );
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "Not known",
}: {
  id: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(event) => onChange((event.target.value || null) as T | null)}
      className={CONTROL}
    >
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[12px] text-[#c6d0d8]">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-[#27323b] bg-[#0b1014] accent-cyan"
      />
      {label}
    </label>
  );
}

/** Three-state: yes, no, or not answered. Not answered is a real answer here. */
export function TriToggle({
  id,
  value,
  onChange,
  label,
  hint,
}: {
  id: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  label: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Select
        id={id}
        value={value === null ? null : value ? "yes" : "no"}
        onChange={(next) => onChange(next === null ? null : next === "yes")}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        allowEmpty
        emptyLabel="Not answered"
      />
    </Field>
  );
}

/**
 * A repeatable list of records.
 *
 * Rows are removable and nothing is required. A form that will not let someone
 * proceed without filling every field is a form that gets abandoned or filled
 * with invented numbers, and an invented number is worse than a blank.
 */
export function RepeatableList<T>({
  title,
  description,
  items,
  onAdd,
  onRemove,
  addLabel,
  emptyLabel,
  render,
  keyOf,
}: {
  title: string;
  description?: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel: string;
  emptyLabel: string;
  render: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <h4 className="text-[12px] font-semibold tracking-[0.02em]">{title}</h4>
        {description ? (
          <p className="mt-1 text-[10px] leading-relaxed text-[#7e8b96]">{description}</p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#27323b] px-3 py-4 text-center text-[11px] text-[#7e8b96]">
          {emptyLabel}
        </p>
      ) : null}

      {items.map((item, index) => (
        <fieldset key={keyOf(item, index)} className="rounded-xl border border-[#222d36] bg-panel2 p-3">
          <legend className="px-1 font-mono text-[9px] uppercase tracking-wider text-[#7e8b96]">
            {title} {index + 1}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">{render(item, index)}</div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="mt-3 min-h-11 rounded-lg border border-[#3a2429] px-3 text-[11px] text-[#d98b95] hover:border-[#5a343c]"
          >
            Remove
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="min-h-11 rounded-lg border border-[#27323b] px-3 text-[12px] font-semibold text-cyan hover:border-cyan"
      >
        {addLabel}
      </button>
    </div>
  );
}
