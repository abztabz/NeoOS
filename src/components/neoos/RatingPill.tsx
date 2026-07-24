const pillStyles: Record<string, string> = {
  "Strong Buy": "text-[#bdfbd5] bg-green/10 border-green/40",
  Buy: "text-[#bdfbd5] bg-green/10 border-green/30",
  Accumulate: "text-[#c8f3ff] bg-cyan/10 border-cyan/30",
  Hold: "text-[#d5dbe0] bg-[#a0aab4]/10 border-[#a0aab4]/25",
  Reduce: "text-[#ffe1c2] bg-amber/10 border-amber/30",
  Sell: "text-[#ffd0d0] bg-red/10 border-red/30",
  Avoid: "text-[#ffd0d0] bg-red/10 border-red/30",
};

/** Rating badge. The rating text itself is the primary cue; color is secondary. */
export function RatingPill({ rating }: { rating: string }) {
  const style = pillStyles[rating] ?? pillStyles.Hold;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.05em] ${style}`}
    >
      {rating}
    </span>
  );
}
