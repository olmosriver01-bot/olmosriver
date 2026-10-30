"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Dot } from "recharts";

export type TrendPoint = { label: string; percent: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip
          formatter={(value) => [`${Number(value).toFixed(1)}%`, "Умумий натижа"]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="percent"
          stroke="var(--accent)"
          strokeWidth={2.5}
          dot={<Dot r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
