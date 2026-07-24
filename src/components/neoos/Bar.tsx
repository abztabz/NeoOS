/** Thin progress bar used for tier health and gold factors. */
export function Bar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#202a33]"
      role="img"
      aria-label={label ?? `${clamped} out of 100`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan to-green"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
