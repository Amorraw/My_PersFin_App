import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { AXIS_STYLE, TOOLTIP_STYLE, fmtCADShort, fmtMonth } from "./ChartTheme";

export interface TrendSeries {
  key:   string;
  label: string;
  color: string;
  dashed?: boolean;
}

interface Props {
  data:         Record<string, unknown>[];
  series:       TrendSeries[];
  height?:      number;
  formatX?:     (v: string) => string;
  formatY?:     (v: number) => string;
  formatTip?:   (v: number, name: string) => [string, string];
  referenceLines?: { x?: string; y?: number; label: string; color?: string }[];
  showLegend?:  boolean;
  stackAreas?:  boolean;
  xKey?:        string;
}

export default function TrendAreaChart({
  data,
  series,
  height      = 220,
  formatX     = fmtMonth,
  formatY     = fmtCADShort,
  formatTip,
  referenceLines = [],
  showLegend  = true,
  stackAreas  = false,
  xKey        = "date",
}: Props) {
  if (!data || data.length === 0) {
    return <EmptyChart height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />

        <XAxis
          dataKey={xKey}
          tickFormatter={formatX}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatY}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={54}
        />

        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(formatTip ?? ((v: any, name: any) => [formatY(Number(v ?? 0)), name ?? ""])) as any}
          labelFormatter={formatX as any}
        />

        {showLegend && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          />
        )}

        {referenceLines.map((rl, i) => (
          <ReferenceLine
            key={i}
            x={rl.x}
            y={rl.y}
            stroke={rl.color ?? "#9CA3AF"}
            strokeDasharray="4 4"
            label={{ value: rl.label, fontSize: 10, fill: rl.color ?? "#9CA3AF" }}
          />
        ))}

        {series.map(s => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            fill={stackAreas ? `url(#grad-${s.key})` : `url(#grad-${s.key})`}
            stackId={stackAreas ? "stack" : undefined}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div style={{
      height, display: "flex", alignItems: "center", justifyContent: "center",
      color: "#9CA3AF", fontSize: 13, background: "#F9FAFB", borderRadius: 8,
    }}>
      No data yet
    </div>
  );
}
