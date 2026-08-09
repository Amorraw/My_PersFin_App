import { useState } from "react";
import { api } from "../api";
import "./InvestmentPerformanceDashboard.css";
import { fmtCAD as fmt, fmtPctSigned } from "../utils/formatters";

interface HoldingInput {
  id: number;
  name: string;
  symbol: string;
  purchaseDate: string;
  purchasePrice: string;
  currentPrice: string;
  quantity: string;
  dividendsReceived: string;
  accountType: string;
  type: string;
}

interface HoldingResult extends HoldingInput {
  totalCost: number;
  currentValue: number;
  dividends: number;
  totalReturn: number;
  totalReturnPct: number;
  annualizedReturn: number;
  yearsHeld: number;
  taxLossHarvestable: boolean;
  t5Dividends: number;
}

interface Summary {
  totalCost: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  totalT5Dividends: number;
  taxLossHarvestOpportunities: number;
}

const BENCHMARKS = [
  { name: "S&P 500 (VFV.TO)", annualReturn1yr: 25.1, annualReturn3yr: 12.8, annualReturn5yr: 15.3, mer: 0.09 },
  { name: "Canadian Market (VCN.TO)", annualReturn1yr: 14.9, annualReturn3yr: 8.1, annualReturn5yr: 9.2, mer: 0.05 },
  { name: "Global Equity (XEQT.TO)", annualReturn1yr: 20.7, annualReturn3yr: 10.9, annualReturn5yr: 13.1, mer: 0.20 },
  { name: "Balanced (XGRO.TO)", annualReturn1yr: 16.4, annualReturn3yr: 8.5, annualReturn5yr: 10.6, mer: 0.20 },
  { name: "Canadian Bonds (ZAG.TO)", annualReturn1yr: 4.2, annualReturn3yr: -1.1, annualReturn5yr: 0.9, mer: 0.09 },
];

const fmtPct = (n: number) => fmtPctSigned(n, 2);

let nextId = 1;

const blankHolding = (): HoldingInput => ({
  id: nextId++,
  name: "",
  symbol: "",
  purchaseDate: "",
  purchasePrice: "",
  currentPrice: "",
  quantity: "",
  dividendsReceived: "0",
  accountType: "TFSA",
  type: "etf",
});

