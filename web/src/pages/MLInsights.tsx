// ML Insights page: spending forecast, anomaly detection, and budget suggestions via Python service
import { useState } from "react";
import { api } from "../api";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import './MLInsights.css';
import { fmtCADShort } from "../components/charts";
import { fmtCAD as CAD } from "../utils/formatters";

// ── Types ────────────────────────────────────────────────────────────────────

interface HistPoint { month: string; amount: number; low?: number; high?: number; }
interface ForecastData {
  historical: HistPoint[];
  forecast: HistPoint[];   // each point has amount (median), low (P25), high (P75)
  trend: "up" | "down" | "stable";
}
interface ForecastResult {
  forecasts: Record<string, ForecastData>;
  months_forecast: number;
}
interface AnomalyTxn {
  id: string; amount: number; category: string; date: string;
  description: string; anomalyScore: number; zScore: number; reason: string;
}
interface AnomalyResult {
  anomalies: AnomalyTxn[];
  totalScanned: number;
  anomalyCount: number;
  message?: string;
}
interface BudgetSuggestion {
  category: string; suggestedBudget: number; historicalMean: number;
  historicalMedian: number; historicalStd: number; p75: number;
  trend: "increasing" | "decreasing" | "stable";
  monthsAnalyzed: number; confidence: "high" | "medium" | "low";
}
interface BudgetResult { suggestions: BudgetSuggestion[]; monthsAnalyzed: number; }

type AnalysisRange = "1y" | "2y" | "3y" | "all";

const RANGE_LABELS: Record<AnalysisRange, string> = {
  "1y": "1 Year",
  "2y": "2 Years",
  "3y": "3 Years",
  "all": "All Time",
};

// Longer analysis periods unlock longer forecast horizons — more history backs a more reliable long-range forecast
const FORECAST_AHEAD_OPTIONS: Record<AnalysisRange, number[]> = {
  "1y": [1, 3, 6],
  "2y": [1, 3, 6, 12],
  "3y": [1, 3, 6, 12, 24],
  "all": [1, 3, 6, 12, 24],
};

// ── Component ────────────────────────────────────────────────────────────────

