import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { api } from "../api";
import { useFinancialData } from "../contexts/FinancialDataContext";
import { EmergencyFundBanner } from "../components/EmergencyFundBanner";
import "./DebtOptimization.css";
import { DonutChart, fmtMoney } from "../components/charts";

interface DetectedDebt {
  accountId: string;
  name: string;
  accountType: string;
  accountTypeLabel: string;
  debtType: string;
  balance: number;
  institution: string | null;
  defaultInterestRate: number;
  defaultMinPayment: number;
  alreadyImported: boolean;
}

interface PayoffPlanData {
  strategy: string;
  totalDebt: number;
  totalInterest: number;
  payoffMonths: number;
  monthlyPayment: number;
  payoffDate: string;
}

interface ComparisonData {
  avalanche: { totalInterest: number; payoffMonths: number; monthlyPayment: number };
  snowball:  { totalInterest: number; payoffMonths: number; monthlyPayment: number };
}

interface LumpSumResultData {
  lumpSumAmount: number;
  recommendation: string;
  targetDebt: { name: string; interestRate: number; currentBalance: number } | null;
  annualInterestSavings: { ifAppliedToHighestInterest: number; ifAppliedToLowestBalance: number };
}

interface MortgageResultData {
  mortgageName: string;
  standardPayoff:    { monthlyPayment: number; payoffMonths: number; totalInterest: number; payoffDate: string };
  acceleratedPayoff: { method: string; accelerationAmount: number; monthlyPayment: number; payoffMonths: number; totalInterest: number; payoffDate: string };
  savings:           { interestSavings: number; yearsSaved: number };
  recommendation: string;
}

interface ConsolidationResultData {
  currentPlan:      { strategy: string; totalInterest: number; monthlyPayment: number };
  consolidatedPlan: { strategy: string; consolidationRate: number; totalInterest: number; payoffMonths: number; monthlyPayment: number };
  analysis:         { interestSavings: number; timeSavings: number; recommendation: string };
}

const CAD = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });

const TYPE_COLORS: Record<string, string> = {
  "credit-card":  "#fee2e2",
  "mortgage":     "#eff6ff",
  "auto-loan":    "#fef3c7",
  "student-loan": "#f0fdf4",
  "personal-loan":"#fdf4ff",
  "other":        "#f3f4f6",
};

