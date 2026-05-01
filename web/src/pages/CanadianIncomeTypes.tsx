import { useState } from "react";
import { api } from "../api";

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

// ── CCB Calculator ───────────────────────────────────────────────────────────
function CCBCalculator() {
  const [income, setIncome] = useState(60000);
  const [children, setChildren] = useState([{ age: 4 }]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const addChild = () => setChildren((p) => [...p, { age: 5 }]);
  const updateAge = (i: number, age: number) =>
    setChildren((p) => p.map((c, j) => (j === i ? { age } : c)));
  const removeChild = (i: number) => setChildren((p) => p.filter((_, j) => j !== i));

  const calculate = async () => {
    setLoading(true);
    try {
      const data = await api("/income/ccb", {
        method: "POST",
        body: JSON.stringify({ netFamilyIncome: income, children }),
      });
      setResult(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
      <h3 style={{ marginTop: 0 }}>Canada Child Benefit (CCB) Estimator</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
        2024–25 CCB rates: <strong>$7,437/year</strong> per child under 6, <strong>$6,275/year</strong> per child 6–17.
        Reduces based on net family income above $36,502.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div className="form-group">
          <label>Net Family Income ($) <small style={{ color: "var(--text-secondary)" }}>(combined line 23600)</small></label>
          <input type="number" min={0} value={income} onChange={(e) => setIncome(Number(e.target.value))} />
        </div>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>Children</label>
        {children.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.88rem", color: "var(--text-secondary)", width: 60 }}>Child {i + 1}</span>
            <input
              type="number" min={0} max={17} value={c.age}
              onChange={(e) => updateAge(i, Number(e.target.value))}
              style={{ width: 70, padding: "0.35rem 0.5rem", border: "1px solid var(--border)", borderRadius: 6 }}
            />
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>years old</span>
            {children.length > 1 && (
              <button onClick={() => removeChild(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}>✕</button>
            )}
          </div>
        ))}
        {children.length < 6 && (
          <button className="btn" style={{ fontSize: "0.82rem", padding: "0.3rem 0.75rem" }} onClick={addChild}>+ Add child</button>
        )}
      </div>
      <button className="btn btn-primary" onClick={calculate} disabled={loading}>
        {loading ? "Calculating…" : "Calculate CCB"}
      </button>

      {result && (
        <div style={{ marginTop: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          {[
            { label: "Max Annual CCB", value: fmt(result.maxAnnual), color: "inherit" },
            { label: "Your Annual CCB", value: fmt(result.annual), color: "var(--success)" },
            { label: "Monthly Payment", value: fmt(result.monthly), color: "var(--success)" },
            { label: "Phase-out Applied", value: result.reduction > 0 ? fmt(result.reduction) : "None", color: result.reduction > 0 ? "var(--danger)" : "var(--success)" },
          ].map((c) => (
            <div key={c.label} style={{ background: "var(--background)", borderRadius: 8, padding: "0.9rem" }}>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{c.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            {result.notes.map((n: string, i: number) => (
              <p key={i} style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0.25rem 0" }}>• {n}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── GST Credit Calculator ────────────────────────────────────────────────────
function GSTCalculator() {
  const [income, setIncome] = useState(45000);
  const [hasSpouse, setHasSpouse] = useState(false);
  const [children, setChildren] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calculate = async () => {
    setLoading(true);
    try {
      const data = await api("/income/gst-credit", {
        method: "POST",
        body: JSON.stringify({ netFamilyIncome: income, hasSpouse, childrenUnder19: children }),
      });
      setResult(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.5rem", marginBottom: "1.5rem" }}>
      <h3 style={{ marginTop: 0 }}>GST/HST Credit Estimator</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
        2024 rates: <strong>$496/adult</strong>, <strong>$130/child</strong> under 19. Paid quarterly.
        Reduces by 5% of family income above $43,794.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div className="form-group">
          <label>Net Family Income ($)</label>
          <input type="number" min={0} value={income} onChange={(e) => setIncome(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Married or common-law?</label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
            <input type="checkbox" checked={hasSpouse} onChange={(e) => setHasSpouse(e.target.checked)} />
            Yes (adds $496/yr)
          </label>
        </div>
        <div className="form-group">
          <label>Children under 19</label>
          <input type="number" min={0} max={10} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={calculate} disabled={loading}>
        {loading ? "Calculating…" : "Calculate GST Credit"}
      </button>

      {result && (
        <div style={{ marginTop: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
          {[
            { label: "Max Annual Credit", value: fmt(result.maxAnnual), color: "inherit" },
            { label: "Your Annual Credit", value: fmt(result.annual), color: "var(--success)" },
            { label: "Per Quarter", value: fmt(result.quarterly), color: "var(--success)" },
          ].map((c) => (
            <div key={c.label} style={{ background: "var(--background)", borderRadius: 8, padding: "0.9rem" }}>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginBottom: "0.3rem" }}>{c.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            {result.notes.map((n: string, i: number) => (
              <p key={i} style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0.25rem 0" }}>• {n}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slip Reference Cards ─────────────────────────────────────────────────────
const SLIPS = [
  {
    code: "T4",
    title: "T4 — Statement of Remuneration Paid",
    description: "Issued by employers. Reports all employment income, CPP/EI deductions, income tax withheld, and other benefits.",
    keyBoxes: [
      { box: "14", label: "Employment income (total before deductions)" },
      { box: "16", label: "Employee's CPP contributions" },
      { box: "17", label: "Employee's CPP2 contributions" },
      { box: "18", label: "Employee's EI premiums" },
      { box: "22", label: "Income tax deducted" },
      { box: "52", label: "Pension adjustment (DB/DC pension)" },
      { box: "40", label: "Other taxable allowances/benefits (e.g. car allowance)" },
    ],
    taxTreatment: "All box 14 income is fully taxable. Report on line 10100 of your T1 return.",
    tip: "If you received a signing bonus, severance, or stock options these also appear on your T4.",
    color: "#2563eb",
  },
  {
    code: "T2125",
    title: "T2125 — Statement of Business Activities",
    description: "Filed by self-employed individuals and sole proprietors to report business/professional income and allowable expenses.",
    keyBoxes: [
      { box: "Gross income", label: "Total revenue from all business activities" },
      { box: "Net income", label: "Gross income minus allowable expenses" },
      { box: "Vehicle expenses", label: "Business-use-of-vehicle (must track km log)" },
      { box: "Home office", label: "Work-space-in-home deduction" },
      { box: "CCA", label: "Capital cost allowance on business assets" },
    ],
    taxTreatment: "Net business income flows to line 13500 of T1. You pay both halves of CPP (9.9% in 2024 on net income). GST/HST registration required over $30,000 in revenue.",
    tip: "Keep every receipt. Business expenses must be ordinary, necessary, and reasonable. CRA can audit 4 years back (6 for suspected fraud).",
    color: "#16a34a",
  },
  {
    code: "T776",
    title: "T776 — Statement of Real Estate Rentals",
    description: "Filed by landlords to report rental income and allowable expenses for residential or commercial properties.",
    keyBoxes: [
      { box: "Gross rents", label: "All rent and parking collected" },
      { box: "Advertising", label: "Listing and marketing costs" },
      { box: "Insurance", label: "Property insurance premiums" },
      { box: "Maintenance & repairs", label: "Repairs (not improvements)" },
      { box: "Property taxes", label: "Municipal property taxes paid" },
      { box: "Mortgage interest", label: "Interest portion only (not principal)" },
      { box: "CCA", label: "Capital cost allowance on property (caution: recapture on sale)" },
    ],
    taxTreatment: "Net rental income added to line 12600 of T1. CCA claimed on rental property creates recapture risk when you sell — generally not recommended for long-term holds.",
    tip: "Principal residence exemption does NOT apply to rental properties. Capital gains on sale are 50% (first $250K) or 2/3 (above $250K) taxable.",
    color: "#d97706",
  },
  {
    code: "T5",
    title: "T5 — Statement of Investment Income",
    description: "Issued by banks, brokerages, and corporations for investment income earned in non-registered accounts.",
    keyBoxes: [
      { box: "10", label: "Canadian eligible dividends (e.g. public company shares)" },
      { box: "11", label: "Taxable amount of eligible dividends (grossed up 38%)" },
      { box: "12", label: "Dividend tax credit" },
      { box: "13", label: "Interest from Canadian sources" },
      { box: "15", label: "Foreign income" },
      { box: "16", label: "Foreign tax paid" },
      { box: "25", label: "Canadian non-eligible dividends (private corp, some ETFs)" },
    ],
    taxTreatment: "Interest: 100% taxable (worst). Non-eligible dividends: grossed up 15%, tax credit 9.03% (federal). Eligible dividends: grossed up 38%, tax credit 15.0198% federal — most tax-efficient after capital gains.",
    tip: "T5 slips are not issued for TFSA or RRSP accounts — investments inside registered accounts are tax-sheltered.",
    color: "#7c3aed",
  },
  {
    code: "Gov",
    title: "Government Benefits — CERB, CRB, CCB, GST Credit",
    description: "Various federal government benefit programs, each with different tax treatment.",
    keyBoxes: [
      { box: "CERB / CRB (T4A)", label: "Canada Emergency Response / Recovery Benefit — fully taxable; many recipients owe tax at filing" },
      { box: "CCB (non-taxable)", label: "Canada Child Benefit — not reported as income, not taxable" },
      { box: "GST credit (non-taxable)", label: "GST/HST Credit — not reported as income, not taxable" },
      { box: "EI benefits (T4E)", label: "Employment Insurance — fully taxable at your marginal rate" },
      { box: "OAS / GIS (T4A)", label: "OAS is taxable; GIS is non-taxable" },
      { box: "CPP / QPP (T4A)", label: "Canada Pension Plan benefits — fully taxable" },
    ],
    taxTreatment: "CERB/CRB: No tax was withheld at source (or only 10%), so recipients often owe significant tax at filing. If you received CERB you weren't entitled to, you must repay — repayments are deductible in the year paid.",
    tip: "Always file your tax return on time even with $0 income — many credits and benefits (CCB, GST credit) require a filed return to calculate.",
    color: "#dc2626",
  },
];

export default function CanadianIncomeTypes() {
  const [expanded, setExpanded] = useState<string | null>("T4");

  return (
    <div style={{ padding: "2rem", maxWidth: 900 }}>
      <h1>Canadian Income Types — Tax Slip Guide</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Reference guide for T4, T2125, T776, T5, and government benefit income — how each is reported
        and taxed on your Canadian tax return (T1).
      </p>

      {/* Slip Cards */}
      {SLIPS.map((slip) => (
        <div key={slip.code} style={{ background: "var(--surface)", border: `1px solid var(--border)`, borderRadius: 10, marginBottom: "1rem", overflow: "hidden" }}>
          <button
            onClick={() => setExpanded(expanded === slip.code ? null : slip.code)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ background: slip.color, color: "white", fontWeight: 800, fontSize: "0.82rem", padding: "3px 10px", borderRadius: 6 }}>{slip.code}</span>
              <span style={{ fontWeight: 600 }}>{slip.title}</span>
            </div>
            <span style={{ color: "var(--text-secondary)", fontSize: "1.2rem" }}>{expanded === slip.code ? "▲" : "▼"}</span>
          </button>

          {expanded === slip.code && (
            <div style={{ padding: "0 1.25rem 1.25rem", borderTop: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "1rem" }}>{slip.description}</p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.84rem", marginBottom: "0.5rem" }}>Key Boxes / Fields</div>
                  <div style={{ background: "var(--background)", borderRadius: 8, padding: "0.75rem" }}>
                    {slip.keyBoxes.map((b) => (
                      <div key={b.box} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.4rem", fontSize: "0.82rem" }}>
                        <span style={{ background: slip.color + "22", color: slip.color, padding: "1px 7px", borderRadius: 4, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                          {b.box}
                        </span>
                        <span style={{ color: "var(--text-secondary)" }}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.84rem", marginBottom: "0.5rem" }}>Tax Treatment</div>
                  <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.6, background: "var(--background)", borderRadius: 8, padding: "0.75rem", margin: 0 }}>
                    {slip.taxTreatment}
                  </p>
                  <div style={{ marginTop: "0.75rem", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, padding: "0.75rem", fontSize: "0.82rem", color: "#78350f" }}>
                    <strong>Tip:</strong> {slip.tip}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Benefit Calculators */}
      <h2 style={{ marginTop: "2rem" }}>Benefit Calculators</h2>
      <CCBCalculator />
      <GSTCalculator />
    </div>
  );
}