// Renders three independent ML tool sections with run buttons and result tables
export default function MLInsights() {
  const [analysisRange, setAnalysisRange] = useState<AnalysisRange>("1y");
  const [forecastMonths, setForecastMonths] = useState(3);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [forecastCat, setForecastCat] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);

  const [anomalyResult, setAnomalyResult] = useState<AnomalyResult | null>(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  const [budgetResult, setBudgetResult] = useState<BudgetResult | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [mlError, setMlError] = useState<string | null>(null);

  const clearError = () => setMlError(null);

  const changeAnalysisRange = (next: AnalysisRange) => {
    setAnalysisRange(next);
    // Clamp forecastMonths to a horizon available for the new range (3 months always valid)
    if (!FORECAST_AHEAD_OPTIONS[next].includes(forecastMonths)) setForecastMonths(3);
  };

  const runForecast = async () => {
    clearError();
    setForecastLoading(true);
    try {
      const data: ForecastResult = await api("/ml/forecast", {
        method: "POST",
        body: JSON.stringify({ months: forecastMonths, range: analysisRange }),
      });
      setForecastResult(data);
      const cats = Object.keys(data.forecasts);
      if (cats.length) setForecastCat(cats[0]);
    } catch (err: any) {
      setMlError(err.status === 502
        ? "Python ML service is not running. Start it with: cd python-ml && uvicorn main:app --port 8000"
        : err.message || "Forecast failed");
    } finally {
      setForecastLoading(false);
    }
  };

  const runAnomalies = async () => {
    clearError();
    setAnomalyLoading(true);
    try {
      const data: AnomalyResult = await api("/ml/anomalies", {
        method: "POST",
        body: JSON.stringify({ range: analysisRange }),
      });
      setAnomalyResult(data);
    } catch (err: any) {
      setMlError(err.message || "Anomaly scan failed");
    } finally {
      setAnomalyLoading(false);
    }
  };

  const runBudget = async () => {
    clearError();
    setBudgetLoading(true);
    try {
      const data: BudgetResult = await api("/ml/suggest-budgets", {
        method: "POST",
        body: JSON.stringify({ range: analysisRange }),
      });
      setBudgetResult(data);
    } catch (err: any) {
      setMlError(err.message || "Budget suggestion failed");
    } finally {
      setBudgetLoading(false);
    }
  };

  const ALL_TXN_CAT = "All Transactions";

  // "All Transactions" is a synthetic category — its historical/forecast amounts
  // are the per-month sum across every real category, and its trend is derived
  // from comparing the combined last-historical vs. last-forecast totals.
  // Aggregates per-category forecasts into a synthetic "All Transactions" total series
  const getForecastEntry = (cat: string): ForecastData | null => {
    if (!forecastResult) return null;
    if (cat !== ALL_TXN_CAT) return forecastResult.forecasts[cat] ?? null;

    const cats = Object.keys(forecastResult.forecasts);
    if (cats.length === 0) return null;

    const sumByMonth = (pick: (d: ForecastData) => HistPoint[]) => {
      const totals = new Map<string, { amount: number; low: number; high: number; hasLH: boolean }>();
      for (const c of cats) {
        for (const p of pick(forecastResult.forecasts[c])) {
          const prev = totals.get(p.month) ?? { amount: 0, low: 0, high: 0, hasLH: false };
          totals.set(p.month, {
            amount: prev.amount + p.amount,
            low:    prev.low  + (p.low  ?? p.amount),
            high:   prev.high + (p.high ?? p.amount),
            hasLH:  prev.hasLH || p.low !== undefined,
          });
        }
      }
      return Array.from(totals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          amount: Math.round(v.amount * 100) / 100,
          ...(v.hasLH ? {
            low:  Math.round(v.low  * 100) / 100,
            high: Math.round(v.high * 100) / 100,
          } : {}),
        }));
    };

    const historical = sumByMonth(d => d.historical);

    // Only keep forecast months that are strictly after the last historical month.
    // Different categories have different last-data-point dates (sparse categories like
    // "Auto" or "Gifts" may not appear in recent months), so their individual ML
    // forecasts start earlier than the most recent actual data. Including those past-
    // dated forecast months in the aggregate creates an overlap with the historical
    // line and a sharp disjoint at the bridge point.
    const lastHistMonth = historical[historical.length - 1]?.month ?? "";
    const forecast = sumByMonth(d => d.forecast).filter(p => p.month > lastHistMonth);

    const lastHist = historical[historical.length - 1]?.amount ?? 0;
    const lastFc = forecast[forecast.length - 1]?.amount ?? 0;
    const trend: ForecastData["trend"] = lastFc > lastHist * 1.03 ? "up" : lastFc < lastHist * 0.97 ? "down" : "stable";

    return { historical, forecast, trend };
  };

  // Merges historical and forecast points into one flat array for Recharts
  const buildChartData = (cat: string) => {
    const entry = getForecastEntry(cat);
    if (!entry) return [];
    const { historical, forecast } = entry;
    // forecastLow/forecastBand = 0 for historical rows (not null) — recharts 3.x stacked
    // areas don't render reliably across null→value transitions, so we use 0 as the
    // "no band" state and anchor the band start at the bridge point.
    const hist = historical.map(p => ({
      month: p.month,
      actual: p.amount,
      forecast:    null as number | null,
      forecastLow:  0,
      forecastBand: 0,
    }));
    const fc = forecast.map(p => ({
      month: p.month,
      actual: null as number | null,
      forecast: p.amount,
      // forecastLow = P25 baseline; forecastBand = P75 - P25 (stacked on top to form the shaded band)
      forecastLow:  p.low  != null ? p.low  : 0,
      forecastBand: p.low  != null && p.high != null ? p.high - p.low : 0,
    }));
    // Bridge: the last historical point and the first forecast point share the same
    // x-position on the chart.  We snap fc[0].forecast to the last actual value so
    // the forecast line starts exactly where the actual line ends (no visible gap).
    // The Python bridge already pulls fc[0] close to lastActual; this handles any
    // residual difference when scale0 was clamped (extreme-outlier months).
    if (hist.length && fc.length) {
      const lastActual = hist[hist.length - 1].actual;
      fc[0] = { ...fc[0], actual: lastActual, forecast: lastActual };
      hist[hist.length - 1] = {
        ...hist[hist.length - 1],
        forecastLow:  fc[0].forecastLow,
        forecastBand: fc[0].forecastBand,
      };
    }
    return [...hist, ...fc];
  };

  const categories = forecastResult && Object.keys(forecastResult.forecasts).length > 0
    ? [ALL_TXN_CAT, ...Object.keys(forecastResult.forecasts)]
    : [];

  return (
    <div className="ml-insights-container">
      <div className="ml-page-header">
        <div className="ml-page-header-row">
          <div>
            <h1>ML Insights</h1>
            <p>
              Spending forecasts · Anomaly detection · Data-driven budget suggestions
              &nbsp;—&nbsp;powered by scikit-learn &amp; statsmodels.
            </p>
          </div>
          <div className="ml-analysis-range">
            <label className="ml-analysis-range-label" htmlFor="ml-analysis-range-select">Analysis Period</label>
            <select
              id="ml-analysis-range-select"
              className="ml-select"
              value={analysisRange}
              onChange={e => changeAnalysisRange(e.target.value as AnalysisRange)}
            >
              {(Object.keys(RANGE_LABELS) as AnalysisRange[]).map(r => (
                <option key={r} value={r}>{RANGE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {mlError && (
        <div className="ml-error-notice">⚠ {mlError}</div>
      )}

      {/* ── Section 1: Spending Forecast ─────────────────────────────────── */}
      <div className="ml-section-card">
        <div className="ml-section-grid">
          {/* Left content (columns 1-4) */}
          <div className="ml-grid-left">
            <div className="ml-section-header ml-forecast-header">
              <div>
                <h2>Spending Forecast</h2>
                <p className="ml-section-desc">
                  Holt exponential smoothing on {RANGE_LABELS[analysisRange].toLowerCase()} of expense history
                </p>
              </div>
              <div className="ml-forecast-select-col">
                <select
                  className="ml-select"
                  value={forecastMonths}
                  onChange={e => setForecastMonths(Number(e.target.value))}
                >
                  {FORECAST_AHEAD_OPTIONS[analysisRange].map(n => (
                    <option key={n} value={n}>{n} month{n > 1 ? "s" : ""} ahead</option>
                  ))}
                </select>
              </div>
            </div>

            {forecastResult && categories.length > 0 && (
              <>
                <div className="ml-cat-pills">
                  {categories.map(cat => {
                    const d = getForecastEntry(cat)!;
                    const trendColor = d.trend === "up" ? "#dc2626" : d.trend === "down" ? "#059669" : "#d97706";
                    const icon = d.trend === "up" ? "↑" : d.trend === "down" ? "↓" : "→";
                    const active = forecastCat === cat;
                    return (
                      <button
                        key={cat}
                        className={`ml-cat-pill ${active ? "active" : "inactive"}`}
                        onClick={() => setForecastCat(cat)}
                      >
                        {cat}&nbsp;<span style={{ color: active ? "#fff" : trendColor }}>{icon}</span>
                      </button>
                    );
                  })}
                </div>

                {forecastCat && (
                  <>
                    <div style={{ width: "100%", minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={buildChartData(forecastCat)} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => fmtCADShort(Number(v))} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={((v: unknown, name: string | undefined) => {
                            if (name === "forecastLow") return [v != null ? CAD(Number(v)) : "—", "Low (P25)"];
                            if (name === "forecastBand") return null;
                            return [v != null ? CAD(Number(v)) : "—", name === "actual" ? "Actual" : "Forecast (median)"];
                          }) as any}
                        />
                        <Legend />
                        {/* Invisible P25 baseline — establishes the bottom of the stacked band */}
                        <Area type="monotone" dataKey="forecastLow" stackId="band" fill="#10b981" fillOpacity={0} stroke="none" strokeWidth={0} legendType="none" name="forecastLow" dot={false} activeDot={false} />
                        {/* Visible P25→P75 band stacked on top of the baseline */}
                        <Area type="monotone" dataKey="forecastBand" stackId="band" fill="#10b981" fillOpacity={0.25} stroke="none" strokeWidth={0} legendType="none" name="forecastBand" dot={false} activeDot={false} />
                        <Line type="monotone" dataKey="actual" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} name="Actual" connectNulls={false} />
                        <Line type="monotone" dataKey="forecast" stroke="#10b981" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="Forecast (median)" connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                    <div className="ml-chart-note">
                      Dashed = forecasted median · Shaded band = P25–P75 range (↑ high = cut opportunity · ↓ low = savings opportunity).&nbsp;
                      Trend:&nbsp;
                      <strong style={{ color: getForecastEntry(forecastCat)!.trend === "up" ? "#dc2626" : getForecastEntry(forecastCat)!.trend === "down" ? "#059669" : "#d97706" }}>
                        {getForecastEntry(forecastCat)!.trend === "up" ? "↑ Increasing" : getForecastEntry(forecastCat)!.trend === "down" ? "↓ Decreasing" : "→ Stable"}
                      </strong>
                    </div>
                  </>
                )}
              </>
            )}

            {forecastResult && categories.length === 0 && (
              <p className="ml-empty-text">
                No categories with sufficient history for forecasting (need ≥ 2 months per category).
              </p>
            )}
          </div>

          {/* Right panel (column 4) */}
          <div className="ml-grid-right">
            <div className="ml-section-controls">
              <button
                className="ml-run-btn forecast"
                onClick={runForecast}
                disabled={forecastLoading}
              >
                {forecastLoading ? "Forecasting…" : "Run Forecast"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Anomaly Detection ─────────────────────────────────── */}
      <div className="ml-section-card">
        <div className="ml-section-grid">
          {/* Left content (columns 1-4) */}
          <div className="ml-grid-left">
            <div className="ml-section-header">
              <div>
                <h2>Anomaly Detection</h2>
                <p className="ml-section-desc">
                  Isolation Forest on {RANGE_LABELS[analysisRange].toLowerCase()} of transactions — flags unusual amounts &amp; patterns
                </p>
              </div>
            </div>

            {anomalyResult && (
              <>
                <div className="ml-stats-row">
                  {[
                    { label: "Scanned", value: anomalyResult.totalScanned, color: "var(--text)" },
                    { label: "Flagged", value: anomalyResult.anomalyCount, color: anomalyResult.anomalyCount > 0 ? "var(--danger)" : "var(--success)" },
                    { label: "Flag Rate", value: `${anomalyResult.totalScanned > 0 ? ((anomalyResult.anomalyCount / anomalyResult.totalScanned) * 100).toFixed(1) : 0}%`, color: "var(--text)" },
                  ].map(c => (
                    <div key={c.label} className="ml-stat-mini">
                      <div className="ml-stat-mini-label">{c.label}</div>
                      <div className="ml-stat-mini-value" style={{ color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {anomalyResult.anomalies.length > 0 ? (
                  <div className="ml-table-wrap">
                    <table className="ml-table">
                      <thead>
                        <tr>
                          {["Date", "Category", "Amount", "Description", "Score", "Why Flagged"].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {anomalyResult.anomalies.map(txn => (
                          <tr key={txn.id}>
                            <td className="td-nowrap">{txn.date}</td>
                            <td>{txn.category}</td>
                            <td className="td-amount">{CAD(txn.amount)}</td>
                            <td className="td-desc">{txn.description || "—"}</td>
                            <td className="td-nowrap">
                              <span className={`ml-anomaly-score ${txn.anomalyScore >= 70 ? "high" : "medium"}`}>
                                {txn.anomalyScore.toFixed(0)}
                              </span>
                            </td>
                            <td className="td-reason">{txn.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ml-no-anomaly">✓ No anomalous transactions detected.</p>
                )}
                {anomalyResult.message && (
                  <p className="ml-anomaly-message">{anomalyResult.message}</p>
                )}
              </>
            )}
          </div>

          {/* Right panel (columns 5-6) */}
          <div className="ml-grid-right">
            <div className="ml-section-controls">
              <button
                className="ml-run-btn anomaly"
                onClick={runAnomalies}
                disabled={anomalyLoading}
              >
                {anomalyLoading ? "Scanning…" : "Scan Transactions"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Budget Suggestions ────────────────────────────────── */}
      <div className="ml-section-card">
        <div className="ml-section-grid">
          {/* Left content (columns 1-4) */}
          <div className="ml-grid-left">
            <div className="ml-section-header">
              <div>
                <h2>Smart Budget Suggestions</h2>
                <p className="ml-section-desc">
                  75th-percentile + trend analysis on {RANGE_LABELS[analysisRange].toLowerCase()} of spending history
                </p>
              </div>
            </div>

            {budgetResult && (
              <>
                <p className="ml-budget-note">
                  {budgetResult.monthsAnalyzed} months analyzed.
                  Suggested = P75 × 1.05× buffer (1.10× for rising categories).
                </p>
                <div className="ml-table-wrap">
                  <table className="ml-table">
                    <thead>
                      <tr>
                        {["Category", "Avg Spend", "Median", "P75", "Suggested Budget", "Trend", "Confidence", "Months"].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {budgetResult.suggestions.map(s => (
                        <tr key={s.category}>
                          <td className="td-bold">{s.category}</td>
                          <td>{CAD(s.historicalMean)}</td>
                          <td>{CAD(s.historicalMedian)}</td>
                          <td>{CAD(s.p75)}</td>
                          <td className="ml-budget-suggested">{CAD(s.suggestedBudget)}</td>
                          <td>
                            <span style={{
                              color: s.trend === "increasing" ? "#dc2626" : s.trend === "decreasing" ? "#059669" : "#d97706",
                              fontWeight: 600,
                            }}>
                              {s.trend === "increasing" ? "↑" : s.trend === "decreasing" ? "↓" : "→"} {s.trend}
                            </span>
                          </td>
                          <td>
                            <span className={`ml-badge ${s.confidence}`}>{s.confidence}</span>
                          </td>
                          <td className="td-muted">{s.monthsAnalyzed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Right panel (columns 5-6) */}
          <div className="ml-grid-right">
            <div className="ml-section-controls">
              <button
                className="ml-run-btn budget"
                onClick={runBudget}
                disabled={budgetLoading}
              >
                {budgetLoading ? "Analyzing…" : "Generate Suggestions"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