export default function DebtOptimization(): ReactElement {
  const { debts, monthlySurplus, refresh: refreshFinancials } = useFinancialData();
  const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
  const [strategyType, setStrategyType] = useState<"avalanche" | "snowball" | "hybrid">("hybrid");
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [weighting, setWeighting] = useState(50);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PayoffPlanData | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonData | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | undefined>();
  const [analysisNotes, setAnalysisNotes] = useState<string[]>([]);
  const [consolidationWarning, setConsolidationWarning] = useState<string | undefined>();
  const [consolidationNotes, setConsolidationNotes] = useState<string[]>([]);
  const [lumpSumAmount, setLumpSumAmount] = useState(0);
  const [lumpSumResult, setLumpSumResult] = useState<LumpSumResultData | null>(null);
  const [accelerationMethod, setAccelerationMethod] = useState<"biweekly" | "lump-sum" | "increased-payment">("increased-payment");
  const [accelerationAmount, setAccelerationAmount] = useState(0);
  const [mortgageResults, setMortgageResults] = useState<MortgageResultData | null>(null);
  const [consolidationRate, setConsolidationRate] = useState(8);
  const [consolidationResults, setConsolidationResults] = useState<ConsolidationResultData | null>(null);

  // ── Import from accounts ────────────────────────────────────────────────────
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedDebt[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editRates, setEditRates] = useState<Record<string, number>>({});
  const [editMins, setEditMins] = useState<Record<string, number>>({});
  const [importingAll, setImportingAll] = useState(false);

  // ── Detection handlers ──────────────────────────────────────────────────────

  const detectFromAccounts = async () => {
    setDetecting(true);
    setDetectError(null);
    setDetected(null);
    setDismissed(new Set());
    try {
      const data: DetectedDebt[] = await api("/debts/detect-from-accounts");
      setDetected(data);
      // Seed editable fields with defaults
      const rates: Record<string, number> = {};
      const mins: Record<string, number> = {};
      for (const d of data) {
        rates[d.accountId] = d.defaultInterestRate;
        mins[d.accountId]  = d.defaultMinPayment;
      }
      setEditRates(rates);
      setEditMins(mins);
    } catch (err: any) {
      setDetectError(err.message || "Failed to detect debts from accounts");
    } finally {
      setDetecting(false);
    }
  };

  const importOne = async (d: DetectedDebt) => {
    const interestRate   = editRates[d.accountId] ?? d.defaultInterestRate;
    const minimumPayment = editMins[d.accountId]  ?? d.defaultMinPayment;
    try {
      await api("/debts", {
        method: "POST",
        body: JSON.stringify({
          name: d.name,
          type: d.debtType,
          principal: d.balance,
          currentBalance: d.balance,
          interestRate,
          minimumPayment,
          lender: d.institution ?? undefined,
          dueScheduleType: "monthly",
        }),
      });
      setDetected((prev) =>
        prev ? prev.map((x) => x.accountId === d.accountId ? { ...x, alreadyImported: true } : x) : prev
      );
      refreshFinancials();
    } catch (err: any) {
      alert(err.message || "Failed to import debt");
    }
  };

  const importAll = async () => {
    if (!detected) return;
    const toImport = detected.filter((d) => !d.alreadyImported && !dismissed.has(d.accountId));
    if (toImport.length === 0) return;
    setImportingAll(true);
    for (const d of toImport) await importOne(d);
    setImportingAll(false);
  };

  const handleDebtSelect = (debtId: string) => {
    setSelectedDebts((prev) =>
      prev.includes(debtId) ? prev.filter((id) => id !== debtId) : [...prev, debtId]
    );
  };

  const analyzeStrategy = async () => {
    if (selectedDebts.length === 0) { alert("Please select at least one debt"); return; }
    setLoading(true);
    try {
      const response = await api("/debt-strategies/analyze", {
        method: "POST",
        body: JSON.stringify({ debtIds: selectedDebts, strategyType, monthlyBudget, weighting }),
      });
      setPlan(response.plan);
      setComparisons(response.comparisons);
      setAnalysisWarning(response.warning);
      setAnalysisNotes(response.frameworkNotes ?? []);
    } catch (err) {
      console.error(err);
      alert("Error analyzing strategy");
    } finally {
      setLoading(false);
    }
  };

  const optimizeLumpSum = async () => {
    if (selectedDebts.length === 0) { alert("Please select at least one debt"); return; }
    if (lumpSumAmount <= 0) { alert("Please enter a lump sum amount"); return; }
    setLoading(true);
    try {
      const response = await api("/debt-strategies/lump-sum-optimization", {
        method: "POST",
        body: JSON.stringify({ debtIds: selectedDebts, lumpSumAmount }),
      });
      setLumpSumResult(response);
    } catch (err) {
      console.error(err);
      alert("Error optimizing lump sum");
    } finally {
      setLoading(false);
    }
  };

  const analyzeMortgageAcceleration = async () => {
    const mortgageDebt = selectedDebts[0];
    if (!mortgageDebt) { alert("Please select a debt"); return; }
    setLoading(true);
    try {
      const response = await api("/debt-strategies/mortgage-acceleration", {
        method: "POST",
        body: JSON.stringify({ debtId: mortgageDebt, accelerationMethod, accelerationAmount }),
      });
      setMortgageResults(response);
    } catch (err) {
      console.error(err);
      alert("Error analyzing mortgage acceleration");
    } finally {
      setLoading(false);
    }
  };

  const analyzeConsolidation = async () => {
    if (selectedDebts.length === 0) { alert("Please select at least one debt"); return; }
    setLoading(true);
    try {
      const response = await api("/debt-strategies/consolidation-analysis", {
        method: "POST",
        body: JSON.stringify({ debtIds: selectedDebts, consolidationRate, monthlyBudget }),
      });
      setConsolidationResults(response);
      setConsolidationWarning(response.warning);
      setConsolidationNotes(response.frameworkNotes ?? []);
    } catch (err) {
      console.error(err);
      alert("Error analyzing consolidation");
    } finally {
      setLoading(false);
    }
  };

  const totalMinimumPayment = debts
    .filter((d) => selectedDebts.includes(d._id))
    .reduce((sum, d) => sum + d.minimumPayment, 0);

  // Suggest a budget from real cash-flow surplus, but never overwrite a value the user typed.
  useEffect(() => {
    if (!budgetTouched) {
      setMonthlyBudget(Math.round((totalMinimumPayment + monthlySurplus) * 100) / 100);
    }
  }, [totalMinimumPayment, monthlySurplus, budgetTouched]);

  const visibleDetected = detected ? detected.filter((d) => !dismissed.has(d.accountId)) : [];
  const newCount = visibleDetected.filter((d) => !d.alreadyImported).length;

  return (
    <div className="debt-optimization-container">
      <div className="debt-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1>🎯 Debt Optimization</h1>
            <p>Find the best path to become debt-free</p>
          </div>
          <button
            onClick={detectFromAccounts}
            disabled={detecting}
            style={{
              padding: "9px 18px", borderRadius: 8, background: "var(--bg-card)",
              color: "var(--text)", border: "1px solid var(--border)", fontSize: 14,
              cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {detecting ? "Scanning…" : "🔗 Import from Accounts"}
          </button>
        </div>
      </div>

      <EmergencyFundBanner />

      {/* ── Import from accounts panel ── */}
      {(detected !== null || detecting || detectError) && (
        <div className="debt-section" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                {detecting ? "Scanning liability accounts…" : detectError ? "Scan failed" : "Detected Debt Accounts"}
              </h3>
              {!detecting && !detectError && detected !== null && (
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-light)" }}>
                  {newCount === 0
                    ? "All liability accounts are already tracked in the debt planner."
                    : `${newCount} account${newCount !== 1 ? "s" : ""} found — review rates and minimum payments before importing`}
                </p>
              )}
              {detectError && (
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "#dc2626" }}>{detectError}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!detecting && !detectError && newCount > 0 && (
                <button
                  onClick={importAll}
                  disabled={importingAll}
                  style={{ padding: "6px 14px", borderRadius: 7, background: "var(--primary)", color: "white", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
                >
                  {importingAll ? "Importing…" : `Import All ${newCount}`}
                </button>
              )}
              <button
                onClick={() => { setDetected(null); setDetectError(null); }}
                style={{ padding: "6px 12px", borderRadius: 7, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>

          {detecting && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-light)", fontSize: 14 }}>
              Calculating balances from transaction history…
            </div>
          )}

          {!detecting && visibleDetected.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    {["Account", "Type", "Balance", "Interest Rate %", "Min. Payment / mo", "Lender", ""].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-light)", borderBottom: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDetected.map((d) => (
                    <tr key={d.accountId} style={{ borderBottom: "1px solid var(--border)", opacity: d.alreadyImported ? 0.55 : 1 }}>
                      {/* Account name */}
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{d.name}</td>

                      {/* Type badge */}
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: TYPE_COLORS[d.debtType] ?? "#f3f4f6", color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {d.accountTypeLabel}
                        </span>
                      </td>

                      {/* Balance */}
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>
                        {CAD(d.balance)}
                      </td>

                      {/* Editable interest rate */}
                      <td style={{ padding: "8px 10px" }}>
                        {d.alreadyImported ? (
                          <span style={{ color: "var(--text-light)" }}>{d.defaultInterestRate}%</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editRates[d.accountId] ?? d.defaultInterestRate}
                            onChange={(e) => setEditRates((prev) => ({ ...prev, [d.accountId]: Number(e.target.value) }))}
                            style={{ width: 70, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
                          />
                        )}
                        <span style={{ fontSize: 10, color: "var(--text-light)", marginLeft: 3 }}>est.</span>
                      </td>

                      {/* Editable minimum payment */}
                      <td style={{ padding: "8px 10px" }}>
                        {d.alreadyImported ? (
                          <span style={{ color: "var(--text-light)" }}>{CAD(d.defaultMinPayment)}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editMins[d.accountId] ?? d.defaultMinPayment}
                            onChange={(e) => setEditMins((prev) => ({ ...prev, [d.accountId]: Number(e.target.value) }))}
                            style={{ width: 90, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
                          />
                        )}
                        <span style={{ fontSize: 10, color: "var(--text-light)", marginLeft: 3 }}>calc.</span>
                      </td>

                      {/* Institution */}
                      <td style={{ padding: "8px 10px", color: "var(--text-light)" }}>
                        {d.institution ?? "—"}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {d.alreadyImported ? (
                            <span style={{ fontSize: 12, color: "#059669", fontWeight: 500, whiteSpace: "nowrap" }}>✓ Imported</span>
                          ) : (
                            <button
                              onClick={() => importOne(d)}
                              style={{ padding: "4px 12px", borderRadius: 6, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", fontSize: 12, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}
                            >
                              + Import
                            </button>
                          )}
                          <button
                            onClick={() => setDismissed((prev) => new Set([...prev, d.accountId]))}
                            title="Dismiss"
                            style={{ padding: "3px 7px", borderRadius: 5, background: "none", color: "var(--text-light)", border: "1px solid var(--border)", fontSize: 13, cursor: "pointer", lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--text-light)", margin: "10px 0 0", padding: "0 4px" }}>
                💡 Rates and payments are Canadian estimates based on account type. Edit them before importing to reflect your actual terms.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Select debts ── */}
      <div className="debt-section">
        <h2>Step 1: Select Your Debts</h2>
        <div className="debt-selector">
          {debts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-light)" }}>
              <p>No debts found.</p>
              <p style={{ fontSize: 13 }}>
                Use <strong>Import from Accounts</strong> above to pull in your liability accounts,
                or add debts manually via the Debts page.
              </p>
            </div>
          ) : (
            <div className="debt-grid">
              {debts.map((debt) => (
                <div key={debt._id} className="debt-card">
                  <input
                    type="checkbox"
                    id={`debt-${debt._id}`}
                    checked={selectedDebts.includes(debt._id)}
                    onChange={() => handleDebtSelect(debt._id)}
                  />
                  <label htmlFor={`debt-${debt._id}`}>
                    <div className="debt-info">
                      <strong>{debt.name}</strong>
                      <span className="debt-type">{debt.type}</span>
                    </div>
                    <div className="debt-details">
                      <span className="balance">{fmtMoney(debt.currentBalance)}</span>
                      <span className="rate">{debt.interestRate.toFixed(2)}%</span>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {debts.length > 0 && (
        <div className="debt-section">
          <h2>Debt Breakdown</h2>
          <DonutChart
            data={debts.map((d) => ({ name: d.name, value: d.currentBalance }))}
            height={220}
            centerLabel="Total Debt"
            centerValue={`$${debts.reduce((s, d) => s + d.currentBalance, 0).toLocaleString("en-CA")}`}
          />
        </div>
      )}

      {selectedDebts.length > 0 && (
        <>
          <div className="debt-section">
            <h2>Step 2: Choose Strategy</h2>
            <div className="strategy-selector">
              <div className="strategy-option">
                <label>
                  <input type="radio" name="strategy" value="avalanche"
                    checked={strategyType === "avalanche"}
                    onChange={(e) => setStrategyType(e.target.value as any)}
                  />
                  <strong>Avalanche</strong><br />
                  <small>Pay highest interest first (saves most money)</small>
                </label>
              </div>
              <div className="strategy-option">
                <label>
                  <input type="radio" name="strategy" value="snowball"
                    checked={strategyType === "snowball"}
                    onChange={(e) => setStrategyType(e.target.value as any)}
                  />
                  <strong>Snowball</strong><br />
                  <small>Pay lowest balance first (psychological wins)</small>
                </label>
              </div>
              <div className="strategy-option">
                <label>
                  <input type="radio" name="strategy" value="hybrid"
                    checked={strategyType === "hybrid"}
                    onChange={(e) => setStrategyType(e.target.value as any)}
                  />
                  <strong>Hybrid</strong><br />
                  <small>Balance between both approaches</small>
                </label>
              </div>
            </div>
            {strategyType === "hybrid" && (
              <div className="hybrid-weighting">
                <label>Snowball ← Weighting → Avalanche</label>
                <input type="range" min="0" max="100" value={weighting}
                  onChange={(e) => setWeighting(Number(e.target.value))} />
                <span>{weighting}% Avalanche</span>
              </div>
            )}
          </div>

          <div className="debt-section">
            <h2>Step 3: Set Monthly Budget</h2>
            <div className="budget-input">
              <label>Total Monthly Payment (including minimum payments)</label>
              <div className="input-group">
                <span>$</span>
                <input
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => { setBudgetTouched(true); setMonthlyBudget(Number(e.target.value)); }}
                  min={totalMinimumPayment}
                />
              </div>
              <small>Minimum required: {fmtMoney(totalMinimumPayment)}/month (total of all minimum payments)</small>
              <br />
              <small style={{ color: "var(--text-light)" }}>
                {budgetTouched
                  ? `Your live surplus is ${fmtMoney(monthlySurplus)}/month — click to reset to that suggestion.`
                  : `Using your live cash-flow surplus of ${fmtMoney(monthlySurplus)}/month — edit above if this month is different.`}
                {budgetTouched && (
                  <button
                    type="button"
                    onClick={() => setBudgetTouched(false)}
                    style={{ marginLeft: 6, background: "none", border: "none", color: "#4f46e5", cursor: "pointer", fontSize: "inherit", textDecoration: "underline", padding: 0 }}
                  >
                    Reset
                  </button>
                )}
              </small>
              {monthlyBudget > 0 && monthlyBudget >= totalMinimumPayment && (
                <small className="extra-payment">
                  💪 Extra payment per month: {fmtMoney(monthlyBudget - totalMinimumPayment)}
                </small>
              )}
            </div>
          </div>

          <div className="debt-section">
            <div className="button-group">
              <button onClick={analyzeStrategy} disabled={loading} className="btn-primary">
                {loading ? "Analyzing..." : "✨ Analyze Strategy"}
              </button>
            </div>
          </div>

          {plan && (
            <div className="debt-section results">
              {(analysisWarning || analysisNotes.length > 0) && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                  {analysisWarning && <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>⚠️ {analysisWarning}</p>}
                  {analysisNotes.map((note, i) => (
                    <p key={i} style={{ margin: analysisWarning || i > 0 ? "6px 0 0" : 0, color: "#92400e" }}>💡 {note}</p>
                  ))}
                </div>
              )}
              <h2>Your Payoff Plan</h2>
              <div className="plan-summary">
                <div className="plan-stat">
                  <span className="label">Strategy</span>
                  <span className="value">{strategyType.toUpperCase()}</span>
                </div>
                <div className="plan-stat">
                  <span className="label">Payoff Time</span>
                  <span className="value">
                    {Math.floor(plan.payoffMonths / 12)} years {plan.payoffMonths % 12} months
                  </span>
                </div>
                <div className="plan-stat">
                  <span className="label">Total Interest</span>
                  <span className="value">{fmtMoney(plan.totalInterest)}</span>
                </div>
                <div className="plan-stat">
                  <span className="label">Monthly Payment</span>
                  <span className="value">{fmtMoney(plan.monthlyPayment)}</span>
                </div>
              </div>

              {comparisons && (
                <div className="comparisons">
                  <h3>How This Compares</h3>
                  <div className="comparison-grid">
                    <div className="comparison-card">
                      <h4>Avalanche</h4>
                      <p className="stat">Interest: <strong>{fmtMoney(comparisons.avalanche.totalInterest)}</strong></p>
                      <p className="stat">Months: <strong>{comparisons.avalanche.payoffMonths}</strong></p>
                      {strategyType !== "avalanche" && (
                        <p className="savings">
                          💡 You could save {fmtMoney(Math.abs(plan.totalInterest - comparisons.avalanche.totalInterest))}
                          {plan.totalInterest > comparisons.avalanche.totalInterest ? " by using Avalanche" : " with your strategy"}
                        </p>
                      )}
                    </div>
                    <div className="comparison-card">
                      <h4>Snowball</h4>
                      <p className="stat">Interest: <strong>{fmtMoney(comparisons.snowball.totalInterest)}</strong></p>
                      <p className="stat">Months: <strong>{comparisons.snowball.payoffMonths}</strong></p>
                      {strategyType !== "snowball" && (
                        <p className="savings">✅ Psychological wins with snowball</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="debt-section">
            <h2>🔧 Advanced Tools</h2>

            <div className="tool-subsection">
              <h3>💰 Lump Sum Optimizer</h3>
              <p>Have a tax refund or bonus? Find the best debt to apply it to.</p>
              <div className="input-group">
                <label>Lump Sum Amount</label>
                <span>$</span>
                <input type="number" value={lumpSumAmount}
                  onChange={(e) => setLumpSumAmount(Number(e.target.value))} min="0" />
                <button onClick={optimizeLumpSum} disabled={loading} className="btn-secondary">
                  Calculate Savings
                </button>
              </div>
              {lumpSumResult && (
                <div className="tool-result">
                  <p className="recommendation">{lumpSumResult.recommendation}</p>
                  {lumpSumResult.targetDebt && (
                    <div className="result-details">
                      <p><strong>Best Applied To:</strong> {lumpSumResult.targetDebt.name} ({lumpSumResult.targetDebt.interestRate.toFixed(2)}%)</p>
                      <p><strong>Annual Interest Savings:</strong> {fmtMoney(lumpSumResult.annualInterestSavings.ifAppliedToHighestInterest)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="tool-subsection">
              <h3>🏠 Mortgage Acceleration</h3>
              <p>Speed up your mortgage payoff with strategic payments.</p>
              {selectedDebts.length > 0 && (
                <>
                  <div className="form-row">
                    <div>
                      <label>Acceleration Method</label>
                      <select value={accelerationMethod}
                        onChange={(e) => setAccelerationMethod(e.target.value as any)}>
                        <option value="biweekly">Biweekly Payments</option>
                        <option value="increased-payment">Increased Payment</option>
                        <option value="lump-sum">Lump Sum Payment</option>
                      </select>
                    </div>
                    <div>
                      <label>Amount ($)</label>
                      <input type="number" value={accelerationAmount}
                        onChange={(e) => setAccelerationAmount(Number(e.target.value))} min="0" />
                    </div>
                    <button onClick={analyzeMortgageAcceleration} disabled={loading} className="btn-secondary">
                      Analyze
                    </button>
                  </div>
                  {mortgageResults && (
                    <div className="tool-result">
                      <div className="comparison-grid">
                        <div className="comparison-card">
                          <h4>Standard Payoff</h4>
                          <p className="stat">Payoff: <strong>{mortgageResults.standardPayoff.payoffMonths}</strong> months</p>
                          <p className="stat">Interest: <strong>{fmtMoney(mortgageResults.standardPayoff.totalInterest)}</strong></p>
                        </div>
                        <div className="comparison-card">
                          <h4>Accelerated Payoff</h4>
                          <p className="stat">Payoff: <strong>{mortgageResults.acceleratedPayoff.payoffMonths}</strong> months</p>
                          <p className="stat">Interest: <strong>{fmtMoney(mortgageResults.acceleratedPayoff.totalInterest)}</strong></p>
                        </div>
                      </div>
                      <p className="recommendation">{mortgageResults.recommendation}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="tool-subsection">
              <h3>🔗 Consolidation Analysis</h3>
              <p>Should you consolidate your debts? Compare the impact.</p>
              <div className="form-row">
                <div>
                  <label>Consolidation Interest Rate (%)</label>
                  <input type="number" value={consolidationRate}
                    onChange={(e) => setConsolidationRate(Number(e.target.value))} min="0" step="0.1" />
                </div>
                <button onClick={analyzeConsolidation} disabled={loading || selectedDebts.length === 0} className="btn-secondary">
                  Analyze
                </button>
              </div>
              {consolidationResults && (
                <div className="tool-result">
                  {(consolidationWarning || consolidationNotes.length > 0) && (
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                      {consolidationWarning && <p style={{ margin: 0, color: "#b45309", fontWeight: 600 }}>⚠️ {consolidationWarning}</p>}
                      {consolidationNotes.map((note, i) => (
                        <p key={i} style={{ margin: consolidationWarning || i > 0 ? "6px 0 0" : 0, color: "#92400e" }}>💡 {note}</p>
                      ))}
                    </div>
                  )}
                  <div className="comparison-grid">
                    <div className="comparison-card">
                      <h4>Keep Individual Debts</h4>
                      <p className="stat">Interest: <strong>{fmtMoney(consolidationResults.currentPlan.totalInterest)}</strong></p>
                      <p className="stat">Payoff: <strong>{consolidationResults.currentPlan.monthlyPayment}</strong> months</p>
                    </div>
                    <div className="comparison-card">
                      <h4>Consolidate</h4>
                      <p className="stat">Interest: <strong>{fmtMoney(consolidationResults.consolidatedPlan.totalInterest)}</strong></p>
                      <p className="stat">Rate: <strong>{consolidationResults.consolidatedPlan.consolidationRate}%</strong></p>
                    </div>
                  </div>
                  <p className="recommendation">{consolidationResults.analysis.recommendation}</p>
                  {consolidationResults.analysis.interestSavings > 0 && (
                    <p className="savings">
                      💰 Potential savings: {fmtMoney(consolidationResults.analysis.interestSavings)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
