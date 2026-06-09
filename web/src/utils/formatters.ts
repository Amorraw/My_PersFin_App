// Single source of truth for all formatting helpers used across the app.
// Import from here instead of defining local variants in page files.

export { fmtCAD, fmtMoney, fmtCADShort, fmtPct, fmtMonth } from "../components/charts/ChartTheme";

/** Signed percentage with optional decimal precision: "+1.2%" / "-0.8%" */
export function fmtPctSigned(value: number, decimals = 1): string {
  const n = isFinite(value) ? value : 0;
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

/** Full date label: "Jun 8, 2026" */
export function fmtDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Percentage from a decimal ratio — fmtPctRatio(0.26) → "26.00%" */
export function fmtPctRatio(value: number, decimals = 2): string {
  const n = isFinite(value) ? value : 0;
  return `${(n * 100).toFixed(decimals)}%`;
}
