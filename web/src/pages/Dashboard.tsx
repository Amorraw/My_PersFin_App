// Main dashboard: accounts, KPI cards, charts, health gauges, and smart analysis panel
import { useState, useEffect } from "react";
import { api } from "../api";
import type { Account } from "../types";
import {
  TrendAreaChart,
  DonutChart,
  ComparisonBarChart,
  ProgressGauge,
  GaugeRow,
  MiniSparkline,
  fmtCAD,
  COLORS as C,
} from "../components/charts";
import './Dashboard.css';
import { LIABILITY_TYPES, ACCOUNT_TYPE_LABELS } from "../utils/constants";

interface FinancialSnapshot {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalDebt: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyCashFlow: number;
  savingsRate: number;
  debtRatio: number;
  emergencyFundMonths: number;
  netWorthTrend: number;
  activeGoals: number;
  goalsProgress: number;
}

interface CashFlowMonth { month: string; income: number; expenses: number; net: number; }
interface AllocSlice    { name: string; value: number; color: string; }
interface SpendItem     { category: string; amount: number; }
interface BudgetRow     { category: string; budgeted: number; spent: number; isOverBudget: boolean; percentUsed: number; }


type StepKey = "netWorth" | "debts" | "recurring" | "forecast" | "anomalies" | "budgets";
type StepStatus = "idle" | "running" | "done" | "error";
type StepResult = { status: StepStatus; msg: string };

const STEP_LABELS: Record<StepKey, string> = {
  netWorth:  "Net Worth Snapshot",
  debts:     "Liability Accounts → Debts",
  recurring: "Recurring Patterns",
  forecast:  "Spending Forecast",
  anomalies: "Anomaly Detection",
  budgets:   "Budget Suggestions",
};

const STEP_ICONS: Record<StepStatus, string> = {
  idle:    "○",
  running: "⏳",
  done:    "✓",
  error:   "✗",
};

const STEP_COLORS: Record<StepStatus, string> = {
  idle:    "var(--text-light)",
  running: "#F59E0B",
  done:    "#10B981",
  error:   "#EF4444",
};

