import { useState } from "react";
import { api } from "../api";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import './MLInsights.css';
import { fmtCADShort } from "../components/charts";

const CAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

// ── Types ────────────────────────────────────────────────────────────────────

interface HistPoint { month: string; amount: number; }
interface ForecastPoint extends HistPoint { p25: number; p75: number; }
interface ForecastData {
  historical: HistPoint[];
  forecast: ForecastPoint[];
  trend: "up" | "down" | "stable";
  seasonal: boolean;
}
interface ForecastResult {
  forecasts: Record<string, ForecastData>;
  months_forecast: number;
  insufficientHistory?: boolean;
  monthsAvailable?: number;
  limitedHorizon?: boolean;
  message?: string;
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
  "3y": [1, 3, 6, 12, 24, 36],
  "all": [1, 3, 6, 12, 24, 36],
};

// ── Component ────────────────────────────────────────────────────────────────

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
  const [forecastNote, setForecastNote] = useState<string | null>(null);

  const clearError = () => setMlError(null);

  const changeAnalysisRange = (next: AnalysisRange) => {
    setAnalysisRange(next);
    // Clamp forecastMonths to a horizon available for the new range (3 months always valid)
    if (!FORECAST_AHEAD_OPTIONS[next].includes(forecastMonths)) setForecastMonths(3);
  };

  const runForecast = async () => {
    clearError();
    setForecastNote(null);
    setForecastLoading(true);
    try {
      const data: ForecastResult = await api("/ml/forecast", {
        method: "POST",
        body: JSON.stringify({ months: forecastMonths, range: analysisRange }),
      });

      if (data.insufficientHistory) {
        setForecastResult(null);
        alert(data.message || "Cannot perform this forecast for lack of prior years' data.");
        return;
      }

      setForecastResult(data);
      const cats = Object.keys(data.forecasts);
      if (cats.length) setForecastCat(cats[0]);
      if (data.limitedHorizon && data.message) {
        // Non-blocking — the forecast still ran, just at a shorter horizon.
        setForecastNote(data.message);
      }
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
  // are the per-month sum across every real category, and its trend/seasonal
  // flag are derived from the combined series.
  const getForecastEntry = (cat: string): ForecastData | null => {
    if (!forecastResult) return null;
    if (cat !== ALL_TXN_CAT) return forecastResult.forecasts[cat] ?? null;

    const cats = Object.keys(forecastResult.forecasts);
    if (cats.length === 0) return null;

    const sumHistorical = (): HistPoint[] => {
      const totals = new Map<string, number>();
      for (const c of cats) {
        for (const p of forecastResult.forecasts[c].historical) {
          totals.set(p.month, (totals.get(p.month) ?? 0) + p.amount);
        }
      }
      return Array.from(totals.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));
    };

    // Only keep forecast months strictly after the last historical month.
    // Different categories have different last-data-point dates (sparse categories
    // like "Auto" or "Gifts" may not appear in recent months), so their individual
    // ML forecasts can start earlier than the most recent actual data. Including
    // those past-dated forecast months in the aggregate would create an overlap
    // with the historical line and a sharp disjoint at the bridge point.
    const sumForecast = (afterMonth: string): ForecastPoint[] => {
      const totals = new Map<string, { amount: number; p25: number; p75: number }>();
      for (const c of cats) {
        for (const p of forecastResult.forecasts[c].forecast) {
          const prev = totals.get(p.month) ?? { amount: 0, p25: 0, p75: 0 };
          totals.set(p.month, {
            amount: prev.amount + p.amount,
            p25: prev.p25 + p.p25,
            p75: prev.p75 + p.p75,
          });
        }
      }
      return Array.from(totals.entries())
        .filter(([month]) => month > afterMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          amount: Math.round(v.amount * 100) / 100,
          p25: Math.round(v.p25 * 100) / 100,
          p75: Math.round(v.p75 * 100) / 100,
        }));
    };

    const historical = sumHistorical();
    const lastHistMonth = historical[historical.length - 1]?.month ?? "";
    const forecast = sumForecast(lastHistMonth);

    const lastHist = historical[historical.length - 1]?.amount ?? 0;
    const lastFc = forecast[forecast.length - 1]?.amount ?? 0;
    const trend: ForecastData["trend"] = lastFc > lastHist * 1.03 ? "up" : lastFc < lastHist * 0.97 ? "down" : "stable";
    const seasonal = cats.some(c => forecastResult.forecasts[c].seasonal);

    return { historical, forecast, trend, seasonal };
  };

  const buildChartData = (cat: string) => {
    const entry = getForecastEntry(cat);
    if (!entry) return [];
    const { historical, forecast } = entry;
    const hist = historical.map(p => ({
      month: p.month, actual: p.amount as number | null,
      forecast: null as number | null, base: null as number | null, band: null as number | null,
      p25: null as number | null, p75: null as number | null,
    }));
    const fc = forecast.map(p => ({
      month: p.month, actual: null as number | null, forecast: p.amount,
      base: p.p25, band: Math.max(0, p.p75 - p.p25), p25: p.p25, p75: p.p75,
    }));
    // Smooth transition: the average line and its percentile band start
    // exactly where the actual line ends (zero-width band at that instant),
    // rather than jumping to the first forecasted value from a different point.
    if (hist.length) {
      const last = hist[hist.length - 1];
      hist[hist.length - 1] = { ...last, forecast: last.actual, base: last.actual, band: 0 };
    }
    return [...hist, ...fc];
  };

  const ForecastTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {row.actual != null && <div>Actual: {CAD(row.actual)}</div>}
        {row.forecast != null && <div style={{ color: "#15803d" }}>Average: {CAD(row.forecast)}</div>}
        {row.p25 != null && row.p75 != null && (
          <div style={{ color: "#16a34a" }}>25th–75th percentile: {CAD(row.p25)} – {CAD(row.p75)}</div>
        )}
      </div>
    );
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
          <div className="ml-grid-left">
            <div className="ml-section-header ml-forecast-header">
              <div>
                <h2>Spending Forecast</h2>
                <p className="ml-section-desc">
                  Holt-Winters exponential smoothing on {RANGE_LABELS[analysisRange].toLowerCase()} of expense history —
                  damped trend, plus yearly seasonality once enough history exists
                </p>
              </div>
              <div className="ml-forecast-select-col">
                <select
                  className="ml-select"
                  value={forecastMonths}
                  onChange={e => setForecastMonths(Number(e.target.value))}
                >
                  {FORECAST_AHEAD_OPTIONS[analysisRange].map(n => (
                    <option key={n} value={n}>
                      {n < 12 ? `${n} month${n > 1 ? "s" : ""} ahead` : `${n / 12} year${n > 12 ? "s" : ""} ahead`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {forecastNote && (
              <p className="ml-chart-note" style={{ marginTop: 0 }}>💡 {forecastNote}</p>
            )}

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
                        <Tooltip content={<ForecastTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="base" stackId="fc" stroke="none" fill="#16a34a" fillOpacity={0} legendType="none" isAnimationActive={false} />
                        <Area type="monotone" dataKey="band" stackId="fc" stroke="none" fill="#86efac" fillOpacity={0.55} name="25th–75th percentile" isAnimationActive={false} />
                        <Line type="monotone" dataKey="actual" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} name="Actual" connectNulls={false} />
                        <Line type="monotone" dataKey="forecast" stroke="#15803d" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="Average" connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                    <div className="ml-chart-note">
                      Dashed = forecasted months. Shaded band = 25th–75th percentile range.&nbsp;
                      Trend:&nbsp;
                      <strong style={{ color: getForecastEntry(forecastCat)!.trend === "up" ? "#dc2626" : getForecastEntry(forecastCat)!.trend === "down" ? "#059669" : "#d97706" }}>
                        {getForecastEntry(forecastCat)!.trend === "up" ? "↑ Increasing" : getForecastEntry(forecastCat)!.trend === "down" ? "↓ Decreasing" : "→ Stable"}
                      </strong>
                      {forecastMonths > 6 && (
                        getForecastEntry(forecastCat)!.seasonal ? (
                          <>&nbsp;·&nbsp;<strong style={{ color: "#4f46e5" }}>Includes yearly seasonality</strong> (24+ months of history)</>
                        ) : (
                          <>&nbsp;·&nbsp;Trend only — analyze 24+ months of history for seasonal patterns on multi-year forecasts</>
                        )
                      )}
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
