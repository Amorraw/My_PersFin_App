import { useState } from "react";
import { api } from "../api";

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

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

let nextId = 1;

const defaultTarget = { canadianEquity: 20, usEquity: 40, intlEquity: 20, canadianBonds: 15, cash: 5 };

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

  const actionColor = (action: string) =>
    action === "buy" ? "var(--success)" : action === "sell" ? "var(--danger)" : "var(--text-secondary)";

  return (
    <div style={{ padding: "2rem", maxWidth: 980 }}>
      <h1>Portfolio Rebalancing Tool</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Enter your current holdings and target allocation. The tool calculates drift,
        trades needed, and recommends a tax-efficient rebalancing order (registered accounts first).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>

        {/* Holdings */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Current Holdings</h3>
          {holdings.map((h, i) => (
            <div key={h.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem", marginBottom: "0.75rem", background: "var(--background)" }}>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input
                  placeholder="Name / Symbol"
                  value={h.name}
                  onChange={(e) => updateHolding(h.id, "name", e.target.value)}
                  style={{ flex: 2, padding: "0.4rem 0.6rem", border: "1px solid var(--border)", borderRadius: 6 }}
                />
                <input
                  type="number"
                  placeholder="Value ($)"
                  value={h.value}
                  onChange={(e) => updateHolding(h.id, "value", e.target.value)}
                  style={{ flex: 1, padding: "0.4rem 0.6rem", border: "1px solid var(--border)", borderRadius: 6 }}
                />
                {holdings.length > 1 && (
                  <button onClick={() => removeHolding(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontWeight: 700 }}>✕</button>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select
                  value={h.assetClass}
                  onChange={(e) => updateHolding(h.id, "assetClass", e.target.value)}
                  style={{ flex: 1, padding: "0.35rem 0.5rem", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.82rem" }}
                >
                  {(Object.keys(ASSET_LABELS) as AssetClass[]).map((k) => (
                    <option key={k} value={k}>{ASSET_LABELS[k]}</option>
                  ))}
                </select>
                <select
                  value={h.accountType}
                  onChange={(e) => updateHolding(h.id, "accountType", e.target.value)}
                  style={{ flex: 1, padding: "0.35rem 0.5rem", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.82rem" }}
                >
                  {["TFSA", "RRSP", "FHSA", "non-registered", "other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button className="btn" onClick={addHolding} style={{ width: "100%", marginTop: "0.25rem" }}>+ Add Holding</button>
        </div>

        {/* Target Allocation */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Target Allocation</h3>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Must sum to 100% — currently <strong style={{ color: Math.abs(targetSum - 100) < 0.5 ? "var(--success)" : "var(--danger)" }}>{targetSum}%</strong>
          </p>
          {[
            { key: "canadianEquity", label: "Canadian Equity" },
            { key: "usEquity", label: "US Equity" },
            { key: "intlEquity", label: "International Equity" },
            { key: "canadianBonds", label: "Canadian Bonds" },
            { key: "cash", label: "Cash / GIC" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <label style={{ width: 160, fontSize: "0.88rem" }}>{label}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={(target as any)[key]}
                onChange={(e) => setT(key as keyof typeof target, e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={(target as any)[key]}
                onChange={(e) => setT(key as keyof typeof target, e.target.value)}
                style={{ width: 55, padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: 6, fontSize: "0.88rem" }}
              />
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>%</span>
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
            <label style={{ fontSize: "0.82rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Drift alert threshold:
              <input
                type="number"
                min={1}
                max={20}
                value={driftThreshold}
                onChange={(e) => setDriftThreshold(Number(e.target.value))}
                style={{ width: 50, padding: "0.25rem 0.4rem", border: "1px solid var(--border)", borderRadius: 6 }}
              />
              %
            </label>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" style={{ minWidth: 180 }} onClick={calculate} disabled={loading}>
        {loading ? "Calculating…" : "Calculate Rebalancing"}
      </button>
      {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}

      {/* Results */}
      {result && (
        <div style={{ marginTop: "2rem" }}>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Portfolio Total", value: fmt(result.totalValue), color: "var(--primary)" },
              { label: "In Registered Accounts", value: fmt(result.taxShelteredValue), sub: `${result.taxShelteredPercent.toFixed(0)}% of portfolio`, color: "var(--success)" },
              { label: "Asset Classes Drifted", value: String(result.driftedCount), sub: `>${driftThreshold}% off target`, color: result.driftedCount > 0 ? "#d97706" : "var(--success)" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{c.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: c.color }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Trades table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>Rebalancing Trades</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  {["Asset Class", "Current $", "Current %", "Target %", "Target $", "Trade", "Action"].map((h) => (
                    <th key={h} style={{ padding: "0.6rem 0.9rem", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={t.assetClass} style={{
                    background: t.isDrifted ? "#fef9c3" : i % 2 === 0 ? "var(--surface)" : "var(--background)",
                  }}>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: t.isDrifted ? 600 : 400 }}>
                      {ASSET_LABELS[t.assetClass as AssetClass] || t.assetClass}
                      {t.isDrifted && <span style={{ marginLeft: "0.5rem", fontSize: "0.72rem", background: "#d97706", color: "white", padding: "1px 6px", borderRadius: 8 }}>DRIFTED</span>}
                    </td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{fmt(t.currentValue)}</td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{t.currentPct.toFixed(1)}%</td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{t.targetPct.toFixed(1)}%</td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)" }}>{fmt(t.targetValue)}</td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)", color: actionColor(t.action), fontWeight: 600 }}>
                      {t.action === "hold" ? "—" : `${t.action === "buy" ? "+" : ""}${fmt(t.tradeAmount)}`}
                    </td>
                    <td style={{ padding: "0.55rem 0.9rem", borderBottom: "1px solid var(--border)", textTransform: "uppercase", fontSize: "0.78rem", fontWeight: 700, color: actionColor(t.action) }}>
                      {t.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tax-efficient advice */}
          {result.taxAdvice.length > 0 && (
            <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "1.25rem" }}>
              <h3 style={{ marginTop: 0 }}>Tax-Efficient Rebalancing Order</h3>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                Always rebalance inside RRSP/TFSA/FHSA first — no capital gains tax on trades inside registered accounts.
              </p>
              {result.taxAdvice.map((t) => (
                <div key={t.assetClass} style={{ marginBottom: "0.6rem", fontSize: "0.88rem" }}>
                  <strong>{ASSET_LABELS[t.assetClass as AssetClass] || t.assetClass}</strong> ({t.action.toUpperCase()} {fmt(Math.abs(t.tradeAmount))}):
                  <span style={{ color: "var(--text-secondary)", marginLeft: "0.5rem" }}>{t.taxEfficientNote}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
