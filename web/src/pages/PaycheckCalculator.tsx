import { useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";

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

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

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

export default function PaycheckCalculator() {
  const { user } = useAuth();

  const [inputMode, setInputMode] = useState<"annual" | "period">("annual");
  const [grossInput, setGrossInput] = useState("");
  const [province, setProvince] = useState(user?.province || "ON");
  const [payFrequency, setPayFrequency] = useState(26);
  const [isSelfEmployed, setIsSelfEmployed] = useState(false);
  const [rrsp, setRrsp] = useState(0);
  const [pension, setPension] = useState(0);
  const [unionDues, setUnionDues] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const bar = (pct: number, color: string) => (
    <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginTop: 4 }}>
      <div style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );

  return (
    <div style={{ padding: "2rem", maxWidth: 900 }}>
      <h1>Paycheck Calculator</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 660 }}>
        Calculate your exact take-home pay after CPP/QPP, EI/QPIP, federal income tax,
        and provincial income tax for all 13 Canadian provinces and territories.
      </p>

      {/* ── Inputs ── */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Your Pay Details</h3>

        {/* Income input */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["annual", "period"] as const).map((m) => (
            <button key={m} onClick={() => setInputMode(m)} style={{
              padding: "0.35rem 1rem", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer",
              background: inputMode === m ? "var(--primary)" : "var(--background)",
              color: inputMode === m ? "white" : "inherit", fontSize: "0.85rem",
            }}>
              {m === "annual" ? "Annual salary" : "Per paycheck"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <div className="form-group">
            <label>{inputMode === "annual" ? "Annual Gross Salary ($)" : `Gross Per Paycheck ($) — ×${payFrequency}/yr`}</label>
            <input
              type="number" min={0} value={grossInput}
              onChange={(e) => setGrossInput(e.target.value)}
              placeholder={inputMode === "annual" ? "e.g. 80000" : "e.g. 3077"}
            />
            {inputMode === "period" && grossAnnual > 0 && (
              <small style={{ color: "var(--text-secondary)" }}>= {fmt(grossAnnual)}/year</small>
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
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
              <input type="checkbox" checked={isSelfEmployed} onChange={(e) => setIsSelfEmployed(e.target.checked)} />
              Self-employed (pays both CPP halves)
            </label>
          </div>
        </div>

        <details style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem", color: "var(--primary)", userSelect: "none" }}>
            Optional deductions (reduce taxable income)
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "0.75rem" }}>
            <div className="form-group">
              <label>RRSP Contribution (annual $)</label>
              <input type="number" min={0} value={rrsp} onChange={(e) => setRrsp(Number(e.target.value))} />
              <small style={{ color: "var(--text-secondary)" }}>Group RRSP or personal plan deduction</small>
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
        {error && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Donut-style summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[
              { label: "Gross Pay", annual: result.gross, period: result.grossPeriod, color: "var(--primary)" },
              { label: "Total Deductions", annual: result.totalDeductions, period: result.deductionsPeriod, color: "var(--danger)" },
              { label: "Take-Home Pay", annual: result.netAnnual, period: result.netPeriod, color: "var(--success)" },
            ].map((c) => (
              <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{c.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: c.color }}>{fmt(c.annual)}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  {fmt(c.period)} / {result.periodLabel.toLowerCase().split(" ")[0]}
                </div>
                {bar(c.annual / result.gross, c.color)}
              </div>
            ))}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>Tax Rates</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.2rem" }}>Effective: <span style={{ color: "var(--primary)" }}>{fmtPct(result.effectiveRate)}</span></div>
              <div style={{ fontSize: "0.85rem" }}>Marginal Fed: <strong>{fmtPct(result.marginalFed)}</strong></div>
              <div style={{ fontSize: "0.85rem" }}>Marginal Prov: <strong>{fmtPct(result.marginalProv)}</strong></div>
            </div>
          </div>

          {/* Full breakdown table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ margin: 0 }}>Pay Stub Breakdown</h3>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                {result.periodLabel} ({result.periods}×/year) · {PROVINCES.find(p => p[0] === province)?.[1]} · 2024 rates
              </p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  {["Item", "Annual", `Per ${result.periodLabel.split(" ")[0]}`, "% of Gross"].map((h) => (
                    <th key={h} style={{ padding: "0.6rem 0.9rem", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Gross */}
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
                    <tr key={i}><td colSpan={4} style={{ borderBottom: "1px solid var(--border)", padding: 0, background: "var(--border)", height: 1 }} /></tr>
                  );
                  return (
                    <tr key={row.label} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                      <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", paddingLeft: row.sub ? "1.75rem" : "0.9rem", fontWeight: row.bold ? 700 : 400, color: row.color }}>
                        {row.label}
                      </td>
                      <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: row.bold ? 700 : 400, color: row.color }}>{fmt(row.annual)}</td>
                      <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: row.color }}>{fmt(row.period)}</td>
                      <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                        {result.gross > 0 ? fmtPct(row.annual / result.gross) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Key notes */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>2024 Payroll Rates Used</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", fontSize: "0.84rem" }}>
              {[
                { title: result.isQC ? "QPP (Québec)" : "CPP", items: [`Rate: ${result.isQC ? "6.40" : "5.95"}% (employee)`, `YMPE: $68,500`, `Basic exemption: $3,500`, `Max contribution: ${result.isQC ? "$4,160" : "$3,867.50"}`] },
                { title: result.isQC ? "EI (reduced) + QPIP" : "EI", items: result.isQC ? ["EI rate: 1.32%", "Max insurable: $63,200", "QPIP rate: 0.494%", "QPIP max insurable: $94,000"] : ["Rate: 1.66%", "Max insurable: $63,200", "Max premium: $1,049.12"] },
                { title: "Federal Tax", items: ["15% on first $55,867", "20.5% on $55,867–$111,733", "26% on $111,733–$154,906", "29% on $154,906–$220,000", "33% above $220,000"] },
                { title: "Disclaimer", items: ["Results are estimates for planning only.", "Actual withholding depends on TD1 claims, other income, and employer payroll software.", "Consult a CPA or use CRA's Payroll Deductions Online Calculator for payroll filings."] },
              ].map((g) => (
                <div key={g.title} style={{ background: "var(--background)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>{g.title}</div>
                  {g.items.map((item) => <div key={item} style={{ color: "var(--text-secondary)", marginBottom: "0.2rem" }}>{item}</div>)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
