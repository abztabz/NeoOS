import type { RadarSeverity } from "@/schemas/neoos-report";

export interface RadarPresentation {
  /** Glyph carries meaning alongside color (color is never the only cue). */
  glyph: string;
  colorClass: string;
  srLabel: string;
}

const presentations: Record<RadarSeverity, RadarPresentation> = {
  positive: { glyph: "↗", colorClass: "text-green", srLabel: "Positive change" },
  info: { glyph: "◎", colorClass: "text-cyan", srLabel: "Informational" },
  caution: { glyph: "▲", colorClass: "text-amber", srLabel: "Caution" },
  risk: { glyph: "✕", colorClass: "text-red", srLabel: "Risk" },
};

export function radarPresentation(severity: RadarSeverity): RadarPresentation {
  return presentations[severity];
}
