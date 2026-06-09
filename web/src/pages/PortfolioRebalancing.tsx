// Portfolio rebalancing tool with drift detection and tax-efficient trade suggestions
import { useState } from "react";
import { api } from "../api";
import "./PortfolioRebalancing.css";
import { fmtCAD as fmt } from "../utils/formatters";

type AssetClass = "canadian-equity" | "us-equity" | "intl-equity" | "canadian-bonds" | "cash";
type AccountType = "TFSA" | "RRSP" | "FHSA" | "non-registered" | "other";

interface Holding {
  id: number;
  name: string;
  value: string;
  assetClass: AssetClass;
  accountType: AccountType;
}

interface TradeRow {
  assetClass: string;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  targetValue: number;
  tradeAmount: number;
  drift: number;
  isDrifted: boolean;
  action: "buy" | "sell" | "hold";
  taxEfficientNote?: string;
}

interface Result {
  totalValue: number;
  trades: TradeRow[];
  taxAdvice: TradeRow[];
  taxShelteredValue: number;
  taxShelteredPercent: number;
  driftedCount: number;
}

const ASSET_LABELS: Record<AssetClass, string> = {
  "canadian-equity": "Canadian Equity",
  "us-equity": "US Equity",
  "intl-equity": "International Equity",
  "canadian-bonds": "Canadian Bonds",
  cash: "Cash / GIC",
};

let nextId = 1;

const defaultTarget = { canadianEquity: 20, usEquity: 40, intlEquity: 20, canadianBonds: 15, cash: 5 };

