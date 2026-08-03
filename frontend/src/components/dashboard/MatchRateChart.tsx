"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg border border-[var(--border)] px-3 py-2 shadow-xl">
      <p className="text-xs text-[var(--foreground-subtle)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--accent-cyan)]">
        {payload[0].value.toFixed(1)}%
      </p>
    </div>
  );
}

interface MatchRateChartProps {
  data: Array<{ date: string; match_rate: number }>;
}

export default function MatchRateChart({ data }: MatchRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          horizontal={true}
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--foreground-subtle)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "var(--foreground-subtle)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="match_rate"
          stroke="#06b6d4"
          strokeWidth={2.5}
          fill="url(#chartGradient)"
          activeDot={{
            r: 6,
            fill: "#06b6d4",
            stroke: "#06b6d4",
            strokeWidth: 2,
          }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
