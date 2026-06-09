// Shared colours, formatters, and Recharts style tokens used by all chart components
// ── Shared colour palette ────────────────────────────────────────────────────

export const COLORS = {
  income:      "#10B981",
  expense:     "#EF4444",
  net:         "#6366F1",
  assets:      "#3B82F6",
  liabilities: "#F59E0B",
  savings:     "#8B5CF6",
  debt:        "#F97316",
  rrsp:        "#A78BFA",
  tfsa:        "#34D399",
  cash:        "#6EE7B7",
  property:    "#FB923C",
  neutral:     "#9CA3AF",
};

// Ordered palette for arbitrary series (pie slices, stacked bars, etc.)
export const PALETTE = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#F97316", "#14B8A6",
  "#EC4899", "#84CC16", "#06B6D4", "#A78BFA",
];

// Spending-category colours
export const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining":   "#F59E0B",
  "Transport":       "#3B82F6",
  "Housing":         "#10B981",
  "Entertainment":   "#8B5CF6",
  "Healthcare":      "#EF4444",
  "Shopping":        "#F97316",
  "Utilities":       "#14B8A6",
  "Education":       "#6366F1",
  "Personal Care":   "#EC4899",
  "Travel":          "#06B6D4",
  "Savings":         "#84CC16",
  "Other":           "#9CA3AF",
};

// Falls back to the rotating PALETTE when a category has no named colour
export function categoryColor(name: string, index: number): string {
  return CATEGORY_COLORS[name] ?? PALETTE[index % PALETTE.length];
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function fmtCAD(value: number): string {
  const n = isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-CA", {
    style: "currency", currency: "CAD", maximumFractionDigits: 0,
  }).format(n);
}

/** CAD with 2 decimal places and thousands commas — use for precise monetary display. */
export function fmtMoney(value: number): string {
  const n = isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-CA", {
    style: "currency", currency: "CAD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

// Abbreviates large values to K/M for compact axis labels
export function fmtCADShort(value: number): string {
  const n = isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000)    return `${sign}$${Math.round(abs / 1_000)}K`;
  return fmtCAD(n);
}

export function fmtPct(value: number): string {
  return `${(isFinite(value) ? value : 0).toFixed(1)}%`;
}

export function fmtMonth(value: string): string {
  // Accepts "2024-03" or ISO date strings
  const d = new Date(value.length === 7 ? `${value}-01` : value);
  return d.toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
}

// ── Shared axis / tooltip styles ────────────────────────────────────────────

export const AXIS_STYLE = {
  fontSize: 10,
  fill: "#9CA3AF",
};

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  labelStyle: { fontWeight: 600, color: "#111827", marginBottom: 4 },
  itemStyle:  { color: "#374151" },
};

export const DARK_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1F2937",
    border: "1px solid #374151",
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  labelStyle: { fontWeight: 600, color: "#F9FAFB", marginBottom: 4 },
  itemStyle:  { color: "#D1D5DB" },
};
