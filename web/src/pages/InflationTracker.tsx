import { useState, useEffect } from "react";
import { api } from "../api";

interface CpiCategory {
  name: string;
  yoy: number;
  weight: number;
  budgetCategory: string;
}

interface CpiData {
  categories: CpiCategory[];
  liveCore: number | null;
  liveCoreDate: string | null;
  source: string;
  asOf: string;
}

interface BudgetRow {
  id: number;
  label: string;
  monthlyAmount: string;
  budgetCategory: string;
}

const BUDGET_CATEGORIES = [
  { value: "groceries",  label: "Groceries" },
  { value: "dining",     label: "Dining Out" },
  { value: "housing",    label: "Rent / Mortgage" },
  { value: "household",  label: "Household Ops" },
  { value: "clothing",   label: "Clothing & Footwear" },
  { value: "transport",  label: "Transportation" },
  { value: "health",     label: "Health & Personal" },
  { value: "recreation", label: "Recreation" },
  { value: "other",      label: "Other" },
];

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

let nextId = 1;
const defaultRows: BudgetRow[] = [
  { id: nextId++, label: "Groceries",       monthlyAmount: "600",  budgetCategory: "groceries" },
  { id: nextId++, label: "Rent",            monthlyAmount: "2000", budgetCategory: "housing" },
  { id: nextId++, label: "Gas & transit",   monthlyAmount: "300",  budgetCategory: "transport" },
  { id: nextId++, label: "Dining out",      monthlyAmount: "250",  budgetCategory: "dining" },
  { id: nextId++, label: "Healthcare",      monthlyAmount: "100",  budgetCategory: "health" },
  { id: nextId++, label: "Entertainment",   monthlyAmount: "150",  budgetCategory: "recreation" },
];

