import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer, LabelList,
} from "recharts";
import { COLORS, AXIS_STYLE, TOOLTIP_STYLE, fmtCADShort, fmtCAD } from "./ChartTheme";

export interface WaterfallEntry {
  name:   string;
  value:  number;
  /** "total" = full bar from zero (gross, net pay); "delta" = floating bar */
  type?:  "total" | "delta";
  color?: string;
}

interface ChartRow {
  name:       string;
  base:       number;
  bar:        number;
  fill:       string;
  rawValue:   number;
  isTotal:    boolean;
}

function buildRows(entries: WaterfallEntry[]): ChartRow[] {
  let running = 0;
  return entries.map(entry => {
    const isTotal = entry.type === "total";
    const absVal  = Math.abs(entry.value);
    const isNeg   = entry.value < 0;

    let base: number;
    if (isTotal) {
      base    = 0;
      running = entry.value > 0 ? entry.value : running;
    } else {
      base    = isNeg ? running - absVal : running;
      running = running + entry.value;
    }

    const fill = entry.color ?? (
      isTotal ? COLORS.assets :
      isNeg   ? COLORS.expense :
                COLORS.income
    );

    return { name: entry.name, base, bar: absVal, fill, rawValue: entry.value, isTotal };
  });
}

interface Props {
  data:        WaterfallEntry[];
  height?:     number;
  formatY?:    (v: number) => string;
  formatTip?:  (v: number) => string;
}

export default function WaterfallChart({
  data,
  height     = 220,
  formatY    = fmtCADShort,
  formatTip  = fmtCAD,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#9CA3AF", fontSize: 13, background: "#F9FAFB", borderRadius: 8,
      }}>
        No data yet
      </div>
    );
  }

  const rows = buildRows(data);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.[1]) return null;
    const row = rows.find(r => r.name === label);
    return (
      <div style={{
        ...TOOLTIP_STYLE.contentStyle,
        padding: "6px 10px",
      }}>
        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 12 }}>{label}</div>
        <div style={{ fontSize: 12, color: row?.fill }}>
          {formatTip(row?.rawValue ?? 0)}
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ ...AXIS_STYLE, fontSize: 9 }}
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
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />

        {/* Transparent spacer bar — lifts the visible bar to the right position */}
        <Bar dataKey="base" stackId="w" fill="transparent" legendType="none" />

        {/* Visible value bar */}
        <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]} maxBarSize={44}>
          {rows.map((row, i) => (
            <Cell key={i} fill={row.fill} />
          ))}
          <LabelList
            dataKey="bar"
            position="top"
            formatter={((v: any, _: any, index: number) =>
              formatY(rows[index]?.rawValue ?? Number(v))
            ) as any}
            style={{ fontSize: 9, fill: "#6B7280" }}
          />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
