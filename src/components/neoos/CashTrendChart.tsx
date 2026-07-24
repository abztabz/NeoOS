"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimelineEvent } from "@/data/workspace-content";

/**
 * Small trend chart — an enhancement over the timeline list, not the content.
 * The list below carries the same information for pre-hydration and screen readers.
 */
export function CashTrendChart({ events }: { events: TimelineEvent[] }) {
  const data = events
    .filter((e) => e.cashScore != null || e.deploymentPct != null)
    .map((e) => ({ date: e.date, cash: e.cashScore, deployment: e.deploymentPct }));

  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-[#222d36] bg-panel2 p-4 text-xs text-muted">
        No scored events yet.
      </p>
    );
  }

  return (
    <div aria-hidden="true" className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke="#202a33" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#65717d" fontSize={10} tickLine={false} />
          <YAxis domain={[0, 100]} stroke="#65717d" fontSize={10} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#0d1115",
              border: "1px solid #26313b",
              borderRadius: 12,
              fontSize: 11,
              color: "#f7fafc",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }} />
          <Line
            type="monotone"
            dataKey="cash"
            name="Cash score"
            stroke="#f2b56b"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="deployment"
            name="Deployment %"
            stroke="#54d6ff"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
