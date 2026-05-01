import { useState } from "react";
import { api } from "../api";

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

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

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
    <div style={{ padding: "2rem", maxWidth: 1000 }}>
      <h1>Investment Performance Dashboard</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Enter your holdings to calculate total return, annualized return, T5 slip estimates for non-registered accounts,
        and identify tax-loss harvesting opportunities.
      </p>

      {/* Holdings input */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Holdings</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ background: "var(--background)" }}>
                {["Name", "Symbol", "Purchase Date", "Buy Price", "Current Price", "Qty", "Dividends ($)", "Account", "Type", ""].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.6rem", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input value={h.name} onChange={(e) => update(h.id, "name", e.target.value)} placeholder="e.g. XEQT" style={{ width: "100px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input value={h.symbol} onChange={(e) => update(h.id, "symbol", e.target.value)} placeholder="XEQT.TO" style={{ width: "80px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input type="date" value={h.purchaseDate} onChange={(e) => update(h.id, "purchaseDate", e.target.value)} style={{ width: "130px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input type="number" min={0} value={h.purchasePrice} onChange={(e) => update(h.id, "purchasePrice", e.target.value)} placeholder="0.00" style={{ width: "75px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input type="number" min={0} value={h.currentPrice} onChange={(e) => update(h.id, "currentPrice", e.target.value)} placeholder="0.00" style={{ width: "75px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input type="number" min={0} value={h.quantity} onChange={(e) => update(h.id, "quantity", e.target.value)} placeholder="0" style={{ width: "60px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <input type="number" min={0} value={h.dividendsReceived} onChange={(e) => update(h.id, "dividendsReceived", e.target.value)} placeholder="0" style={{ width: "70px", padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4 }} />
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <select value={h.accountType} onChange={(e) => update(h.id, "accountType", e.target.value)} style={{ padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4, fontSize: "0.82rem" }}>
                      {["TFSA", "RRSP", "FHSA", "non-registered"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    <select value={h.type} onChange={(e) => update(h.id, "type", e.target.value)} style={{ padding: "0.3rem", border: "1px solid var(--border)", borderRadius: 4, fontSize: "0.82rem" }}>
                      {["etf", "stock", "bond", "mutual-fund", "gic"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.4rem" }}>
                    {holdings.length > 1 && (
                      <button onClick={() => removeHolding(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontWeight: 700 }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
          <button className="btn" onClick={addHolding}>+ Add Holding</button>
          <button className="btn btn-primary" onClick={calculate} disabled={loading}>
            {loading ? "Calculating…" : "Calculate Performance"}
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</p>}
      </div>

      {/* Results */}
      {summary && results && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Total Invested", value: fmt(summary.totalCost), color: "inherit" },
              { label: "Current Value", value: fmt(summary.totalValue), color: "var(--primary)" },
              { label: "Total Return", value: `${fmt(summary.totalReturn)} (${fmtPct(summary.totalReturnPct)})`, color: returnColor(summary.totalReturn) },
              { label: "Est. T5 Dividends", value: fmt(summary.totalT5Dividends), sub: "Non-registered only", color: summary.totalT5Dividends > 0 ? "#d97706" : "inherit" },
              { label: "Tax-Loss Harvest", value: `${summary.taxLossHarvestOpportunities} opportunity${summary.taxLossHarvestOpportunities !== 1 ? "ies" : ""}`, color: summary.taxLossHarvestOpportunities > 0 ? "var(--success)" : "inherit" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{c.label}</div>
                <div style={{ fontSize: c.label === "Total Return" ? "1.05rem" : "1.3rem", fontWeight: 700, color: c.color }}>{c.value}</div>
                {(c as any).sub && <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{(c as any).sub}</div>}
              </div>
            ))}
          </div>

          {/* Holdings performance table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>Holding-by-Holding Performance</h3>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                <thead>
                  <tr style={{ background: "var(--background)" }}>
                    {["Holding", "Account", "Cost", "Current Value", "Total Return", "Annual Return", "Held (yrs)", "Flags"].map((h) => (
                      <th key={h} style={{ padding: "0.6rem 0.8rem", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                        {r.name}
                        {r.symbol && <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.symbol}</span>}
                      </td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", fontSize: "0.78rem" }}>
                        <span style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px" }}>{r.accountType}</span>
                      </td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)" }}>{fmt(r.totalCost)}</td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{fmt(r.currentValue)}</td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", color: returnColor(r.totalReturn), fontWeight: 600 }}>
                        {fmt(r.totalReturn)}<br />
                        <span style={{ fontSize: "0.78rem" }}>({fmtPct(r.totalReturnPct)})</span>
                      </td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", color: returnColor(r.annualizedReturn), fontWeight: 600 }}>
                        {fmtPct(r.annualizedReturn)}/yr
                      </td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)" }}>
                        {r.yearsHeld.toFixed(1)}y
                      </td>
                      <td style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border)", fontSize: "0.75rem" }}>
                        {r.taxLossHarvestable && (
                          <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 6px", borderRadius: 6, marginRight: "0.3rem" }}>Harvest</span>
                        )}
                        {r.t5Dividends > 0 && (
                          <span style={{ background: "#fef9c3", color: "#92400e", padding: "2px 6px", borderRadius: 6 }}>T5: {fmt(r.t5Dividends)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* T5 Slip Estimate */}
          {summary.totalT5Dividends > 0 && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
              <h3 style={{ marginTop: 0 }}>Estimated T5 Slip — Non-Registered Accounts</h3>
              <p style={{ fontSize: "0.88rem", color: "#78350f", lineHeight: 1.6 }}>
                Your non-registered holdings received an estimated <strong>{fmt(summary.totalT5Dividends)}</strong> in dividends/distributions.
                Your financial institution will issue a T5 slip for eligible dividends and interest received in your non-registered accounts.
                Canadian-source dividends are grossed up and eligible for the <strong>dividend tax credit</strong> — they are taxed more favourably than interest income.
              </p>
              <div style={{ fontSize: "0.84rem", color: "#78350f" }}>
                <strong>What to include on your return:</strong>
                <ul style={{ marginTop: "0.5rem", lineHeight: 1.7 }}>
                  <li>Box 10 / Box 11: Canadian eligible dividends (grossed up 38%)</li>
                  <li>Box 13: Interest from Canadian sources</li>
                  <li>Box 15 / Box 16: Foreign income and foreign tax paid</li>
                </ul>
              </div>
            </div>
          )}

          {/* Tax-loss harvesting */}
          {summary.taxLossHarvestOpportunities > 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
              <h3 style={{ marginTop: 0 }}>Tax-Loss Harvesting Opportunity</h3>
              <p style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "#166534" }}>
                You have <strong>{summary.taxLossHarvestOpportunities} holding{summary.taxLossHarvestOpportunities > 1 ? "s" : ""}</strong> in
                non-registered accounts with unrealized losses. Selling these locks in the capital loss,
                which can offset capital gains from other investments in the same year — or be carried
                back 3 years / forward indefinitely.
              </p>
              <p style={{ fontSize: "0.84rem", color: "#166534" }}>
                <strong>Superficial loss rule:</strong> You (or an affiliated person) cannot buy the same or identical security
                within 30 calendar days before or after the sale, or the loss is denied.
                Consider swapping to a similar-but-not-identical ETF (e.g., ZCN → VCN).
              </p>
            </div>
          )}
        </>
      )}

      {/* Benchmark comparison */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Benchmark Reference Returns</h3>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
            Approximate historical returns for common Canadian benchmarks (CAD, as of late 2024). Past performance does not guarantee future results.
          </p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
          <thead>
            <tr style={{ background: "var(--background)" }}>
              {["Benchmark", "1-Year", "3-Year Ann.", "5-Year Ann.", "MER"].map((h) => (
                <th key={h} style={{ padding: "0.6rem 0.9rem", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BENCHMARKS.map((b, i) => (
              <tr key={b.name} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{b.name}</td>
                <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: returnColor(b.annualReturn1yr) }}>{fmtPct(b.annualReturn1yr)}</td>
                <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: returnColor(b.annualReturn3yr) }}>{fmtPct(b.annualReturn3yr)}</td>
                <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: returnColor(b.annualReturn5yr) }}>{fmtPct(b.annualReturn5yr)}</td>
                <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{b.mer}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
