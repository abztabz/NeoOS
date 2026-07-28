import type { CurrencyTotals } from "@/domain/profile/calculations";
import type { Attributed, ProvenanceKind } from "@/domain/profile/provenance";

/**
 * Morpheus's voice.
 *
 * Not decoration. The rules here are the difference between a system that
 * reports and one a person will actually act on, and each exists because its
 * opposite is a specific failure:
 *
 *   - **Lead with the conclusion.** Burying it under caveats makes the reader
 *     do the judging, which is the work they came here to delegate.
 *   - **Say what is missing in terms of what it costs them**, not as a field
 *     name. "I can't tell you how much is safe to invest" beats "blocking
 *     fields: dependants".
 *   - **Never sound certain about something provisional**, and never sound
 *     mechanical about being uncertain. Both are failures of the same rule.
 *   - **No internal vocabulary in the visible sentence.** No status codes, no
 *     provenance enum names, no "personalisation unavailable".
 *
 * These helpers exist so that phrasing is a shared, tested thing rather than
 * something each component reinvents slightly differently.
 */

/* ---------------- money ---------------- */

/**
 * Money as a person would say it.
 *
 * Multi-currency totals are joined rather than summed. NeoOS will not add
 * dirhams to rupees without a rate, and a sentence is not the place to start.
 */
export function say(totals: CurrencyTotals | null): string {
  if (totals === null) return "an amount I don't know";
  const entries = Object.entries(totals).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) return "nothing";
  return entries
    .map(([currency, value]) => `${Math.round(value).toLocaleString("en-US")} ${currency}`)
    .join(" and ");
}

/** Months, rounded the way a person would say them aloud. */
export function sayMonths(months: number | null): string {
  if (months === null) return "an unknown number of months";
  if (months < 1) return "under a month";
  if (months < 2) return "about a month";
  return `about ${months.toFixed(months < 10 ? 1 : 0)} months`;
}

export function sayPercent(value: number | null, digits = 0): string {
  return value === null ? "an unknown share" : `${value.toFixed(digits)}%`;
}

/* ---------------- uncertainty ---------------- */

/**
 * How to talk about a figure given where it came from.
 *
 * Returns a clause to attach to a sentence, or null when the figure is a plain
 * declared fact and needs no qualification. Returning null for the clean case
 * matters: qualifying everything is how a system starts sounding mechanical,
 * and it trains the reader to skip the qualifications that count.
 */
export function qualify(provenance: ProvenanceKind): string | null {
  switch (provenance) {
    case "user_fact":
      return null;
    case "calculated":
      return null;
    case "user_assumption":
      return "that rests on an estimate you gave rather than a statement";
    case "model_assumption":
      return "I had to assume part of that rather than take it from your figures";
    case "missing":
      return "I don't actually have what I'd need to stand behind that";
  }
}

/** Whether a figure is solid enough to lead a sentence with. */
export function isFirm(provenance: ProvenanceKind): boolean {
  return provenance === "user_fact" || provenance === "calculated";
}

/**
 * Turn an unknown value into a sentence about the consequence.
 *
 * The example the product brief gives, generalised: name the decision the gap
 * blocks, not the field. A person can act on "I can't tell you what's safe to
 * invest"; nobody acts on "blocking fields: dependants, liabilities".
 */
export function sayMissing(what: string, blocks: string): string {
  return `I'm missing ${what}. Without it, ${blocks}.`;
}

/* ---------------- assembly ---------------- */

/**
 * Join clauses into a sentence without the comma-splice sprawl that makes
 * generated prose recognisable.
 */
export function sentence(...parts: (string | null | undefined)[]): string {
  const kept = parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  if (kept.length === 0) return "";
  return kept
    .map((part, index) => {
      const trimmed = part.trim();
      const punctuated = /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}.`;
      return index === 0 ? punctuated : ` ${punctuated}`;
    })
    .join("")
    .trim();
}

export function list(items: string[], conjunction = "and"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/* ---------------- greeting ---------------- */

export type PositionState = "no_position" | "partial_position" | "full_position" | "demo";

/**
 * The opening line.
 *
 * Short, appropriate to what NeoOS actually knows, and never cheerful about a
 * position it cannot see. A greeting that says "good morning, here's your
 * portfolio" over demo data is the first lie a product like this can tell.
 */
export function greeting(state: PositionState, hour: number): string {
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  switch (state) {
    case "demo":
      return `${timeOfDay}. You're looking at a worked example, not your money — nothing here is about your position yet.`;
    case "no_position":
      return `${timeOfDay}. I don't know anything about your position yet, so I can't tell you anything useful about your capital.`;
    case "partial_position":
      return `${timeOfDay}. I can see the broad shape of your position, though there are gaps that change what I can safely say.`;
    case "full_position":
      return `${timeOfDay}. Here's where your capital stands.`;
  }
}

/**
 * Read the position state from what is actually known.
 *
 * Kept here rather than in a component so every surface agrees on what "we know
 * enough" means.
 */
export function positionStateFrom(input: {
  hasProfile: boolean;
  isDemo: boolean;
  personalisation: "unavailable" | "provisional" | "available";
}): PositionState {
  if (input.isDemo || !input.hasProfile) return input.hasProfile ? "demo" : "no_position";
  if (input.personalisation === "available") return "full_position";
  if (input.personalisation === "provisional") return "partial_position";
  return "no_position";
}

/** Pull the weakest provenance out of a set of figures, for labelling a whole. */
export function weakestOf(values: Attributed<unknown>[]): ProvenanceKind {
  const order: ProvenanceKind[] = [
    "missing",
    "model_assumption",
    "user_assumption",
    "calculated",
    "user_fact",
  ];
  let worst: ProvenanceKind = "user_fact";
  for (const value of values) {
    if (order.indexOf(value.provenance) < order.indexOf(worst)) worst = value.provenance;
  }
  return worst;
}
