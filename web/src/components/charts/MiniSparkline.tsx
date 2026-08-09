// Tiny inline sparkline that colours the line green/red based on first-to-last trend
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { COLORS, fmtCAD } from "./ChartTheme";

interface Props {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}

// Returns null for single-point arrays since a trend needs at least two values
export default function MiniSparkline({
  data,
  color = COLORS.net,
  width = 80,
  height = 32,
  formatValue = fmtCAD,
}: Props) {
  if (!data || data.length < 2) return null;

  const chartData = data.map((v, i) => ({ i, v }));
  const first = data[0];
  const last  = data[data.length - 1];
  const trend = last > first ? COLORS.income : last < first ? COLORS.expense : color;

  return (
    <div style={{ width, minWidth: 0, flexShrink: 0 }}>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div style={{
                background: "#1F2937", color: "#F9FAFB",
                padding: "3px 7px", borderRadius: 4, fontSize: 10,
              }}>
                {formatValue(payload[0].value as number)}
              </div>
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke={trend}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
