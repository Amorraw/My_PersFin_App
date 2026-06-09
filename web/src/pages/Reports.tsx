// Printable financial reports: annual spending, RRSP, capital gains, net worth, and budget
import { useState, useEffect, useCallback, useRef } from "react";
import './Reports.css';
import { fmtMoney as CAD, fmtPctSigned as PCT } from "../utils/formatters";

type ReportType = "annual-spending" | "rrsp-summary" | "capital-gains" | "net-worth-trend" | "budget-performance";

const REPORT_META: Record<ReportType, { label: string; icon: string; desc: string }> = {
  "annual-spending":    { label: "Annual Spending Summary",    icon: "📊", desc: "Income vs. expenses by category and month" },
  "rrsp-summary":       { label: "RRSP Contribution Summary",  icon: "🏦", desc: "Contribution room, limits, and RRSP deadline" },
  "capital-gains":      { label: "Capital Gains / T5008",      icon: "📈", desc: "Realized gains and losses for Schedule 3" },
  "net-worth-trend":    { label: "Net Worth Trend",            icon: "📉", desc: "Historical net worth trajectory" },
  "budget-performance": { label: "Budget Performance YTD",     icon: "🎯", desc: "Actual vs. budget for each category" },
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Renders report selector, fetched data table, and print/download controls
export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>("annual-spending");
  const [year, setYear] = useState(new Date().getFullYear());
  const [trendMonths, setTrendMonths] = useState(12);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const params =
        activeReport === "net-worth-trend"
          ? `?months=${trendMonths}`
          : `?year=${year}`;
      const res = await fetch(`/api/reports/${activeReport}${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load report");
    }
    setLoading(false);
  }, [activeReport, year, trendMonths]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? "";
    const title = REPORT_META[activeReport].label;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 11px; border: 1px solid #d1d5db; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; }
        .cards { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
        .card { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 14px; min-width: 120px; }
        .card-label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
        .card-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
        .green { color: #059669; } .red { color: #dc2626; } .amber { color: #d97706; }
        .badge { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
        .badge-over { background: #fef2f2; color: #dc2626; }
        .badge-warn { background: #fffbeb; color: #d97706; }
        .badge-ok { background: #f0fdf4; color: #059669; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${title}</h1>
      <p style="color:#6b7280;font-size:11px">Generated ${new Date().toLocaleDateString("en-CA")} · PersFin</p>
      ${content}
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const downloadFile = async (url: string, filename: string, mimeType: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return alert("Export failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    a.download = filename;
    a.click();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - i);

  return (
    <div className="reports-container">
      <div className="reports-page-header">
        <div>
          <h1>Reports &amp; Export</h1>
          <p className="reports-page-subtitle">Generate PDF reports and export your data</p>
        </div>
        <div className="reports-export-actions">
          <button className="reports-export-btn" onClick={handlePrint}>
            🖨️ Print / Save PDF
          </button>
          <button
            className="reports-export-btn"
            onClick={() => downloadFile(`/api/reports/export/transactions-csv?year=${year}`, `transactions_${year}.csv`, "text/csv")}
          >
            ⬇️ Transactions CSV
          </button>
          <button
            className="reports-export-btn"
            onClick={() => downloadFile(`/api/reports/export/transactions-ofx?year=${year}`, `transactions_${year}.qfx`, "application/x-ofx")}
          >
            ⬇️ QFX (Quicken)
          </button>
          <button
            className="reports-export-btn"
            onClick={() => downloadFile(`/api/reports/export/holdings-csv`, `holdings_${year}.csv`, "text/csv")}
          >
            ⬇️ Holdings CSV
          </button>
        </div>
      </div>

      <div className="reports-selector">
        {(Object.keys(REPORT_META) as ReportType[]).map((key) => {
          const m = REPORT_META[key];
          const active = activeReport === key;
          return (
            <button
              key={key}
              onClick={() => setActiveReport(key)}
              className={`report-type-btn${active ? " active" : ""}`}
            >
              <div className="report-type-icon">{m.icon}</div>
              <div className="report-type-label">{m.label}</div>
              <div className="report-type-desc">{m.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="reports-controls">
        {activeReport !== "net-worth-trend" ? (
          <label>
            Tax Year:
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Period:
            <select value={trendMonths} onChange={(e) => setTrendMonths(parseInt(e.target.value))}>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={24}>24 months</option>
              <option value={36}>3 years</option>
              <option value={60}>5 years</option>
            </select>
          </label>
        )}
        <button className="btn btn-primary" onClick={fetchReport}>Generate</button>
      </div>

      <div className="report-content-card">
        {loading && <div className="report-loading">Generating report…</div>}
        {error && <div className="report-error">⚠️ Error: {error}</div>}
        {!loading && !error && !data && (
          <div style={{ padding: 48, textAlign: "center", color: "#9ca3af" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>No data available</p>
            <p style={{ fontSize: 14 }}>Click "Generate" to create this report</p>
          </div>
        )}
        {!loading && !error && data && (
          <div ref={printRef}>
            {activeReport === "annual-spending" && <AnnualSpendingReport data={data} />}
            {activeReport === "rrsp-summary" && <RRSPReport data={data} />}
            {activeReport === "capital-gains" && <CapitalGainsReport data={data} />}
            {activeReport === "net-worth-trend" && <NetWorthTrendReport data={data} />}
            {activeReport === "budget-performance" && <BudgetPerformanceReport data={data} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Annual Spending ─────────────────────────────────────────────────────────────
function AnnualSpendingReport({ data }: { data: any }) {
  if (!data || !data.byCategory) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No transaction data found for the selected year.
      </div>
    );
  }

  const categories = Object.entries(data.byCategory as Record<string, any>).sort(
    (a, b) => (b[1]?.expense ?? 0) - (a[1]?.expense ?? 0)
  );

  if (categories.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No transactions recorded for {data.year}. Import or create transactions to see spending breakdown.
      </div>
    );
  }

  return (
    <>
      <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Annual Spending Summary — {data.year}</h2>
      <div className="cards" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Income", value: CAD(data.totalIncome ?? 0), color: "#059669" },
          { label: "Total Expenses", value: CAD(data.totalExpense ?? 0), color: "#dc2626" },
          { label: "Net Surplus / Deficit", value: CAD((data.totalIncome ?? 0) - (data.totalExpense ?? 0)), color: (data.totalIncome ?? 0) - (data.totalExpense ?? 0) >= 0 ? "#059669" : "#dc2626" },
          { label: "Categories", value: categories.length, color: "#2563eb" },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", flex: "1 1 150px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color, marginTop: 4 }}>{typeof c.value === 'number' ? c.value : c.value}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Monthly Breakdown</h3>
      <div style={{ overflowX: "auto", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Month</th>
              <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>Income</th>
              <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>Expenses</th>
              <th style={{ padding: "8px 10px", textAlign: "right", borderBottom: "1px solid #e5e7eb" }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {(data.months ?? []).map((m: any) => {
              const net = (m?.income ?? 0) - (m?.expense ?? 0);
              return (
                <tr key={m?.month} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 10px" }}>{MONTH_NAMES[m?.month ?? 0]}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#059669" }}>{CAD(m?.income ?? 0)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#dc2626" }}>{CAD(m?.expense ?? 0)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: net >= 0 ? "#059669" : "#dc2626" }}>{CAD(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Spending by Category</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f9fafb" }}>
            {["Category", "Expenses", "Income", "Transactions", "% of Total Expense"].map((h) => (
              <th key={h} style={{ padding: "8px 10px", textAlign: h === "Category" ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map(([cat, vals]: [string, any]) => (
            <tr key={cat} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "7px 10px" }}>{cat || "Uncategorized"}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", color: "#dc2626" }}>{CAD(vals?.expense ?? 0)}</td>
              <td style={{ padding: "7px 10px", textAlign: "right", color: "#059669" }}>{CAD(vals?.income ?? 0)}</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>{vals?.count ?? 0}</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {(data?.totalExpense ?? 0) > 0 ? (((vals?.expense ?? 0) / (data.totalExpense)) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ── RRSP Summary ────────────────────────────────────────────────────────────────
function RRSPReport({ data }: { data: any }) {
  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No RRSP data available.
      </div>
    );
  }

  const accounts = data.accounts ?? [];
  const totals = data.totals ?? { limit: 0, contributed: 0, remaining: 0 };

  return (
    <>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>RRSP Contribution Summary — {data.taxYear ?? new Date().getFullYear()}</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
        Contribution deadline: <strong>{data.deadline ?? "March 1"}</strong> · Period: {data.periodStart ?? "—"} to {data.periodEnd ?? "—"}
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Contribution Limit", value: CAD(totals.limit ?? 0) },
          { label: "Total Contributed", value: CAD(totals.contributed ?? 0), color: "#2563eb" },
          { label: "Remaining Room", value: CAD(totals.remaining ?? 0), color: (totals.remaining ?? 0) > 0 ? "#059669" : "#dc2626" },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", flex: "1 1 150px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color ?? "#111", marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {accounts.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No RRSP accounts found. Add them under Tax Planning.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {["Account", "Contribution Limit", "Contributed", "Remaining Room", "Prior Year Income"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: h === "Account" ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a: any) => (
              <tr key={a?.accountName} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "7px 10px" }}>{a?.accountName ?? "Unknown"}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{CAD(a?.contributionLimit ?? 0)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: "#2563eb" }}>{CAD(a?.contributed ?? 0)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right", color: (a?.remainingRoom ?? 0) >= 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>{CAD(a?.remainingRoom ?? 0)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{CAD(a?.priorYearIncome ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 20, padding: 14, background: "#eff6ff", borderRadius: 8, fontSize: 13, color: "#1e40af" }}>
        <strong>Note:</strong> RRSP contribution room = 18% of prior year earned income, up to $31,560 (2024). Over-contributions beyond $2,000 lifetime buffer attract a 1%/month penalty. Contributions made in the first 60 days of a calendar year can be deducted on the prior year's return.
      </div>
    </>
  );
}

// ── Capital Gains ───────────────────────────────────────────────────────────────
function CapitalGainsReport({ data }: { data: any }) {
  if (!data || !data.summary) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No data available for capital gains report.
      </div>
    );
  }

  const s = data.summary ?? {};
  const dispositions = data.dispositions ?? [];

  return (
    <>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Capital Gains / T5008 Summary — {data.taxYear ?? new Date().getFullYear()}</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>{data.note || "Capital gains inclusion rate 50% (2024)."}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Proceeds", value: CAD(s.totalProceeds ?? 0) },
          { label: "Total ACB", value: CAD(s.totalAcb ?? 0) },
          { label: "Net Gain / (Loss)", value: CAD(s.totalGain ?? 0), color: (s.totalGain ?? 0) >= 0 ? "#059669" : "#dc2626" },
          { label: "Taxable Gain (50%)", value: CAD(s.totalTaxableGain ?? 0), color: "#2563eb" },
          { label: "Total Gains", value: CAD(s.totalGains ?? 0), color: "#059669" },
          { label: "Total Losses", value: CAD(s.totalLosses ?? 0), color: "#dc2626" },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", flex: "1 1 130px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.color ?? "#111", marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {dispositions.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No dispositions recorded for {data.taxYear ?? "the selected year"}.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Security", "Symbol", "Type", "Buy Date", "Sell Date", "Qty", "ACB", "Proceeds", "Gain / Loss", "Taxable Gain", "Taxable"].map((h) => (
                  <th key={h} style={{ padding: "7px 8px", textAlign: ["Buy Date", "Sell Date", "Security", "Symbol", "Type"].includes(h) ? "left" : "right", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dispositions.map((d: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 8px" }}>{d.name ?? "Unknown"}</td>
                  <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{d.symbol ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{d.type ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{d.purchaseDate ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{d.soldDate ?? "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{d.quantity ?? 0}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{CAD(d.acb ?? 0)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{CAD(d.proceeds ?? 0)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: (d.gain ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{CAD(d.gain ?? 0)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{d.taxable ? CAD(d.taxableGain ?? 0) : "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: d.taxable ? "#fef2f2" : "#f0fdf4", color: d.taxable ? "#dc2626" : "#059669" }}>
                      {d.taxable ? "Taxable" : "Sheltered"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, background: "#fffbeb", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
        <strong>CRA Note:</strong> Report dispositions on Schedule 3 of your T1 return. Capital losses can offset capital gains in the current year, or be carried back 3 years / forward indefinitely.
      </div>
    </>
  );
}

// ── Net Worth Trend ─────────────────────────────────────────────────────────────
function NetWorthTrendReport({ data }: { data: any }) {
  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No net worth data available.
      </div>
    );
  }

  const s = data.summary ?? { first: 0, last: 0, change: 0, changePct: 0 };
  const points: any[] = data.points ?? [];

  const maxNW = Math.max(...(points.map((p) => p?.netWorth ?? 0) || [0]), 1);
  const minNW = Math.min(...(points.map((p) => p?.netWorth ?? 0) || [0]), 0);
  const range = maxNW - minNW || 1;

  return (
    <>
      <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Net Worth Trend — Last {data.months ?? 12} Months</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Starting Net Worth", value: CAD(s.first ?? 0) },
          { label: "Current Net Worth", value: CAD(s.last ?? 0), color: (s.last ?? 0) >= 0 ? "#059669" : "#dc2626" },
          { label: "Total Change", value: CAD(s.change ?? 0), color: (s.change ?? 0) >= 0 ? "#059669" : "#dc2626" },
          { label: "% Change", value: PCT(s.changePct ?? 0), color: (s.changePct ?? 0) >= 0 ? "#059669" : "#dc2626" },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", flex: "1 1 150px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.color ?? "#111", marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {points.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No net worth snapshots found. They are taken automatically on the 1st of each month.</div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, padding: "0 8px" }}>
              {points.map((p, i) => {
                const heightPct = ((((p?.netWorth ?? 0) - minNW) / range) * 140 + 20);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div
                      title={`${p?.date}: ${CAD(p?.netWorth ?? 0)}`}
                      style={{
                        width: "100%", height: heightPct, borderRadius: "4px 4px 0 0",
                        background: (p?.netWorth ?? 0) >= 0 ? "#2563eb" : "#dc2626",
                        minHeight: 4, cursor: "default",
                      }}
                    />
                    {points.length <= 24 && (
                      <div style={{ fontSize: 9, color: "#9ca3af", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                        {p?.date?.slice(0, 7) ?? ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Date", "Total Assets", "Total Liabilities", "Net Worth", "Change"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "Date" ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p: any, i: number) => {
                const prev = i > 0 ? points[i - 1]?.netWorth ?? 0 : null;
                const change = prev !== null ? (p?.netWorth ?? 0) - prev : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "7px 10px" }}>{p?.date ?? "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#059669" }}>{CAD(p?.totalAssets ?? 0)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#dc2626" }}>{CAD(p?.totalLiabilities ?? 0)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{CAD(p?.netWorth ?? 0)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: change === null ? "#9ca3af" : change >= 0 ? "#059669" : "#dc2626" }}>
                      {change !== null ? (change >= 0 ? "+" : "") + CAD(change) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ── Budget Performance ──────────────────────────────────────────────────────────
function BudgetPerformanceReport({ data }: { data: any }) {
  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
        No budget data available.
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      over:       { bg: "#fef2f2", color: "#dc2626", label: "Over Budget" },
      warning:    { bg: "#fffbeb", color: "#d97706", label: "Warning" },
      "on-track": { bg: "#f0fdf4", color: "#059669", label: "On Track" },
    };
    const s = styles[status] ?? styles["on-track"];
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const rows = data.rows ?? [];
  const totals = data.totals ?? { budgetYtd: 0, spent: 0, variance: 0 };

  return (
    <>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Budget Performance YTD — {data.year ?? new Date().getFullYear()}</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>Through month {data.monthsElapsed ?? 0} of 12</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Budget YTD", value: CAD(totals.budgetYtd ?? 0) },
          { label: "Total Spent", value: CAD(totals.spent ?? 0), color: (totals.spent ?? 0) > (totals.budgetYtd ?? 0) ? "#dc2626" : "#2563eb" },
          { label: "Variance", value: CAD(totals.variance ?? 0), color: (totals.variance ?? 0) >= 0 ? "#059669" : "#dc2626" },
          { label: "Overall Usage", value: (totals.budgetYtd ?? 0) > 0 ? `${(((totals.spent ?? 0) / (totals.budgetYtd ?? 0)) * 100).toFixed(1)}%` : "—" },
        ].map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", flex: "1 1 150px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.color ?? "#111", marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No active budgets found. Create budgets to track spending.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {["Category", "Period", "Monthly Budget", "Budget YTD", "Spent YTD", "Variance", "Usage", "Status"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: ["Category", "Period", "Status"].includes(h) ? "left" : "right", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const pct = (r?.budgetYtd ?? 0) > 0 ? (((r?.spent ?? 0) / (r.budgetYtd)) * 100) : 0;
              return (
                <tr key={r?.category} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 10px" }}>{r?.category ?? "Unknown"}</td>
                  <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280" }}>{r?.period ?? "monthly"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{CAD(r?.monthlyBudget ?? 0)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{CAD(r?.budgetYtd ?? 0)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: (r?.spent ?? 0) > (r?.budgetYtd ?? 0) ? "#dc2626" : "#111" }}>{CAD(r?.spent ?? 0)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: (r?.variance ?? 0) >= 0 ? "#059669" : "#dc2626", fontWeight: 600 }}>
                    {(r?.variance ?? 0) >= 0 ? "+" : ""}{CAD(r?.variance ?? 0)}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <div style={{ width: 60, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct > 100 ? "#dc2626" : pct > 80 ? "#d97706" : "#059669", borderRadius: 3 }} />
                      </div>
                      <span style={{ minWidth: 36 }}>{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "7px 10px" }}>{statusBadge(r?.status ?? "on-track")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
