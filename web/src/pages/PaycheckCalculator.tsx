// Canadian paycheck calculator covering CPP/QPP, EI/QPIP, and all provincial tax rates
import { useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import "./PaycheckCalculator.css";
import { fmtCAD as fmt, fmtPctRatio as fmtPct } from "../utils/formatters";

interface Result {
  gross: number; grossPeriod: number;
  cpp: number; cpp2: number; totalCPP: number; cppPeriod: number;
  ei: number; qpip: number; totalEI: number; eiPeriod: number;
  fedTax: number; fedPeriod: number;
  provTax: number; provPeriod: number;
  extraDeductions: number; extraPeriod: number;
  totalDeductions: number; deductionsPeriod: number;
  netAnnual: number; netPeriod: number;
  effectiveRate: number; marginalFed: number; marginalProv: number;
  periodLabel: string; periods: number; isQC: boolean; isSelfEmployed: boolean;
}

const PROVINCES = [
  ["AB","Alberta"],["BC","British Columbia"],["MB","Manitoba"],["NB","New Brunswick"],
  ["NL","Newfoundland & Labrador"],["NS","Nova Scotia"],["NT","Northwest Territories"],
  ["NU","Nunavut"],["ON","Ontario"],["PE","Prince Edward Island"],
  ["QC","Québec"],["SK","Saskatchewan"],["YT","Yukon"],
];

const FREQUENCIES = [
  { value: 52, label: "Weekly (52×/year)" },
  { value: 26, label: "Biweekly (26×/year)" },
  { value: 24, label: "Semi-monthly (24×/year)" },
  { value: 12, label: "Monthly (12×/year)" },
];

// Renders input panel, calls backend for tax calculation, then shows pay stub table
export default function PaycheckCalculator() {
  const { user } = useAuth();

  const [inputMode, setInputMode]       = useState<"annual" | "period">("annual");
  const [grossInput, setGrossInput]     = useState("");
  const [province, setProvince]         = useState(user?.province || "ON");
  const [payFrequency, setPayFrequency] = useState(26);
  const [isSelfEmployed, setIsSelfEmployed] = useState(false);
  const [rrsp, setRrsp]         = useState(0);
  const [pension, setPension]   = useState(0);
  const [unionDues, setUnionDues] = useState(0);
  const [result, setResult]     = useState<Result | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Normalise per-period input to annual so the backend always receives one figure
  const grossAnnual =
    inputMode === "annual"
      ? Number(grossInput)
      : Number(grossInput) * payFrequency;

  const calculate = async () => {
    if (!grossInput || grossAnnual <= 0) { setError("Enter a gross income amount."); return; }
    setLoading(true); setError("");
    try {
      const data = await api("/income/paycheck", {
        method: "POST",
        body: JSON.stringify({ grossAnnual, province, payFrequency, isSelfEmployed, rrspContribution: rrsp, pensionContribution: pension, unionDues }),
      });
      setResult(data);
    } catch (e: any) { setError(e?.message ?? "Calculation failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="paycheck-container">
      <h1>Paycheck Calculator</h1>
      <p className="paycheck-intro">
        Calculate your exact take-home pay after CPP/QPP, EI/QPIP, federal income tax,
        and provincial income tax for all 13 Canadian provinces and territories.
      </p>

      {/* ── Inputs ── */}
      <div className="section-card">
        <h3>Your Pay Details</h3>

        <div className="mode-toggle">
          {(["annual", "period"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              className={inputMode === m ? "mode-btn active" : "mode-btn"}
            >
              {m === "annual" ? "Annual salary" : "Per paycheck"}
            </button>
          ))}
        </div>

        <div className="paycheck-input-grid">
          <div className="form-group">
            <label>{inputMode === "annual" ? "Annual Gross Salary ($)" : `Gross Per Paycheck ($) — ×${payFrequency}/yr`}</label>
            <input
              type="number" min={0} value={grossInput}
              onChange={(e) => setGrossInput(e.target.value)}
              placeholder={inputMode === "annual" ? "e.g. 80000" : "e.g. 3077"}
            />
            {inputMode === "period" && grossAnnual > 0 && (
              <small>= {fmt(grossAnnual)}/year</small>
            )}
          </div>

          <div className="form-group">
            <label>Province / Territory</label>
            <select value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Pay Frequency</label>
            <select value={payFrequency} onChange={(e) => setPayFrequency(Number(e.target.value))}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Employment Type</label>
            <label className="checkbox-label" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={isSelfEmployed} onChange={(e) => setIsSelfEmployed(e.target.checked)} />
              Self-employed (pays both CPP halves)
            </label>
          </div>
        </div>

        <details className="optional-deductions">
          <summary>Optional deductions (reduce taxable income)</summary>
          <div className="deductions-grid">
            <div className="form-group">
              <label>RRSP Contribution (annual $)</label>
              <input type="number" min={0} value={rrsp} onChange={(e) => setRrsp(Number(e.target.value))} />
              <small>Group RRSP or personal plan deduction</small>
            </div>
            <div className="form-group">
              <label>RPP / Pension (annual $)</label>
              <input type="number" min={0} value={pension} onChange={(e) => setPension(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Union / Professional Dues (annual $)</label>
              <input type="number" min={0} value={unionDues} onChange={(e) => setUnionDues(Number(e.target.value))} />
            </div>
          </div>
        </details>

        <button className="btn btn-primary" style={{ minWidth: 180 }} onClick={calculate} disabled={loading}>
          {loading ? "Calculating…" : "Calculate Take-Home Pay"}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="paycheck-summary-grid">
            {[
              { label: "Gross Pay",        annual: result.gross,          period: result.grossPeriod,      color: "var(--primary)" },
              { label: "Total Deductions", annual: result.totalDeductions, period: result.deductionsPeriod, color: "var(--danger)" },
              { label: "Take-Home Pay",    annual: result.netAnnual,       period: result.netPeriod,        color: "var(--success)" },
            ].map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-label">{c.label}</div>
                <div className="stat-value" style={{ color: c.color }}>{fmt(c.annual)}</div>
                <div className="stat-sub">{fmt(c.period)} / {result.periodLabel.toLowerCase().split(" ")[0]}</div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(100, c.annual / result.gross * 100)}%`, background: c.color }} />
                </div>
              </div>
            ))}
            <div className="stat-card">
              <div className="stat-label">Tax Rates</div>
              <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 2 }}>
                Effective: <span style={{ color: "var(--primary)" }}>{fmtPct(result.effectiveRate)}</span>
              </div>
              <div style={{ fontSize: "0.75rem" }}>Marginal Fed: <strong>{fmtPct(result.marginalFed)}</strong></div>
              <div style={{ fontSize: "0.75rem" }}>Marginal Prov: <strong>{fmtPct(result.marginalProv)}</strong></div>
            </div>
          </div>

          {/* Pay stub table */}
          <div className="paystub-card">
            <div className="paystub-header">
              <h3>Pay Stub Breakdown</h3>
              <p>{result.periodLabel} ({result.periods}×/year) · {PROVINCES.find(p => p[0] === province)?.[1]} · 2024 rates</p>
            </div>
            <table className="paystub-table">
              <thead>
                <tr>
                  {["Item", "Annual", `Per ${result.periodLabel.split(" ")[0]}`, "% of Gross"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Gross Pay", annual: result.gross, period: result.grossPeriod, bold: true, color: "inherit" },
                  { label: "— separator —", annual: 0, period: 0, separator: true },
                  { label: result.isQC ? "QPP contribution" : "CPP contribution", annual: result.cpp, period: result.cppPeriod, sub: true, color: "var(--danger)" },
                  ...(result.cpp2 > 0 ? [{ label: result.isQC ? "QPP2 contribution" : "CPP2 contribution", annual: result.cpp2, period: result.cpp2 / result.periods, sub: true, color: "var(--danger)" }] : []),
                  ...(result.qpip > 0 ? [{ label: "QPIP premium (Québec)", annual: result.qpip, period: result.qpip / result.periods, sub: true, color: "var(--danger)" }] : []),
                  { label: result.isQC ? "EI premium (reduced)" : "EI premium", annual: result.ei, period: result.eiPeriod, sub: true, color: "var(--danger)" },
                  { label: "Federal income tax", annual: result.fedTax, period: result.fedPeriod, sub: true, color: "var(--danger)" },
                  { label: `${PROVINCES.find(p => p[0] === province)?.[1]} provincial tax`, annual: result.provTax, period: result.provPeriod, sub: true, color: "var(--danger)" },
                  ...(result.extraDeductions > 0 ? [{ label: "RRSP / RPP / union dues", annual: result.extraDeductions, period: result.extraPeriod, sub: true, color: "var(--danger)" }] : []),
                  { label: "Total Deductions", annual: result.totalDeductions, period: result.deductionsPeriod, bold: true, color: "var(--danger)" },
                  { label: "— separator —", annual: 0, period: 0, separator: true },
                  { label: "Net Take-Home Pay", annual: result.netAnnual, period: result.netPeriod, bold: true, color: "var(--success)" },
                ].map((row: any, i) => {
                  if (row.separator) return (
                    <tr key={i} className="separator-row"><td colSpan={4} /></tr>
                  );
                  return (
                    <tr key={row.label} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td className={row.sub ? "td-sub" : ""} style={{ fontWeight: row.bold ? 700 : 400, color: row.color }}>
                        {row.label}
                      </td>
                      <td style={{ fontWeight: row.bold ? 700 : 400, color: row.color }}>{fmt(row.annual)}</td>
                      <td style={{ color: row.color }}>{fmt(row.period)}</td>
                      <td className="td-pct">
                        {result.gross > 0 ? fmtPct(row.annual / result.gross) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Key notes */}
          <div className="notes-card">
            <h3>2024 Payroll Rates Used</h3>
            <div className="notes-grid">
              {[
                { title: result.isQC ? "QPP (Québec)" : "CPP", items: [`Rate: ${result.isQC ? "6.40" : "5.95"}% (employee)`, `YMPE: $68,500`, `Basic exemption: $3,500`, `Max contribution: ${result.isQC ? "$4,160" : "$3,867.50"}`] },
                { title: result.isQC ? "EI (reduced) + QPIP" : "EI", items: result.isQC ? ["EI rate: 1.32%", "Max insurable: $63,200", "QPIP rate: 0.494%", "QPIP max insurable: $94,000"] : ["Rate: 1.66%", "Max insurable: $63,200", "Max premium: $1,049.12"] },
                { title: "Federal Tax", items: ["15% on first $55,867", "20.5% on $55,867–$111,733", "26% on $111,733–$154,906", "29% on $154,906–$220,000", "33% above $220,000"] },
                { title: "Disclaimer", items: ["Results are estimates for planning only.", "Actual withholding depends on TD1 claims, other income, and employer payroll software.", "Consult a CPA or use CRA's Payroll Deductions Online Calculator for payroll filings."] },
              ].map((g) => (
                <div key={g.title} className="note-card">
                  <div className="note-card-title">{g.title}</div>
                  {g.items.map((item) => <div key={item} className="note-card-item">{item}</div>)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