// Renders holdings input, target-allocation controls, and rebalancing trade table
export default function PortfolioRebalancing() {
  const [holdings, setHoldings] = useState<Holding[]>([
    { id: nextId++, name: "", value: "", assetClass: "canadian-equity", accountType: "TFSA" },
  ]);
  const [target, setTarget] = useState(defaultTarget);
  const [driftThreshold, setDriftThreshold] = useState(5);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const targetSum = target.canadianEquity + target.usEquity + target.intlEquity + target.canadianBonds + target.cash;

  const addHolding = () =>
    setHoldings((p) => [...p, { id: nextId++, name: "", value: "", assetClass: "canadian-equity", accountType: "TFSA" }]);

  const updateHolding = (id: number, field: keyof Holding, val: string) =>
    setHoldings((p) => p.map((h) => (h.id === id ? { ...h, [field]: val } : h)));

  const removeHolding = (id: number) =>
    setHoldings((p) => p.filter((h) => h.id !== id));

  const setT = (field: keyof typeof target, val: string) =>
    setTarget((p) => ({ ...p, [field]: Number(val) }));

  const calculate = async () => {
    setError("");
    setLoading(true);
    try {
      const mapped = holdings
        .filter((h) => h.name && Number(h.value) > 0)
        .map((h) => ({ name: h.name, value: Number(h.value), assetClass: h.assetClass, accountType: h.accountType }));
      if (mapped.length === 0) { setError("Add at least one holding with a value."); setLoading(false); return; }
      if (Math.abs(targetSum - 100) > 0.5) { setError(`Target allocations must sum to 100% (currently ${targetSum}%).`); setLoading(false); return; }
      const data = await api("/portfolio/rebalance", {
        method: "POST",
        body: JSON.stringify({ holdings: mapped, target, driftThreshold }),
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? "Calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const actionClass = (action: string) =>
    action === "buy" ? "action-buy" : action === "sell" ? "action-sell" : "action-hold";

  return (
    <div className="rebalancing-container">
      <div className="rebalancing-header">
        <h1>Portfolio Rebalancing Tool</h1>
        <p>
          Enter your current holdings and target allocation. The tool calculates drift,
          trades needed, and recommends a tax-efficient rebalancing order (registered accounts first).
        </p>
      </div>

      <div className="rebalancing-inputs">
        {/* Holdings */}
        <div className="section-card">
          <h3>Current Holdings</h3>
          {holdings.map((h) => (
            <div key={h.id} className="holding-row">
              <div className="holding-inputs">
                <input
                  className="name-input"
                  placeholder="Name / Symbol"
                  value={h.name}
                  onChange={(e) => updateHolding(h.id, "name", e.target.value)}
                />
                <input
                  className="value-input"
                  type="number"
                  placeholder="Value ($)"
                  value={h.value}
                  onChange={(e) => updateHolding(h.id, "value", e.target.value)}
                />
                {holdings.length > 1 && (
                  <button className="holding-remove-btn" onClick={() => removeHolding(h.id)}>✕</button>
                )}
              </div>
              <div className="holding-selects">
                <select
                  value={h.assetClass}
                  onChange={(e) => updateHolding(h.id, "assetClass", e.target.value)}
                >
                  {(Object.keys(ASSET_LABELS) as AssetClass[]).map((k) => (
                    <option key={k} value={k}>{ASSET_LABELS[k]}</option>
                  ))}
                </select>
                <select
                  value={h.accountType}
                  onChange={(e) => updateHolding(h.id, "accountType", e.target.value)}
                >
                  {["TFSA", "RRSP", "FHSA", "non-registered", "other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button className="btn btn-small" onClick={addHolding} style={{ width: "100%", marginTop: "4px" }}>
            + Add Holding
          </button>
        </div>

        {/* Target Allocation */}
        <div className="section-card">
          <h3>Target Allocation</h3>
          <p className="target-sum-info">
            Must sum to 100% — currently{" "}
            <strong style={{ color: Math.abs(targetSum - 100) < 0.5 ? "var(--success)" : "var(--danger)" }}>
              {targetSum}%
            </strong>
          </p>
          {[
            { key: "canadianEquity", label: "Canadian Equity" },
            { key: "usEquity", label: "US Equity" },
            { key: "intlEquity", label: "International Equity" },
            { key: "canadianBonds", label: "Canadian Bonds" },
            { key: "cash", label: "Cash / GIC" },
          ].map(({ key, label }) => (
            <div key={key} className="target-row">
              <label>{label}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={(target as any)[key]}
                onChange={(e) => setT(key as keyof typeof target, e.target.value)}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={(target as any)[key]}
                onChange={(e) => setT(key as keyof typeof target, e.target.value)}
              />
              <span className="pct-symbol">%</span>
            </div>
          ))}
          <div className="drift-threshold">
            Drift alert threshold:
            <input
              type="number"
              min={1}
              max={20}
              value={driftThreshold}
              onChange={(e) => setDriftThreshold(Number(e.target.value))}
            />
            %
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={calculate} disabled={loading}>
        {loading ? "Calculating…" : "Calculate Rebalancing"}
      </button>
      {error && <p className="error-msg">{error}</p>}

      {result && (
        <div className="results-section">
          {/* Summary cards */}
          <div className="results-summary">
            {[
              { label: "Portfolio Total", value: fmt(result.totalValue), color: "var(--primary)" },
              { label: "In Registered Accounts", value: fmt(result.taxShelteredValue), sub: `${result.taxShelteredPercent.toFixed(0)}% of portfolio`, color: "var(--success)" },
              { label: "Asset Classes Drifted", value: String(result.driftedCount), sub: `>${driftThreshold}% off target`, color: result.driftedCount > 0 ? "#d97706" : "var(--success)" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-label">{c.label}</div>
                <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
                {c.sub && <div className="stat-sub">{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Trades table */}
          <div className="table-card">
            <div className="table-card-header">
              <h3>Rebalancing Trades</h3>
            </div>
            <table className="inv-table">
              <thead>
                <tr>
                  {["Asset Class", "Current $", "Current %", "Target %", "Target $", "Trade", "Action"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={t.assetClass} className={t.isDrifted ? "row-drifted" : i % 2 !== 0 ? "row-alt" : ""}>
                    <td style={{ fontWeight: t.isDrifted ? 600 : 400 }}>
                      {ASSET_LABELS[t.assetClass as AssetClass] || t.assetClass}
                      {t.isDrifted && <span className="drift-badge">DRIFTED</span>}
                    </td>
                    <td>{fmt(t.currentValue)}</td>
                    <td>{t.currentPct.toFixed(1)}%</td>
                    <td>{t.targetPct.toFixed(1)}%</td>
                    <td>{fmt(t.targetValue)}</td>
                    <td className={actionClass(t.action)}>
                      {t.action === "hold" ? "—" : `${t.action === "buy" ? "+" : ""}${fmt(t.tradeAmount)}`}
                    </td>
                    <td className={actionClass(t.action)}>{t.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tax-efficient advice */}
          {result.taxAdvice.length > 0 && (
            <div className="tax-advice-box">
              <h3>Tax-Efficient Rebalancing Order</h3>
              <p>
                Always rebalance inside RRSP/TFSA/FHSA first — no capital gains tax on trades inside registered accounts.
              </p>
              {result.taxAdvice.map((t) => (
                <div key={t.assetClass} className="tax-advice-item">
                  <strong>{ASSET_LABELS[t.assetClass as AssetClass] || t.assetClass}</strong>
                  {" "}({t.action.toUpperCase()} {fmt(Math.abs(t.tradeAmount))}):
                  <span className="note">{t.taxEfficientNote}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
