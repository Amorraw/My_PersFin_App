// Radial gauge showing a 0-100 value with traffic-light colouring and centre text
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from "recharts";
import { COLORS, fmtPct } from "./ChartTheme";

interface Props {
  /** 0–100 */
  value:        number;
  label:        string;
  sublabel?:    string;
  color?:       string;
  size?:        number;
  formatValue?: (v: number) => string;
  /** Colour thresholds: below warn = green, below danger = amber, else red */
  warnAt?:      number;
  dangerAt?:    number;
  /** When true, higher = worse (e.g. debt ratio). When false, higher = better (e.g. goal progress). */
  invertScale?: boolean;
}

// Picks green/amber/red based on thresholds; invertScale=true treats higher as worse
function resolveColor(
  value: number,
  color: string | undefined,
  warnAt: number | undefined,
  dangerAt: number | undefined,
  invertScale: boolean,
): string {
  if (color) return color;
  if (warnAt === undefined || dangerAt === undefined) return COLORS.net;

  if (invertScale) {
    // higher is worse
    if (value >= dangerAt) return COLORS.expense;
    if (value >= warnAt)   return COLORS.debt;
    return COLORS.income;
  } else {
    // higher is better
    if (value >= dangerAt) return COLORS.income;
    if (value >= warnAt)   return "#F59E0B";
    return COLORS.expense;
  }
}

// Renders single radial gauge with resolved colour and overlaid value text
export default function ProgressGauge({
  value,
  label,
  sublabel,
  color,
  size        = 120,
  formatValue = fmtPct,
  warnAt,
  dangerAt,
  invertScale = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const fill = resolveColor(clamped, color, warnAt, dangerAt, invertScale);

  const chartData = [
    { name: label, value: clamped, fill },
  ];

  return (
    <div style={{ textAlign: "center", width: size }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="88%"
            startAngle={210}
            endAngle={-30}
            data={chartData}
            barSize={10}
          >
            {/* Track (background) */}
            <RadialBar
              dataKey="value"
              cornerRadius={6}
              background={{ fill: "#E5E7EB" }}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div style={{
                    background: "#1F2937", color: "#F9FAFB",
                    padding: "3px 8px", borderRadius: 4, fontSize: 11,
                  }}>
                    {label}: {formatValue(payload[0].value as number)}
                  </div>
                ) : null
              }
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Centre text */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: fill, lineHeight: 1.1 }}>
            {formatValue(clamped)}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginTop: 2, lineHeight: 1.3 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// Flex row wrapper for displaying several ProgressGauge components side by side
export function GaugeRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 16,
      justifyContent: "center", alignItems: "flex-start",
      padding: "8px 0",
    }}>
      {children}
    </div>
  );
}
