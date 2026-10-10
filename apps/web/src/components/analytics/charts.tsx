"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

type Row = Record<string, string | number>;

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      Not enough data yet.
    </div>
  );
}

export function SimpleBar({
  data,
  xKey,
  barKey,
  color = "hsl(var(--chart-2))",
  unit = "",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  barKey: string;
  color?: string;
  unit?: string;
  height?: number;
}) {
  if (!data.length) return <Empty height={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20, right: 12, top: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}${unit}`, barKey]} cursor={{ fill: "hsl(var(--muted))" }} />
          <Bar dataKey={barKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLine({
  data,
  xKey,
  lineKey,
  color = "hsl(var(--chart-1))",
  unit = "",
  height = 240,
}: {
  data: Row[];
  xKey: string;
  lineKey: string;
  color?: string;
  unit?: string;
  height?: number;
}) {
  if (!data.length) return <Empty height={height} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20, right: 12, top: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}${unit}`, lineKey]} />
          <Line type="monotone" dataKey={lineKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
