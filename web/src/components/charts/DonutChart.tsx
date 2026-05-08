import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PALETTE, TOOLTIP_STYLE, categoryColor, fmtCAD, fmtPct } from "./ChartTheme";

export interface DonutSlice {
  name:   string;
  value:  number;
  color?: string;
}

interface Props {
  data:          DonutSlice[];
  height?:       number;
  innerRadius?:  number;
  outerRadius?:  number;
  formatValue?:  (v: number) => string;
  showLegend?:   boolean;
  showLabels?:   boolean;
  centerLabel?:  string;
  centerValue?:  string;
}

export default function DonutChart({
  data,
  height       = 220,
  innerRadius  = 55,
  outerRadius  = 85,
  formatValue  = fmtCAD,
  showLegend   = true,
  showLabels   = false,
  centerLabel,
  centerValue,
}: Props) {
  if (!data || data.length === 0) {
    return <EmptyChart height={height} />;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  const renderCustomLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent,
  }: any) => {
    if (!showLabels || percent < 0.05) return null;
    const R = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + R * Math.cos(-midAngle * (Math.PI / 180));
    const y = cy + R * Math.sin(-midAngle * (Math.PI / 180));
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={600}>
        {fmtPct(percent * 100)}
      </text>
    );
  };

  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="value"
            paddingAngle={2}
            labelLine={false}
            label={showLabels ? renderCustomLabel : undefined}
          >
            {data.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={entry.color ?? categoryColor(entry.name, i)}
                stroke="none"
              />
            ))}
          </Pie>

          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={((v: number | undefined, name: string | undefined) => [
              v != null ? `${formatValue(v)}  (${fmtPct((v / total) * 100)})` : "—",
              name ?? "",
            ]) as any}
          />

          {showLegend && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value, entry: any) => (
                <span style={{ color: "#374151" }}>
                  {value} — {formatValue(entry.payload.value)}
                </span>
              )}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      {/* Centre label for donut */}
      {(centerLabel || centerValue) && innerRadius > 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center", pointerEvents: "none",
          marginTop: showLegend ? -16 : 0,
        }}>
          {centerValue && (
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
              {centerValue}
            </div>
          )}
          {centerLabel && (
            <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>
              {centerLabel}
            </div>
          )}
        </div>
      )}
    </div>
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
