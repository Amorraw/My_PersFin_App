// Flexible grouped or stacked bar chart supporting horizontal and vertical layouts
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { AXIS_STYLE, TOOLTIP_STYLE, fmtCADShort } from "./ChartTheme";

export interface BarSeries {
  key:    string;
  label:  string;
  color:  string;
}

interface Props {
  data:         Record<string, unknown>[];
  bars:         BarSeries[];
  height?:      number;
  layout?:      "vertical" | "horizontal";
  formatY?:     (v: number) => string;
  formatX?:     (v: string) => string;
  showLegend?:  boolean;
  showValues?:  boolean;
  xKey?:        string;
  /** When true each row in data uses a single bar coloured by its own `color` field */
  colorByRow?:  boolean;
  stacked?:     boolean;
}

// Swaps axis config based on layout prop; colorByRow overrides bar fill per data row
export default function ComparisonBarChart({
  data,
  bars,
  height      = 220,
  layout      = "horizontal",
  formatY     = fmtCADShort,
  formatX,
  showLegend  = true,
  showValues  = false,
  xKey        = "name",
  colorByRow  = false,
  stacked     = false,
}: Props) {
  if (!data || data.length === 0) {
    return <EmptyChart height={height} />;
  }

  const isVertical = layout === "vertical";

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, bottom: 0, left: isVertical ? 90 : 8 }}
        barCategoryGap="28%"
        barGap={3}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#E5E7EB"
          horizontal={!isVertical}
          vertical={isVertical}
        />

        {isVertical ? (
          <>
            <XAxis
              type="number"
              tickFormatter={formatY}
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ ...AXIS_STYLE, width: 80 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatX}
              width={88}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatX}
            />
            <YAxis
              tickFormatter={formatY}
              tick={AXIS_STYLE}
              axisLine={false}
              tickLine={false}
              width={54}
            />
          </>
        )}

        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={((v: number | undefined, name: string | undefined) => [formatY(v ?? 0), name ?? ""]) as any}
        />

        {showLegend && bars.length > 1 && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          />
        )}

        {bars.map(b => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={b.color}
            radius={isVertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            stackId={stacked ? "stack" : undefined}
            maxBarSize={36}
          >
            {colorByRow &&
              data.map((row, i) => (
                <Cell key={i} fill={(row as any).color ?? b.color} />
              ))}
            {showValues && (
              <LabelList
                dataKey={b.key}
                position={isVertical ? "right" : "top"}
                formatter={((v: any) => formatY(Number(v))) as any}
                style={{ fontSize: 9, fill: "#6B7280" }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
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