export default function InvestmentPerformanceDashboard() {
  const [holdings, setHoldings] = useState<HoldingInput[]>([blankHolding()]);
  const [results, setResults] = useState<HoldingResult[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (id: number, field: keyof HoldingInput, val: string) =>
    setHoldings((p) => p.map((h) => (h.id === id ? { ...h, [field]: val } : h)));

  const addHolding = () => setHoldings((p) => [...p, blankHolding()]);
  const removeHolding = (id: number) => setHoldings((p) => p.filter((h) => h.id !== id));

  const calculate = async () => {
    setError("");
    setLoading(true);
    try {
      const mapped = holdings
        .filter((h) => h.name && Number(h.purchasePrice) > 0 && Number(h.currentPrice) > 0 && Number(h.quantity) > 0)
        .map((h) => ({
          name: h.name,
          symbol: h.symbol,
          purchaseDate: h.purchaseDate || new Date().toISOString().slice(0, 10),
          purchasePrice: Number(h.purchasePrice),
          currentPrice: Number(h.currentPrice),
          quantity: Number(h.quantity),
          dividendsReceived: Number(h.dividendsReceived) || 0,
          accountType: h.accountType,
          type: h.type,
        }));

      if (mapped.length === 0) {
        setError("Add at least one holding with purchase price, current price, and quantity.");
        setLoading(false);
        return;
      }

      const data = await api("/portfolio/performance", {
        method: "POST",
        body: JSON.stringify({ holdings: mapped }),
      });
      setResults(data.holdings);
      setSummary(data.summary);
    } catch (err: any) {
      setError(err?.message ?? "Calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const returnColor = (n: number) => (n >= 0 ? "var(--success)" : "var(--danger)");

  return (
    <div className="perf-container">
      <div className="perf-header">
        <h1>Investment Performance Dashboard</h1>
        <p>
          Enter your holdings to calculate total return, annualized return, T5 slip estimates for
          non-registered accounts, and identify tax-loss harvesting opportunities.
        </p>
      </div>

      {/* Holdings input */}
      <div className="perf-input-card">
        <h3>Holdings</h3>
        <div className="input-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                {["Name", "Symbol", "Purchase Date", "Buy Price", "Current Price", "Qty", "Dividends ($)", "Account", "Type", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={h.id} className={i % 2 !== 0 ? "row-alt" : ""}>
                  <td>
                    <input value={h.name} onChange={(e) => update(h.id, "name", e.target.value)} placeholder="e.g. XEQT" style={{ width: 90 }} />
                  </td>
                  <td>
                    <input value={h.symbol} onChange={(e) => update(h.id, "symbol", e.target.value)} placeholder="XEQT.TO" style={{ width: 75 }} />
                  </td>
                  <td>
                    <input type="date" value={h.purchaseDate} onChange={(e) => update(h.id, "purchaseDate", e.target.value)} style={{ width: 120 }} />
                  </td>
                  <td>
                    <input type="number" min={0} value={h.purchasePrice} onChange={(e) => update(h.id, "purchasePrice", e.target.value)} placeholder="0.00" style={{ width: 68 }} />
                  </td>
                  <td>
                    <input type="number" min={0} value={h.currentPrice} onChange={(e) => update(h.id, "currentPrice", e.target.value)} placeholder="0.00" style={{ width: 68 }} />
                  </td>
                  <td>
                    <input type="number" min={0} value={h.quantity} onChange={(e) => update(h.id, "quantity", e.target.value)} placeholder="0" style={{ width: 55 }} />
                  </td>
                  <td>
                    <input type="number" min={0} value={h.dividendsReceived} onChange={(e) => update(h.id, "dividendsReceived", e.target.value)} placeholder="0" style={{ width: 65 }} />
                  </td>
                  <td>
                    <select value={h.accountType} onChange={(e) => update(h.id, "accountType", e.target.value)}>
                      {["TFSA", "RRSP", "FHSA", "non-registered"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={h.type} onChange={(e) => update(h.id, "type", e.target.value)}>
                      {["etf", "stock", "bond", "mutual-fund", "gic"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    {holdings.length > 1 && (
                      <button className="remove-btn" onClick={() => removeHolding(h.id)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="input-actions">
          <button className="btn btn-small" onClick={addHolding}>+ Add Holding</button>
          <button className="btn btn-primary" onClick={calculate} disabled={loading}>
            {loading ? "Calculating…" : "Calculate Performance"}
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
      </div>

      {/* Results */}
      {summary && results && (
        <>
          {/* Summary cards */}
          <div className="results-summary">
            {[
              { label: "Total Invested", value: fmt(summary.totalCost), color: "var(--text)" },
              { label: "Current Value", value: fmt(summary.totalValue), color: "var(--primary)" },
              { label: "Total Return", value: `${fmt(summary.totalReturn)} (${fmtPct(summary.totalReturnPct)})`, color: returnColor(summary.totalReturn) },
              { label: "Est. T5 Dividends", value: fmt(summary.totalT5Dividends), sub: "Non-registered only", color: summary.totalT5Dividends > 0 ? "#d97706" : "var(--text)" },
              { label: "Tax-Loss Harvest", value: `${summary.taxLossHarvestOpportunities} opportunit${summary.taxLossHarvestOpportunities !== 1 ? "ies" : "y"}`, color: summary.taxLossHarvestOpportunities > 0 ? "var(--success)" : "var(--text)" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-label">{c.label}</div>
                <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
                {(c as any).sub && <div className="stat-sub">{(c as any).sub}</div>}
              </div>
            ))}
          </div>

          {/* Holdings performance table */}
          <div className="table-card">
            <div className="table-card-header">
              <h3>Holding-by-Holding Performance</h3>
            </div>
            <div className="results-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    {["Holding", "Account", "Cost", "Current Value", "Total Return", "Annual Return", "Held (yrs)", "Flags"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} className={i % 2 !== 0 ? "row-alt" : ""}>
                      <td style={{ fontWeight: 600 }}>
                        {r.name}
                        {r.symbol && <span style={{ marginLeft: 5, fontSize: "0.7rem", color: "var(--text-light)" }}>{r.symbol}</span>}
                      </td>
                      <td><span className="account-badge">{r.accountType}</span></td>
                      <td>{fmt(r.totalCost)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(r.currentValue)}</td>
                      <td style={{ color: returnColor(r.totalReturn), fontWeight: 600 }}>
                        {fmt(r.totalReturn)}<br />
                        <span style={{ fontSize: "0.7rem" }}>({fmtPct(r.totalReturnPct)})</span>
                      </td>
                      <td style={{ color: returnColor(r.annualizedReturn), fontWeight: 600 }}>
                        {fmtPct(r.annualizedReturn)}/yr
                      </td>
                      <td>{r.yearsHeld.toFixed(1)}y</td>
                      <td>
                        {r.taxLossHarvestable && <span className="flag-harvest">Harvest</span>}
                        {r.t5Dividends > 0 && <span className="flag-t5">T5: {fmt(r.t5Dividends)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* T5 Slip Estimate */}
          {summary.totalT5Dividends > 0 && (
            <div className="t5-box">
              <h3>Estimated T5 Slip — Non-Registered Accounts</h3>
              <p>
                Your non-registered holdings received an estimated <strong>{fmt(summary.totalT5Dividends)}</strong> in
                dividends/distributions. Your financial institution will issue a T5 slip for eligible dividends and
                interest received in your non-registered accounts. Canadian-source dividends are grossed up and eligible
                for the <strong>dividend tax credit</strong> — they are taxed more favourably than interest income.
              </p>
              <div>
                <strong style={{ fontSize: "0.75rem" }}>What to include on your return:</strong>
                <ul>
                  <li>Box 10 / Box 11: Canadian eligible dividends (grossed up 38%)</li>
                  <li>Box 13: Interest from Canadian sources</li>
                  <li>Box 15 / Box 16: Foreign income and foreign tax paid</li>
                </ul>
              </div>
            </div>
          )}

          {/* Tax-loss harvesting */}
          {summary.taxLossHarvestOpportunities > 0 && (
            <div className="harvest-box">
              <h3>Tax-Loss Harvesting Opportunity</h3>
              <p>
                You have <strong>{summary.taxLossHarvestOpportunities} holding{summary.taxLossHarvestOpportunities > 1 ? "s" : ""}</strong> in
                non-registered accounts with unrealized losses. Selling these locks in the capital loss,
                which can offset capital gains from other investments in the same year — or be carried
                back 3 years / forward indefinitely.
              </p>
              <p>
                <strong>Superficial loss rule:</strong> You (or an affiliated person) cannot buy the same or identical security
                within 30 calendar days before or after the sale, or the loss is denied.
                Consider swapping to a similar-but-not-identical ETF (e.g., ZCN → VCN).
              </p>
            </div>
          )}
        </>
      )}

      {/* Benchmark comparison */}
      <div className="table-card">
        <div className="table-card-header">
          <h3>Benchmark Reference Returns</h3>
          <p>Approximate historical returns for common Canadian benchmarks (CAD, as of late 2024). Past performance does not guarantee future results.</p>
        </div>
        <table className="inv-table">
          <thead>
            <tr>
              {["Benchmark", "1-Year", "3-Year Ann.", "5-Year Ann.", "MER"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BENCHMARKS.map((b, i) => (
              <tr key={b.name} className={i % 2 !== 0 ? "row-alt" : ""}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td style={{ color: returnColor(b.annualReturn1yr) }}>{fmtPct(b.annualReturn1yr)}</td>
                <td style={{ color: returnColor(b.annualReturn3yr) }}>{fmtPct(b.annualReturn3yr)}</td>
                <td style={{ color: returnColor(b.annualReturn5yr) }}>{fmtPct(b.annualReturn5yr)}</td>
                <td style={{ color: "var(--text-light)" }}>{b.mer}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