export default function InflationTracker() {
  const [cpiData, setCpiData] = useState<CpiData | null>(null);
  const [loadingCpi, setLoadingCpi] = useState(true);
  const [budget, setBudget] = useState<BudgetRow[]>(defaultRows);
  const [yearsBack, setYearsBack] = useState(3);

  useEffect(() => {
    api("/income/cpi")
      .then((d) => setCpiData(d))
      .catch(() => { /* use null */ })
      .finally(() => setLoadingCpi(false));
  }, []);

  const addRow = () =>
    setBudget((p) => [...p, { id: nextId++, label: "", monthlyAmount: "", budgetCategory: "other" }]);
  const removeRow = (id: number) => setBudget((p) => p.filter((r) => r.id !== id));
  const updateRow = (id: number, field: keyof BudgetRow, val: string) =>
    setBudget((p) => p.map((r) => (r.id === id ? { ...r, [field]: val } : r)));

  // For each budget row, find the CPI rate for its category
  const enrichedRows = budget.map((row) => {
    const cat = cpiData?.categories.find((c) => c.budgetCategory === row.budgetCategory);
    const cpiRate = cat?.yoy ?? cpiData?.categories[0]?.yoy ?? 2.7;
    const monthly = Number(row.monthlyAmount) || 0;
    const inflationImpactMonthly = monthly * (cpiRate / 100);
    const keepingUp = true; // user-controlled — they set the budget
    return { ...row, cpiRate, inflationImpactMonthly, keepingUp };
  });

  const totalMonthly = enrichedRows.reduce((s, r) => s + (Number(r.monthlyAmount) || 0), 0);
  const totalInflationHit = enrichedRows.reduce((s, r) => s + r.inflationImpactMonthly, 0);
  const blendedCPI = totalMonthly > 0
    ? enrichedRows.reduce((s, r) => s + r.cpiRate * (Number(r.monthlyAmount) || 0), 0) / totalMonthly
    : 2.7;

  // Cumulative inflation calculator
  const allItemsCPI = cpiData?.categories[0]?.yoy ?? 2.7;
  const cumulativeInflation = (Math.pow(1 + allItemsCPI / 100, yearsBack) - 1) * 100;
  const purchasingPower = 100 / (1 + cumulativeInflation / 100);

  const driftColor = (rate: number) =>
    rate >= 5 ? "var(--danger)" : rate >= 3 ? "#d97706" : "var(--success)";

  return (
    <div style={{ padding: "2rem", maxWidth: 1000 }}>
      <h1>Inflation Tracker</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: 680 }}>
        Compare your budget spending against Statistics Canada CPI category data.
        See how much extra inflation is costing you each month, by spending category.
      </p>

      {/* Live CPI banner */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1.5rem", alignItems: "center"
      }}>
        {loadingCpi ? (
          <span style={{ color: "var(--text-secondary)" }}>Loading CPI data…</span>
        ) : (
          <>
            <div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>All-Items CPI (2024 avg)</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: allItemsCPI >= 4 ? "var(--danger)" : allItemsCPI >= 2.5 ? "#d97706" : "var(--success)" }}>
                {fmtPct(allItemsCPI)}/yr
              </div>
            </div>
            {cpiData?.liveCore != null && (
              <div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                  Core Inflation (Weighted Median)
                  {cpiData.liveCoreDate && <span style={{ marginLeft: "0.4rem" }}>— {cpiData.liveCoreDate}</span>}
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)" }}>
                  {fmtPct(cpiData.liveCore)}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Live from Bank of Canada</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>Shelter (Rent + Owned)</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--danger)" }}>
                {fmtPct(cpiData?.categories.find(c => c.budgetCategory === "housing")?.yoy ?? 5.9)}/yr
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>Food — Grocery Stores</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#d97706" }}>
                {fmtPct(cpiData?.categories.find(c => c.budgetCategory === "groceries")?.yoy ?? 3.2)}/yr
              </div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: "0.74rem", color: "var(--text-secondary)", maxWidth: 240 }}>
              {cpiData?.source}
            </div>
          </>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>

        {/* CPI by Category table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ margin: 0 }}>CPI by Category (2024)</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ background: "var(--background)" }}>
                {["Category", "YoY Change", "CPI Weight"].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.9rem", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cpiData?.categories.map((cat, i) => (
                <tr key={cat.name} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                  <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: i === 0 ? 700 : 400 }}>{cat.name}</td>
                  <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", fontWeight: 700, color: driftColor(cat.yoy) }}>
                    {fmtPct(cat.yoy)}
                    <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginTop: 2 }}>
                      <div style={{ width: `${Math.min(100, cat.yoy * 10)}%`, height: "100%", background: driftColor(cat.yoy), borderRadius: 2 }} />
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem 0.9rem", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{cat.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Purchasing power calculator */}
        <div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Purchasing Power Erosion</h3>
            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              At {fmtPct(allItemsCPI)} annual inflation, how much does $100 lose over time?
            </p>
            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label>Years to project</label>
              <input type="range" min={1} max={20} value={yearsBack} onChange={(e) => setYearsBack(Number(e.target.value))} style={{ width: "100%" }} />
              <div style={{ textAlign: "center", fontWeight: 600 }}>{yearsBack} years</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ background: "var(--background)", borderRadius: 8, padding: "0.9rem" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>Cumulative Inflation</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--danger)" }}>{fmtPct(cumulativeInflation)}</div>
              </div>
              <div style={{ background: "var(--background)", borderRadius: 8, padding: "0.9rem" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>$100 buys only…</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#d97706" }}>${purchasingPower.toFixed(2)} worth</div>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              {Array.from({ length: Math.min(yearsBack, 10) }, (_, i) => i + 1).map((yr) => {
                const cumul = (Math.pow(1 + allItemsCPI / 100, yr) - 1) * 100;
                const pw = 100 / (1 + cumul / 100);
                return (
                  <div key={yr} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Year {yr}</span>
                    <span style={{ color: "var(--danger)" }}>+{cumul.toFixed(1)}% inflation</span>
                    <span style={{ color: "#d97706" }}>${pw.toFixed(2)} value</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.9rem 1.1rem", fontSize: "0.84rem" }}>
            <strong>Why this matters for your budget:</strong> If your income isn't rising at least as fast as CPI,
            your real purchasing power is declining. Shelter and food — which make up ~45% of the CPI basket —
            have been running well above the headline rate since 2022.
          </div>
        </div>
      </div>

      {/* Budget vs Inflation table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>My Budget vs. Inflation</h3>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
            Enter your monthly spending by category to see how much inflation is costing you each month.
          </p>
        </div>

        <div style={{ padding: "1rem 1.25rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem", marginBottom: "0.75rem" }}>
            <thead>
              <tr style={{ background: "var(--background)" }}>
                {["Spending Item", "Category", "Monthly ($)", "CPI Rate", "Inflation Hit/mo", ""].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.7rem", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrichedRows.map((row, i) => (
                <tr key={row.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                  <td style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(row.id, "label", e.target.value)}
                      placeholder="e.g. Rent"
                      style={{ width: "100%", padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: 5, background: "var(--background)" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
                    <select
                      value={row.budgetCategory}
                      onChange={(e) => updateRow(row.id, "budgetCategory", e.target.value)}
                      style={{ padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: 5, fontSize: "0.82rem", background: "var(--background)" }}
                    >
                      {BUDGET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
                    <input
                      type="number" min={0}
                      value={row.monthlyAmount}
                      onChange={(e) => updateRow(row.id, "monthlyAmount", e.target.value)}
                      style={{ width: 85, padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: 5, background: "var(--background)" }}
                    />
                  </td>
                  <td style={{ padding: "0.35rem 0.7rem", borderBottom: "1px solid var(--border)", fontWeight: 600, color: driftColor(row.cpiRate) }}>
                    {fmtPct(row.cpiRate)}
                  </td>
                  <td style={{ padding: "0.35rem 0.7rem", borderBottom: "1px solid var(--border)", color: "var(--danger)", fontWeight: 600 }}>
                    {row.inflationImpactMonthly > 0 ? `+${fmt(row.inflationImpactMonthly)}` : "—"}
                  </td>
                  <td style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)" }}>
                    {budget.length > 1 && (
                      <button onClick={() => removeRow(row.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={addRow} style={{ fontSize: "0.82rem" }}>+ Add Row</button>
        </div>

        {/* Totals */}
        <div style={{ borderTop: "2px solid var(--border)", padding: "1rem 1.25rem", display: "flex", flexWrap: "wrap", gap: "1.5rem", background: "var(--background)" }}>
          {[
            { label: "Total Monthly Budget", value: fmt(totalMonthly), color: "var(--primary)" },
            { label: "Your Blended CPI Rate", value: fmtPct(blendedCPI), color: driftColor(blendedCPI) },
            { label: "Inflation Cost / Month", value: `+${fmt(totalInflationHit)}`, color: "var(--danger)" },
            { label: "Inflation Cost / Year", value: `+${fmt(totalInflationHit * 12)}`, color: "var(--danger)" },
          ].map((c) => (
            <div key={c.label}>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>{c.label}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)", alignSelf: "center", maxWidth: 240 }}>
            To stay even with inflation, your income needs to rise by at least <strong style={{ color: driftColor(blendedCPI) }}>{fmtPct(blendedCPI)}/yr</strong> on these categories.
          </div>
        </div>
      </div>

      {/* Tips */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Inflation-Proofing Your Budget</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
          {[
            { tip: "Negotiate your rent annually and lock in longer leases when shelter inflation is high.", category: "Housing" },
            { tip: "Use flyer apps (Flipp, Reebee) and buy store brands to beat grocery CPI.", category: "Groceries" },
            { tip: "Shop car insurance annually — auto insurance inflation has outpaced headline CPI.", category: "Transport" },
            { tip: "Budget line items for annual price increases — treat inflation as a mandatory cost.", category: "Strategy" },
            { tip: "GICs at 4–5% interest rate beat current CPI — park emergency funds there, not in a savings account at 0.5%.", category: "Savings" },
            { tip: "TFSA holds GIC/HISA interest tax-free — the after-tax real return matters more than the nominal rate.", category: "Tax" },
          ].map((t) => (
            <div key={t.tip} style={{ background: "var(--background)", borderRadius: 8, padding: "0.9rem 1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.35rem", textTransform: "uppercase" }}>{t.category}</div>
              <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{t.tip}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
