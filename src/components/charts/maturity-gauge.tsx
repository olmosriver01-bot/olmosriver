"use client";

import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";

export function MaturityGauge({ percent, color }: { percent: number; color: string }) {
  const data = [{ value: percent, fill: color }];
  return (
    <div className="relative mx-auto h-40 w-40">
      <RadialBarChart
        width={160}
        height={160}
        cx="50%"
        cy="50%"
        innerRadius="75%"
        outerRadius="100%"
        barSize={14}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: "var(--surface-muted)" }} dataKey="value" cornerRadius={8} />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{percent.toFixed(0)}%</span>
      </div>
    </div>
  );
}
