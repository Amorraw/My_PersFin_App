// Inflation tracker: shows Stats Canada CPI data and maps it against the user's budget
import { useState, useEffect } from "react";
import { api } from "../api";
import { fmtMoney } from "../components/charts";
import { fmtCAD as fmt, fmtPctSigned as fmtPct } from "../utils/formatters";
import "./InflationTracker.css";

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

let nextId = 1;
const defaultRows: BudgetRow[] = [
  { id: nextId++, label: "Groceries",     monthlyAmount: "600",  budgetCategory: "groceries" },
  { id: nextId++, label: "Rent",          monthlyAmount: "2000", budgetCategory: "housing" },
  { id: nextId++, label: "Gas & transit", monthlyAmount: "300",  budgetCategory: "transport" },
  { id: nextId++, label: "Dining out",    monthlyAmount: "250",  budgetCategory: "dining" },
  { id: nextId++, label: "Healthcare",    monthlyAmount: "100",  budgetCategory: "health" },
  { id: nextId++, label: "Entertainment", monthlyAmount: "150",  budgetCategory: "recreation" },
];

// Fetches CPI on mount, then enriches editable budget rows with per-category inflation rates
export default function InflationTracker() {
  const [cpiData, setCpiData]     = useState<CpiData | null>(null);
  const [loadingCpi, setLoadingCpi] = useState(true);
  const [budget, setBudget]       = useState<BudgetRow[]>(defaultRows);
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

  // Join each budget row with its matching CPI category rate for the inflation-hit calculation
  const enrichedRows = budget.map((row) => {
    const cat = cpiData?.categories.find((c) => c.budgetCategory === row.budgetCategory);
    const cpiRate = cat?.yoy ?? cpiData?.categories[0]?.yoy ?? 2.7;
    const monthly = Number(row.monthlyAmount) || 0;
    const inflationImpactMonthly = monthly * (cpiRate / 100);
    return { ...row, cpiRate, inflationImpactMonthly };
  });

  const totalMonthly     = enrichedRows.reduce((s, r) => s + (Number(r.monthlyAmount) || 0), 0);
  const totalInflationHit = enrichedRows.reduce((s, r) => s + r.inflationImpactMonthly, 0);
  // Spending-weighted average CPI rate across all budget rows
  const blendedCPI = totalMonthly > 0
    ? enrichedRows.reduce((s, r) => s + r.cpiRate * (Number(r.monthlyAmount) || 0), 0) / totalMonthly
    : 2.7;

  const allItemsCPI        = cpiData?.categories[0]?.yoy ?? 2.7;
  const cumulativeInflation = (Math.pow(1 + allItemsCPI / 100, yearsBack) - 1) * 100;
  const purchasingPower    = 100 / (1 + cumulativeInflation / 100);

  const driftColor = (rate: number) =>
    rate >= 5 ? "var(--danger)" : rate >= 3 ? "#d97706" : "var(--success)";

  return (
    <div className="inflation-container">
      <h1>Inflation Tracker</h1>
      <p className="inflation-intro">
        Compare your budget spending against Statistics Canada CPI category data.
        See how much extra inflation is costing you each month, by spending category.
      </p>

      {/* Live CPI banner */}
      <div className="cpi-banner">
        {loadingCpi ? (
          <span className="cpi-loading">Loading CPI data…</span>
        ) : (
          <>
            <div>
              <div className="cpi-stat-label">All-Items CPI (2024 avg)</div>
              <div className="cpi-stat-value large" style={{ color: allItemsCPI >= 4 ? "var(--danger)" : allItemsCPI >= 2.5 ? "#d97706" : "var(--success)" }}>
                {fmtPct(allItemsCPI)}/yr
              </div>
            </div>
            {cpiData?.liveCore != null && (
              <div>
                <div className="cpi-stat-label">
                  Core Inflation (Weighted Median)
                  {cpiData.liveCoreDate && <span style={{ marginLeft: 4 }}>— {cpiData.liveCoreDate}</span>}
                </div>
                <div className="cpi-stat-value large" style={{ color: "var(--primary)" }}>
                  {fmtPct(cpiData.liveCore)}
                </div>
                <div className="cpi-stat-label">Live from Bank of Canada</div>
              </div>
            )}
            <div>
              <div className="cpi-stat-label">Shelter (Rent + Owned)</div>
              <div className="cpi-stat-value" style={{ color: "var(--danger)" }}>
                {fmtPct(cpiData?.categories.find(c => c.budgetCategory === "housing")?.yoy ?? 5.9)}/yr
              </div>
            </div>
            <div>
              <div className="cpi-stat-label">Food — Grocery Stores</div>
              <div className="cpi-stat-value" style={{ color: "#d97706" }}>
                {fmtPct(cpiData?.categories.find(c => c.budgetCategory === "groceries")?.yoy ?? 3.2)}/yr
              </div>
            </div>
            <div className="cpi-source-note">{cpiData?.source}</div>
          </>
        )}
      </div>

      {/* Two-column layout */}
      <div className="two-col-grid">

        {/* CPI by Category table */}
        <div className="cpi-table-card">
          <div className="table-card-header">
            <h3>CPI by Category (2024)</h3>
          </div>
          <table className="cpi-table">
            <thead>
              <tr>
                {["Category", "YoY Change", "CPI Weight"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cpiData?.categories.map((cat, i) => (
                <tr key={cat.name} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                  <td style={{ fontWeight: i === 0 ? 700 : 400 }}>{cat.name}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: driftColor(cat.yoy) }}>{fmtPct(cat.yoy)}</span>
                    <div className="cpi-rate-bar-track">
                      <div className="cpi-rate-bar-fill" style={{ width: `${Math.min(100, cat.yoy * 10)}%`, background: driftColor(cat.yoy) }} />
                    </div>
                  </td>
                  <td style={{ color: "var(--text-light)" }}>{cat.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Purchasing power calculator */}
        <div>
          <div className="power-card">
            <h3>Purchasing Power Erosion</h3>
            <p className="power-card-intro">
              At {fmtPct(allItemsCPI)} annual inflation, how much does $100 lose over time?
            </p>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label>Years to project</label>
              <input type="range" min={1} max={20} value={yearsBack} onChange={(e) => setYearsBack(Number(e.target.value))} />
              <div className="power-range-label">{yearsBack} years</div>
            </div>
            <div className="power-summary-grid">
              <div className="power-stat">
                <div className="power-stat-label">Cumulative Inflation</div>
                <div className="power-stat-value" style={{ color: "var(--danger)" }}>{fmtPct(cumulativeInflation)}</div>
              </div>
              <div className="power-stat">
                <div className="power-stat-label">$100 buys only…</div>
                <div className="power-stat-value" style={{ color: "#d97706" }}>{fmtMoney(purchasingPower)} worth</div>
              </div>
            </div>
            <div className="power-year-list">
              {Array.from({ length: Math.min(yearsBack, 10) }, (_, i) => i + 1).map((yr) => {
                const cumul = (Math.pow(1 + allItemsCPI / 100, yr) - 1) * 100;
                const pw    = 100 / (1 + cumul / 100);
                return (
                  <div key={yr} className="power-year-row">
                    <span className="power-year-label">Year {yr}</span>
                    <span style={{ color: "var(--danger)" }}>+{cumul.toFixed(1)}% inflation</span>
                    <span style={{ color: "#d97706" }}>{fmtMoney(pw)} value</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="info-note">
            <strong>Why this matters for your budget:</strong> If your income isn't rising at least as fast as CPI,
            your real purchasing power is declining. Shelter and food — which make up ~45% of the CPI basket —
            have been running well above the headline rate since 2022.
          </div>
        </div>
      </div>

      {/* Budget vs Inflation table */}
      <div className="budget-table-card">
        <div className="budget-table-header">
          <h3>My Budget vs. Inflation</h3>
          <p>Enter your monthly spending by category to see how much inflation is costing you each month.</p>
        </div>
        <div className="budget-table-wrap">
          <table className="budget-table">
            <thead>
              <tr>
                {["Spending Item", "Category", "Monthly ($)", "CPI Rate", "Inflation Hit/mo", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrichedRows.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                  <td>
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(row.id, "label", e.target.value)}
                      placeholder="e.g. Rent"
                      className="budget-inline-input"
                    />
                  </td>
                  <td>
                    <select
                      value={row.budgetCategory}
                      onChange={(e) => updateRow(row.id, "budgetCategory", e.target.value)}
                      className="budget-select"
                    >
                      {BUDGET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number" min={0}
                      value={row.monthlyAmount}
                      onChange={(e) => updateRow(row.id, "monthlyAmount", e.target.value)}
                      className="budget-inline-input amount-input"
                    />
                  </td>
                  <td style={{ fontWeight: 600, color: driftColor(row.cpiRate) }}>
                    {fmtPct(row.cpiRate)}
                  </td>
                  <td style={{ color: "var(--danger)", fontWeight: 600 }}>
                    {row.inflationImpactMonthly > 0 ? `+${fmt(row.inflationImpactMonthly)}` : "—"}
                  </td>
                  <td>
                    {budget.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="remove-row-btn">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={addRow} style={{ fontSize: "0.75rem" }}>+ Add Row</button>
        </div>

        {/* Totals */}
        <div className="budget-totals">
          {[
            { label: "Total Monthly Budget",  value: fmt(totalMonthly),          color: "var(--primary)" },
            { label: "Your Blended CPI Rate", value: fmtPct(blendedCPI),         color: driftColor(blendedCPI) },
            { label: "Inflation Cost / Month", value: `+${fmt(totalInflationHit)}`, color: "var(--danger)" },
            { label: "Inflation Cost / Year",  value: `+${fmt(totalInflationHit * 12)}`, color: "var(--danger)" },
          ].map((c) => (
            <div key={c.label} className="budget-total-item">
              <div className="budget-total-label">{c.label}</div>
              <div className="budget-total-value" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
          <div className="budget-totals-note">
            To stay even with inflation, your income needs to rise by at least{" "}
            <strong style={{ color: driftColor(blendedCPI) }}>{fmtPct(blendedCPI)}/yr</strong> on these categories.
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="tips-card">
        <h3>Inflation-Proofing Your Budget</h3>
        <div className="tips-grid">
          {[
            { tip: "Negotiate your rent annually and lock in longer leases when shelter inflation is high.", category: "Housing" },
            { tip: "Use flyer apps (Flipp, Reebee) and buy store brands to beat grocery CPI.", category: "Groceries" },
            { tip: "Shop car insurance annually — auto insurance inflation has outpaced headline CPI.", category: "Transport" },
            { tip: "Budget line items for annual price increases — treat inflation as a mandatory cost.", category: "Strategy" },
            { tip: "GICs at 4–5% interest rate beat current CPI — park emergency funds there, not in a savings account at 0.5%.", category: "Savings" },
            { tip: "TFSA holds GIC/HISA interest tax-free — the after-tax real return matters more than the nominal rate.", category: "Tax" },
          ].map((t) => (
            <div key={t.tip} className="tip-card">
              <div className="tip-category">{t.category}</div>
              <div className="tip-text">{t.tip}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