// Loads all analytics in parallel then renders accounts table and chart sections
export default function Dashboard() {
  const [accounts,         setAccounts]         = useState<Account[]>([]);
  const [snapshot,         setSnapshot]         = useState<FinancialSnapshot | null>(null);
  const [cashFlow,         setCashFlow]         = useState<CashFlowMonth[]>([]);
  const [allocation,       setAllocation]       = useState<AllocSlice[]>([]);
  const [spending,         setSpending]         = useState<SpendItem[]>([]);
  const [budgetComparison, setBudgetComparison] = useState<BudgetRow[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [showAccountForm,  setShowAccountForm]  = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [newAccount,       setNewAccount]       = useState({
    name: "", type: "chequing" as const, balance: "0", currency: "CAD",
  });

  // ── Smart Analysis state ────────────────────────────────────────────────────
  const [analysisOpen,    setAnalysisOpen]    = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<Record<StepKey, StepResult>>({
    netWorth:  { status: "idle", msg: "" },
    debts:     { status: "idle", msg: "" },
    recurring: { status: "idle", msg: "" },
    forecast:  { status: "idle", msg: "" },
    anomalies: { status: "idle", msg: "" },
    budgets:   { status: "idle", msg: "" },
  });

  useEffect(() => {
    loadData();
    setAnalysisOpen(false);
    setAnalysisResults({
      netWorth:  { status: "idle", msg: "" },
      debts:     { status: "idle", msg: "" },
      recurring: { status: "idle", msg: "" },
      forecast:  { status: "idle", msg: "" },
      anomalies: { status: "idle", msg: "" },
      budgets:   { status: "idle", msg: "" },
    });
  }, []);

  const loadData = async () => {
    try {
      const [accountsData, snapshotData, cashFlowData, allocData, spendData, budgetData] =
        await Promise.all([
          api("/accounts"),
          api("/analytics/financial-snapshot").catch(() => null),
          api("/analytics/cash-flow-history?months=12").catch(() => []),
          api("/analytics/investment-allocation").catch(() => []),
          api("/analytics/spending-by-category").catch(() => ({ categories: [] })),
          api("/analytics/budget-comparison").catch(() => []),
        ]);
      setAccounts(accountsData);
      if (snapshotData) setSnapshot(snapshotData);
      setCashFlow(cashFlowData ?? []);
      setAllocation(allocData ?? []);
      setSpending((spendData?.categories ?? []).slice(0, 8));
      setBudgetComparison(budgetData ?? []);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  const patchStep = (key: StepKey, status: StepStatus, msg: string) =>
    setAnalysisResults(prev => ({ ...prev, [key]: { status, msg } }));

  // Fires all six ML/analysis endpoints in parallel and updates step status live
  const runAllAnalysis = async () => {
    setAnalysisOpen(true);
    setAnalysisRunning(true);
    const running: Record<StepKey, StepResult> = {
      netWorth:  { status: "running", msg: "Saving net worth snapshot…" },
      debts:     { status: "running", msg: "Detecting liability accounts…" },
      recurring: { status: "running", msg: "Detecting recurring patterns…" },
      forecast:  { status: "running", msg: "Running spending forecast…" },
      anomalies: { status: "running", msg: "Checking for anomalies…" },
      budgets:   { status: "running", msg: "Generating budget suggestions…" },
    };
    setAnalysisResults(running);

    await Promise.allSettled([

      // 1 ── Net worth snapshot ──────────────────────────────────────────────
      api("/net-worth/snapshot", { method: "POST", body: JSON.stringify({}) })
        .then((r: any) => {
          const nw = r?.snapshot?.netWorth ?? r?.netWorth;
          patchStep("netWorth", "done",
            nw != null ? `Saved — net worth ${fmtCAD(nw)}` : "Snapshot saved");
        })
        .catch((e: any) => patchStep("netWorth", "error", e.message || "Failed")),

      // 2 ── Detect & auto-import liability accounts as debts ────────────────
      (async () => {
        const detected: any[] = await api("/debts/detect-from-accounts");
        const toImport = detected.filter((d) => !d.alreadyImported);
        let imported = 0;
        for (const d of toImport) {
          await api("/debts", {
            method: "POST",
            body: JSON.stringify({
              name:            d.suggestedName,
              type:            d.debtType,
              principal:       d.balance,
              currentBalance:  d.balance,
              interestRate:    d.defaultInterestRate,
              minimumPayment:  d.defaultMinPayment,
              lender:          d.institution || undefined,
              dueScheduleType: "monthly",
            }),
          });
          imported++;
        }
        const already = detected.length - toImport.length;
        if (imported > 0 && already > 0)
          patchStep("debts", "done", `${imported} imported, ${already} already tracked`);
        else if (imported > 0)
          patchStep("debts", "done", `${imported} debt${imported !== 1 ? "s" : ""} imported`);
        else if (already > 0)
          patchStep("debts", "done", `${already} debt${already !== 1 ? "s" : ""} already tracked`);
        else
          patchStep("debts", "done", "No liability accounts found");
      })().catch((e: any) => patchStep("debts", "error", e.message || "Failed")),

      // 3 ── Detect & auto-import recurring patterns ─────────────────────────
      (async () => {
        const detected: any[] = await api("/recurring/detect");
        // Only auto-import patterns with confidence ≥ 0.5 that aren't tracked yet
        const toImport = detected.filter((d) => !d.alreadyTracked && d.confidence >= 0.5);
        let imported = 0;
        for (const d of toImport) {
          await api("/recurring", {
            method: "POST",
            body: JSON.stringify({
              name:        d.name,
              amount:      d.amount,
              type:        d.type,
              category:    d.category,
              frequency:   d.frequency,
              dayOfMonth:  d.dayOfMonth,
              nextDueDate: d.nextDueDate,
              accountId:   d.accountId,
              isActive:    true,
            }),
          });
          imported++;
        }
        const already = detected.filter((d) => d.alreadyTracked).length;
        if (imported > 0 && already > 0)
          patchStep("recurring", "done", `${imported} imported, ${already} already tracked`);
        else if (imported > 0)
          patchStep("recurring", "done", `${imported} pattern${imported !== 1 ? "s" : ""} imported`);
        else if (already > 0)
          patchStep("recurring", "done", `${already} pattern${already !== 1 ? "s" : ""} already tracked`);
        else
          patchStep("recurring", "done", "No recurring patterns detected");
      })().catch((e: any) => patchStep("recurring", "error", e.message || "Failed")),

      // 4 ── ML spending forecast ────────────────────────────────────────────
      api("/ml/forecast", { method: "POST", body: JSON.stringify({ months: 3 }) })
        .then((r: any) => {
          if (r?.message) return patchStep("forecast", "done", r.message);
          // forecasts is an object keyed by category name, not an array
          const n = r?.forecasts ? Object.keys(r.forecasts).length : 0;
          patchStep("forecast", "done",
            n > 0 ? `3-month forecast ready — ${n} categor${n !== 1 ? "ies" : "y"}` : "Forecast ready");
        })
        .catch((e: any) => patchStep("forecast", "error", e.message || "ML service unavailable")),

      // 5 ── ML anomaly detection ────────────────────────────────────────────
      api("/ml/anomalies", { method: "POST", body: JSON.stringify({}) })
        .then((r: any) => {
          if (r?.message) return patchStep("anomalies", "done", r.message);
          const n = r?.anomalyCount ?? r?.anomalies?.length ?? 0;
          patchStep("anomalies", "done",
            n > 0 ? `${n} unusual transaction${n !== 1 ? "s" : ""} flagged` : "No anomalies detected");
        })
        .catch((e: any) => patchStep("anomalies", "error", e.message || "ML service unavailable")),

      // 6 ── ML budget suggestions ───────────────────────────────────────────
      api("/ml/suggest-budgets", { method: "POST", body: JSON.stringify({}) })
        .then((r: any) => {
          if (r?.message) return patchStep("budgets", "done", r.message);
          const n = r?.suggestions?.length ?? 0;
          patchStep("budgets", "done",
            n > 0 ? `${n} budget suggestion${n !== 1 ? "s" : ""} generated` : "Budget suggestions ready");
        })
        .catch((e: any) => patchStep("budgets", "error", e.message || "ML service unavailable")),

    ]);

    setAnalysisRunning(false);
    loadData(); // refresh KPI cards with fresh data
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.name.trim()) { alert("Account name is required"); return; }
    try {
      if (editingAccountId) {
        await api(`/accounts/${editingAccountId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: newAccount.name, type: newAccount.type,
            balance: parseFloat(newAccount.balance), currency: newAccount.currency,
          }),
        });
      } else {
        await api("/accounts", {
          method: "POST",
          body: JSON.stringify({
            name: newAccount.name, type: newAccount.type,
            balance: parseFloat(newAccount.balance), currency: newAccount.currency,
          }),
        });
      }
      setNewAccount({ name: "", type: "chequing", balance: "0", currency: "CAD" });
      setEditingAccountId(null);
      setShowAccountForm(false);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to save account");
    }
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccountId(account._id);
    setNewAccount({
      name: account.name, type: account.type as any,
      balance: account.balance.toString(), currency: account.currency,
    });
    setShowAccountForm(true);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("Delete this account? This cannot be undone.")) return;
    try {
      await api(`/accounts/${id}`, { method: "DELETE" });
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete account");
    }
  };

  const cancelEdit = () => {
    setEditingAccountId(null);
    setNewAccount({ name: "", type: "chequing", balance: "0", currency: "CAD" });
    setShowAccountForm(false);
  };

  // Shows negative balance in red for liabilities, positive in green for assets
  const renderBalance = (account: Account) =>
    LIABILITY_TYPES.has(account.type)
      ? <span style={{ color: "#dc2626", fontWeight: 600 }}>−{fmtCAD(Math.abs(account.balance))}</span>
      : <span style={{ color: "#059669", fontWeight: 600 }}>+{fmtCAD(account.balance)}</span>;

  if (loading) return <div className="loading">Loading...</div>;

  const netFlowSpark = cashFlow.map(m => m.net);

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={runAllAnalysis}
            disabled={analysisRunning}
            style={{ padding: "8px 16px", borderRadius: 7, background: analysisRunning ? "var(--bg-card)" : "var(--primary)", color: analysisRunning ? "var(--text)" : "white", border: "1px solid var(--border)", fontSize: 14, cursor: analysisRunning ? "not-allowed" : "pointer", fontWeight: 600 }}
          >
            {analysisRunning ? "⏳ Analysing…" : "⚡ Run All Analysis"}
          </button>
          <button onClick={() =>
            showAccountForm && !editingAccountId ? cancelEdit() : setShowAccountForm(!showAccountForm)
          }>
            {showAccountForm ? "Cancel" : "Add Account"}
          </button>
        </div>
      </div>

      {/* ── Smart Analysis Panel ────────────────────────────────── */}
      {analysisOpen && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {analysisRunning ? "Running Smart Analysis…" : "Analysis Complete"}
              </h3>
              {!analysisRunning && (
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-light)" }}>
                  Dashboard refreshed — visit each page to see the full results.
                </p>
              )}
            </div>
            {!analysisRunning && (
              <button
                onClick={() => setAnalysisOpen(false)}
                style={{ padding: "6px 12px", borderRadius: 7, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 13, cursor: "pointer" }}
              >
                Close
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(Object.keys(STEP_LABELS) as StepKey[]).map((key) => {
              const step = analysisResults[key];
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: 16, color: STEP_COLORS[step.status], minWidth: 20, textAlign: "center" }}>
                    {STEP_ICONS[step.status]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{STEP_LABELS[key]}</div>
                    {step.msg && (
                      <div style={{ fontSize: 12, color: step.status === "error" ? "#EF4444" : "var(--text-light)", marginTop: 1 }}>
                        {step.msg}
                      </div>
                    )}
                  </div>
                  {step.status === "running" && (
                    <div style={{ fontSize: 11, color: "#F59E0B", fontStyle: "italic" }}>in progress</div>
                  )}
                </div>
              );
            })}
          </div>

          {!analysisRunning && (
            <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--text-light)" }}>
              💡 Debts and recurring transactions have been auto-imported using Canadian default rates. Visit those pages to review and adjust the details.
            </p>
          )}
        </div>
      )}

      {/* ── Account Form ───────────────────────────────────────── */}
      {showAccountForm && (
        <div className="card form-card">
          <h3>{editingAccountId ? "Edit Account" : "Create New Account"}</h3>
          <form onSubmit={handleCreateAccount} className="form">
            <label>
              Account Name:
              <input type="text" placeholder="e.g., My Chequing Account" value={newAccount.name}
                onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} required />
            </label>
            <label>
              Account Type:
              <select value={newAccount.type} onChange={e => setNewAccount({ ...newAccount, type: e.target.value as any })}>
                <optgroup label="Savings & Chequing">
                  <option value="chequing">Chequing</option>
                  <option value="savings">Savings</option>
                </optgroup>
                <optgroup label="Credit & LOC">
                  <option value="credit-card">Credit Card</option>
                  <option value="line-of-credit">Line of Credit</option>
                </optgroup>
                <optgroup label="Registered Accounts">
                  <option value="tfsa">TFSA (Tax-Free Savings Account)</option>
                  <option value="rrsp">RRSP (Registered Retirement Savings)</option>
                  <option value="gic">GIC (Guaranteed Investment Certificate)</option>
                </optgroup>
                <optgroup label="Loans & Debts">
                  <option value="student-loan">Student Loan</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="auto-loan">Auto Loan</option>
                  <option value="personal-loan">Personal Loan</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="investment">Investment</option>
                  <option value="other">Other</option>
                </optgroup>
              </select>
            </label>
            <label>
              Initial Balance:
              <input type="number" step="0.01" placeholder="0.00" value={newAccount.balance}
                onChange={e => setNewAccount({ ...newAccount, balance: e.target.value })} />
            </label>
            <label>
              Currency:
              <select value={newAccount.currency} onChange={e => setNewAccount({ ...newAccount, currency: e.target.value })}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <div className="form-actions">
              <button type="submit">{editingAccountId ? "Update Account" : "Create Account"}</button>
              {editingAccountId && (
                <button type="button" onClick={cancelEdit} className="btn-secondary">Cancel Edit</button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── Accounts Table ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>My Accounts</h3>
        {accounts.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  <th>Currency</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account._id}>
                    <td style={{ fontWeight: 500 }}>{account.name}</td>
                    <td>{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</td>
                    <td style={{ textAlign: "right" }}>{renderBalance(account)}</td>
                    <td>{account.currency}</td>
                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => handleEditAccount(account)}
                        className="btn-primary btn-sm" style={{ marginRight: "0.4rem" }}>
                        Edit
                      </button>
                      <button onClick={() => handleDeleteAccount(account._id!)} className="btn-danger btn-sm">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "#9CA3AF", margin: "0.5rem 0 0" }}>
            No accounts yet. Create one above!
          </p>
        )}
      </div>

      {/* ── Hero KPI Cards ─────────────────────────────────────── */}
      {snapshot && (
        <div className="card-grid" style={{ marginBottom: "1rem" }}>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Net Worth</h3>
            <p className={`amount ${snapshot.netWorth >= 0 ? "positive" : "negative"}`}
               style={{ margin: "0.2rem 0 0.25rem", fontSize: "1.6rem" }}>
              {fmtCAD(snapshot.netWorth)}
            </p>
            <small style={{ color: (snapshot.netWorthTrend ?? 0) >= 0 ? "#10B981" : "#EF4444" }}>
              {(snapshot.netWorthTrend ?? 0) >= 0 ? "▲" : "▼"} {fmtCAD(Math.abs(snapshot.netWorthTrend ?? 0))} vs last month
            </small>
          </div>

          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Monthly Cash Flow</h3>
              <p className={`amount ${snapshot.monthlyCashFlow >= 0 ? "positive" : "negative"}`}
                 style={{ margin: "0.2rem 0 0.25rem", fontSize: "1.6rem" }}>
                {fmtCAD(snapshot.monthlyCashFlow)}
              </p>
              <small style={{ color: "#6B7280" }}>
                {fmtCAD(snapshot.monthlyIncome)} in · {fmtCAD(snapshot.monthlyExpenses)} out
              </small>
            </div>
            {netFlowSpark.length >= 2 && (
              <MiniSparkline
                data={netFlowSpark}
                color={snapshot.monthlyCashFlow >= 0 ? C.income : C.expense}
                width={80}
                height={40}
              />
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Savings Rate</h3>
            <p className="amount" style={{ margin: "0.2rem 0 0.25rem", fontSize: "1.6rem" }}>
              {(isFinite(snapshot.savingsRate) ? snapshot.savingsRate : 0).toFixed(1)}%
            </p>
            <small style={{
              color: snapshot.savingsRate >= 20 ? "#10B981"
                   : snapshot.savingsRate >= 10 ? "#F59E0B"
                   : "#EF4444",
            }}>
              {snapshot.savingsRate >= 20 ? "On track" : snapshot.savingsRate >= 10 ? "Below target" : "Needs attention"} · target 20%+
            </small>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6B7280" }}>Total Debt</h3>
            <p className="amount negative" style={{ margin: "0.2rem 0 0.25rem", fontSize: "1.6rem" }}>
              {fmtCAD(snapshot.totalDebt)}
            </p>
            <small style={{
              color: snapshot.debtRatio <= 30 ? "#10B981"
                   : snapshot.debtRatio <= 50 ? "#F59E0B"
                   : "#EF4444",
            }}>
              Debt-to-assets: {(isFinite(snapshot.debtRatio) ? snapshot.debtRatio : 0).toFixed(1)}%
            </small>
          </div>
        </div>
      )}

      {/* ── 12-Month Cash Flow ─────────────────────────────────── */}
      {cashFlow.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>12-Month Cash Flow</h3>
          <TrendAreaChart
            data={cashFlow as unknown as Record<string, unknown>[]}
            xKey="month"
            series={[
              { key: "income",   label: "Income",   color: C.income  },
              { key: "expenses", label: "Expenses",  color: C.expense },
              { key: "net",      label: "Net",       color: C.net, dashed: true },
            ]}
            height={240}
          />
        </div>
      )}

      {/* ── Spending + Allocation ──────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Spending by Category</h3>
          <DonutChart
            data={spending.map(s => ({ name: s.category, value: s.amount }))}
            height={280}
            showLabels
          />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Investment Allocation</h3>
          <DonutChart
            data={allocation}
            height={280}
            centerLabel="Invested"
          />
        </div>
      </div>

      {/* ── Budget vs Actual ───────────────────────────────────── */}
      {budgetComparison.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Budget vs Actual</h3>
          <ComparisonBarChart
            data={budgetComparison as unknown as Record<string, unknown>[]}
            xKey="category"
            bars={[
              { key: "budgeted", label: "Budget", color: C.net     },
              { key: "spent",    label: "Spent",  color: C.expense },
            ]}
            layout="vertical"
            height={Math.max(200, budgetComparison.length * 38)}
            showLegend
          />
        </div>
      )}

      {/* ── Financial Health Gauges ────────────────────────────── */}
      {snapshot && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Financial Health</h3>
          <GaugeRow>
            <ProgressGauge
              value={Math.min(snapshot.savingsRate, 100)}
              label="Savings Rate"
              sublabel="Target: 20%+"
              warnAt={10}
              dangerAt={20}
            />
            <ProgressGauge
              value={Math.min(snapshot.debtRatio, 100)}
              label="Debt Ratio"
              sublabel="Lower is better"
              warnAt={30}
              dangerAt={50}
              invertScale
            />
            <ProgressGauge
              value={Math.min((snapshot.emergencyFundMonths / 6) * 100, 100)}
              label="Emergency Fund"
              sublabel={`${(isFinite(snapshot.emergencyFundMonths) ? snapshot.emergencyFundMonths : 0).toFixed(1)} / 6 months`}
              warnAt={50}
              dangerAt={80}
            />
            <ProgressGauge
              value={Math.min(snapshot.goalsProgress, 100)}
              label="Goals Progress"
              sublabel={`${snapshot.activeGoals} active goal${snapshot.activeGoals !== 1 ? "s" : ""}`}
              warnAt={30}
              dangerAt={60}
            />
          </GaugeRow>
        </div>
      )}

      {/* ── Budget Alerts ──────────────────────────────────────── */}
      {budgetComparison.some(b => b.isOverBudget) && (
        <div className="alert-card">
          <h3>⚠️ Budget Alerts</h3>
          {budgetComparison.filter(b => b.isOverBudget).map(budget => (
            <div key={budget.category} className="alert-item">
              <strong>{budget.category}</strong>: Over budget by {fmtCAD(budget.spent - budget.budgeted)} ({budget.percentUsed}%)
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
