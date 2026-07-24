const pillStyles: Record<string, string> = {
  "Strong Buy": "text-[#bdfbd5] bg-green/10 border-green/40",
  Buy: "text-[#bdfbd5] bg-green/10 border-green/30",
  Accumulate: "text-[#c8f3ff] bg-cyan/10 border-cyan/30",
  Hold: "text-[#d5dbe0] bg-[#a0aab4]/10 border-[#a0aab4]/25",
  Reduce: "text-[#ffe1c2] bg-amber/10 border-amber/30",
  Sell: "text-[#ffd0d0] bg-red/10 border-red/30",
  Avoid: "text-[#ffd0d0] bg-red/10 border-red/30",
  "Insufficient Evidence": "text-[#ffe1c2] bg-amber/10 border-amber/40 border-dashed",
};

/**
 * Rating badge. The rating text itself is the primary cue; color is secondary.
 * A null rating means the engine refused to rate the asset — that is shown
 * explicitly as Insufficient Evidence, never as a neutral or default rating.
 */
export function RatingPill({ rating }: { rating: string | null }) {
  const label = rating ?? "Insufficient Evidence";
  const style = pillStyles[label] ?? pillStyles.Hold;
  return (
    <span
      data-testid={rating === null ? "insufficient-evidence-pill" : undefined}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] ${style}`}
    >
      {label}
    </span>
  );
}
