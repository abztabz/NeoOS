import { radarPresentation } from "@/domain/radar";
import type { RadarItem } from "@/schemas/neoos-report";

/** Capital Radar — only decision-relevant changes, never the whole dashboard. */
export function RadarList({ items }: { items: RadarItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
        No material changes since the last report. No news is a valid state.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {items.map((item) => {
        const p = radarPresentation(item.severity);
        return (
          <li
            key={item.id}
            className="grid grid-cols-[26px_1fr] items-start gap-2.5 rounded-[14px] border border-[#222d36] bg-panel2 p-3"
          >
            <span
              aria-hidden="true"
              className={`flex size-[26px] items-center justify-center rounded-lg bg-[#16222b] font-extrabold ${p.colorClass}`}
            >
              {p.glyph}
            </span>
            <div>
              <strong className="text-[12px]">
                <span className="sr-only">{p.srLabel}: </span>
                {item.title}
              </strong>
              <p className="mt-1 text-[11px] leading-snug text-[#84929d]">{item.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
