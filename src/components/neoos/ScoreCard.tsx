const toneClasses = {
  neutral: "text-ink",
  cyan: "text-cyan",
  green: "text-green",
  amber: "text-amber",
  red: "text-red",
} as const;

export type ScoreTone = keyof typeof toneClasses;

export function ScoreCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: ScoreTone;
}) {
  return (
    <div className="card min-h-[104px] rounded-[18px] p-3.5">
      <div className="microlabel text-[9px]">{label}</div>
      <div className={`mt-3 text-[27px] font-extrabold tracking-[-0.04em] ${toneClasses[tone]}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-[#7f8b96]">{note}</div>
    </div>
  );
}
