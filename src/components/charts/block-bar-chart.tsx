"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

type Datum = { blockId: number; shortTitle: string; percent: number; statusLabel: string };

const STATUS_COLOR: Record<string, string> = {
  Қониқарсиз: "#dc2626",
  Заиф: "#d97706",
  Яхши: "#16a34a",
  Кучли: "#2563eb",
};

export function BlockBarChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 50 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="shortTitle"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          interval={0}
          angle={-25}
          textAnchor="end"
          height={60}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value, _name, item) => [`${Number(value).toFixed(0)}% (${item.payload.statusLabel})`, "Натижа"]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="percent" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {data.map((d, i) => (
            <Cell key={i} fill={STATUS_COLOR[d.statusLabel] ?? "#2563eb"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
