// Budget manager with rollover logic, payday planner, and category summaries
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Budget, CategoryMajor } from "../types";
import { CATEGORY_CATALOG } from "../data/categoryCatalog";
import { DonutChart, fmtMoney } from "../components/charts";
import './Budgets.css';

type BudgetCycle = "biweekly" | "monthly";
type RolloverMode = "none" | "carry-unused" | "carry-net";
type AmountCadence = "monthly" | "biweekly";
const BIWEEKLY_PER_MONTH = 26 / 12;

type BudgetSummaryItem = {
  budget: Budget;
  currentSpent: number;
  previousSpent: number;
  rolloverAmount: number;
  effectiveBudget: number;
  remaining: number;
  percentUsed: number;
  alertLevel: number;
  transactionCount: number;
  majorCategoryKey?: string;
  majorCategoryName?: string;
};

type MajorSummaryItem = {
  majorCategoryKey: string;
  majorCategoryName: string;
  totalBudgeted: number;
  totalEffectiveBudget: number;
  totalSpent: number;
  totalRemaining: number;
  percentUsed: number;
  subcategoryCount: number;
};

type BudgetSummary = {
  cycle: BudgetCycle;
  periodStart: string;
  periodEnd: string;
  totals: {
    totalBudgeted: number;
    totalEffectiveBudget: number;
    totalSpent: number;
    totalRemaining: number;
    percentUsed: number;
  };
  majorSummaries: MajorSummaryItem[];
  items: BudgetSummaryItem[];
};

type PaydayPlan = {
  netPay: number;
  savingsAmount: number;
  debtAmount: number;
  envelopesAmount: number;
  allocations: Array<{ category: string; suggested: number; kind: "needs" | "wants" }>;
};

type MajorAllocationForm = {
  subcategoryKey: string;
  subcategoryName: string;
  amount: string;
};

function toMoney(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
}

// Converts a budget amount between biweekly and monthly cadences for display parity
function normalizeAmountToPeriod(rawAmount: number, amountCadence: AmountCadence, period: BudgetCycle): number {
  if (amountCadence === period) return rawAmount;
  const converted = amountCadence === "biweekly" ? rawAmount * BIWEEKLY_PER_MONTH : rawAmount / BIWEEKLY_PER_MONTH;
  return Math.round(converted * 100) / 100;
}

function signedMajorFlowAmount(majorKey: string | undefined, value: number): number {
  if (majorKey === "income") return Math.abs(value);
  return -Math.abs(value);
}

function formatSignedMoney(value: number): string {
  const sign = value < 0 ? "−" : "+";
  return `${sign}${fmtMoney(Math.abs(value))}`;
}

// Renders budget cards, rollover status, and payday envelope planner
export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [paydayPlan, setPaydayPlan] = useState<PaydayPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showMajorPlanner, setShowMajorPlanner] = useState(false);
  const [cycle, setCycle] = useState<BudgetCycle>("monthly");
  const [paydayAnchor, setPaydayAnchor] = useState(new Date().toISOString().split("T")[0]);
  const [paycheckAmount, setPaycheckAmount] = useState("2500");
  const [savingsPct, setSavingsPct] = useState("20");
  const [debtPct, setDebtPct] = useState("20");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [categories, setCategories] = useState<CategoryMajor[]>([]);

  const [formData, setFormData] = useState({
    category: "",
    categoryKey: "",
    amount: "",
    amountCadence: "monthly" as AmountCadence,
    period: "monthly" as BudgetCycle,
    rolloverMode: "carry-unused" as RolloverMode,
    startDate: new Date().toISOString().split("T")[0],
    isActive: true
  });

  const [majorPlan, setMajorPlan] = useState({
    majorCategoryKey: "",
    totalAmount: "",
    amountCadence: "monthly" as AmountCadence,
    period: "monthly" as BudgetCycle,
    rolloverMode: "carry-unused" as RolloverMode,
    startDate: new Date().toISOString().split("T")[0]
  });
  const [majorAllocations, setMajorAllocations] = useState<MajorAllocationForm[]>([]);

  useEffect(() => {
    loadAll();
  }, [cycle, paydayAnchor]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [budgetData, summaryData] = await Promise.all([
        api("/budgets"),
        api(`/budgets/summary?cycle=${cycle}&paydayAnchor=${encodeURIComponent(paydayAnchor)}`)
      ]);
      setBudgets(budgetData);
      setSummary(summaryData);

      try {
        const categoriesData = await api("/categories/tree");
        const resolvedCategories = Array.isArray(categoriesData?.majorCategories)
          ? categoriesData.majorCategories
          : Array.isArray(categoriesData)
            ? categoriesData
            : [];
        setCategories(resolvedCategories.length > 0 ? resolvedCategories : CATEGORY_CATALOG);
      } catch {
        setCategories(CATEGORY_CATALOG);
      }
    } catch (err) {
      console.error("Failed to load budgets data", err);
      setCategories(CATEGORY_CATALOG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFormData((prev) => ({ ...prev, period: cycle }));
    setMajorPlan((prev) => ({ ...prev, period: cycle }));
    setShowMajorPlanner(false);
    setMajorAllocations([]);
  }, [cycle]);

  useEffect(() => {
    if (!majorPlan.majorCategoryKey) {
      setMajorAllocations([]);
      return;
    }

    const selectedMajor = categories.find((m) => m.key === majorPlan.majorCategoryKey);
    if (!selectedMajor) {
      setMajorAllocations([]);
      return;
    }

    const existingByName = new Map(
      budgets
        .filter((b) => b.period === majorPlan.period && b.majorCategoryKey === selectedMajor.key && (b.isActive ?? true))
        .map((b) => [b.category, b.amount])
    );

    setMajorAllocations(
      selectedMajor.subcategories.map((sub) => ({
        subcategoryKey: sub.key,
        subcategoryName: sub.name,
        amount: existingByName.has(sub.name) ? existingByName.get(sub.name)!.toFixed(2) : ""
      }))
    );
  }, [majorPlan.majorCategoryKey, majorPlan.period, categories, budgets]);

  const loadPaydayPlan = async () => {
    try {
      const data = await api(
        `/budgets/payday-plan?cycle=${cycle}&paydayAnchor=${encodeURIComponent(paydayAnchor)}&netPay=${encodeURIComponent(
          paycheckAmount
        )}&savingsPct=${encodeURIComponent(savingsPct)}&debtPct=${encodeURIComponent(debtPct)}`
      );
      setPaydayPlan(data);
    } catch (err: any) {
      alert(err.message || "Failed to build payday plan");
    }
  };

  const applyCanadianTemplates = async () => {
    try {
      setApplyingTemplate(true);
      await api("/budgets/templates/canada/apply", {
        method: "POST",
        body: JSON.stringify({ period: cycle, rolloverMode: "carry-unused", startDate: new Date().toISOString() })
      });
      await loadAll();
      alert("Canadian budget templates added for this cycle.");
    } catch (err: any) {
      alert(err.message || "Failed to apply templates");
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/budgets", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          amount: normalizeAmountToPeriod(toMoney(formData.amount), formData.amountCadence, formData.period)
        })
      });
      setShowForm(false);
      setFormData({
        category: "",
        categoryKey: "",
        amount: "",
        amountCadence: "monthly",
        period: cycle,
        rolloverMode: "carry-unused",
        startDate: new Date().toISOString().split("T")[0],
        isActive: true
      });
      await loadAll();
    } catch (err: any) {
      alert(err.message || "Failed to add budget");
    }
  };

  const fillEqualAllocations = () => {
    if (!majorAllocations.length) return;
    const total = toMoney(majorPlan.totalAmount);
    if (total <= 0) {
      alert("Set a total amount first.");
      return;
    }

    const each = Math.floor((total / majorAllocations.length) * 100) / 100;
    let remainingCents = Math.round(total * 100) - Math.round(each * 100) * majorAllocations.length;

    const next = majorAllocations.map((allocation) => {
      const extra = remainingCents > 0 ? 0.01 : 0;
      if (remainingCents > 0) {
        remainingCents -= 1;
      }
      return { ...allocation, amount: (each + extra).toFixed(2) };
    });

    setMajorAllocations(next);
  };

  const handleMajorPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!majorPlan.majorCategoryKey) {
      alert("Choose a major category.");
      return;
    }

    const enteredTotal = toMoney(majorPlan.totalAmount);
    if (enteredTotal <= 0) {
      alert("Set a major category total amount greater than 0.");
      return;
    }

    const total = normalizeAmountToPeriod(enteredTotal, majorPlan.amountCadence, majorPlan.period);
    const allocations = majorAllocations
      .map((a) => ({
        subcategoryKey: a.subcategoryKey,
        subcategoryName: a.subcategoryName,
        amount: normalizeAmountToPeriod(toMoney(a.amount), majorPlan.amountCadence, majorPlan.period)
      }))
      .filter((a) => a.amount > 0);

    if (allocations.length === 0) {
      alert("Allocate an amount to at least one subcategory.");
      return;
    }

    const allocationTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
    if (Math.abs(allocationTotal - total) > 0.01) {
      alert(
        `Allocated ${fmtMoney(allocationTotal)} (converted to ${majorPlan.period}) but total is ${fmtMoney(total)}.`
      );
      return;
    }

    try {
      await api("/budgets/major-plan", {
        method: "POST",
        body: JSON.stringify({
          majorCategoryKey: majorPlan.majorCategoryKey,
          period: majorPlan.period,
          rolloverMode: majorPlan.rolloverMode,
          startDate: majorPlan.startDate,
          totalAmount: total,
          replaceExisting: true,
          allocations
        })
      });

      await loadAll();
      setShowMajorPlanner(false);
      alert("Major category budget plan saved.");
    } catch (err: any) {
      alert(err.message || "Failed to save major category budget plan");
    }
  };

  const handleEditMajor = (majorCategoryKey: string) => {
    const selectedMajor = categories.find((major) => major.key === majorCategoryKey);
    if (!selectedMajor) {
      alert("Major category details could not be loaded.");
      return;
    }

    const majorBudgets = budgets.filter(
      (b) => (b.isActive ?? true) && b.period === cycle && b.majorCategoryKey === majorCategoryKey
    );

    const amountByCategory = new Map(majorBudgets.map((b) => [b.category, b.amount]));
    const totalAmount = majorBudgets.reduce((sum, b) => sum + b.amount, 0);
    const firstBudget = majorBudgets[0];

    setMajorPlan((prev) => ({
      ...prev,
      majorCategoryKey,
      totalAmount: totalAmount > 0 ? totalAmount.toFixed(2) : "",
      amountCadence: cycle,
      period: cycle,
      rolloverMode: ((firstBudget?.rolloverMode as RolloverMode) || "carry-unused"),
      startDate: firstBudget?.startDate
        ? new Date(firstBudget.startDate).toISOString().split("T")[0]
        : prev.startDate
    }));

    setMajorAllocations(
      selectedMajor.subcategories.map((sub) => ({
        subcategoryKey: sub.key,
        subcategoryName: sub.name,
        amount: amountByCategory.has(sub.name) ? Number(amountByCategory.get(sub.name)).toFixed(2) : ""
      }))
    );

    setShowMajorPlanner(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteMajor = async (majorCategoryKey: string, majorCategoryName: string) => {
    if (!confirm(`Delete all ${cycle} subcategory budgets under ${majorCategoryName}?`)) return;
    try {
      await api(`/budgets/major-plan/${majorCategoryKey}?period=${cycle}`, { method: "DELETE" });
      await loadAll();
    } catch (err: any) {
      alert(err.message || "Failed to delete major category budget plan");
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this budget?")) return;
    try {
      await api(`/budgets/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (err: any) {
      alert(err.message || "Failed to delete budget");
    }
  };

  const activeBudgets = useMemo(
    () => budgets.filter((b) => (b.isActive ?? true) && b.period === cycle),
    [budgets, cycle]
  );

  const majorPlanAllocationTotal = useMemo(
    () => majorAllocations.reduce((sum, allocation) => sum + toMoney(allocation.amount), 0),
    [majorAllocations]
  );

  const majorPlanRemaining = useMemo(() => {
    const total = toMoney(majorPlan.totalAmount);
    return Math.round((total - majorPlanAllocationTotal) * 100) / 100;
  }, [majorPlan.totalAmount, majorPlanAllocationTotal]);

  const flowTotals = useMemo(() => {
    if (!summary) {
      return {
        totalEffectiveBudget: 0,
        totalSpent: 0,
        totalRemaining: 0,
        percentUsed: 0
      };
    }

    return summary.majorSummaries.reduce(
      (acc, major) => {
        acc.totalEffectiveBudget += signedMajorFlowAmount(major.majorCategoryKey, major.totalEffectiveBudget);
        acc.totalSpent += signedMajorFlowAmount(major.majorCategoryKey, major.totalSpent);
        acc.totalRemaining += signedMajorFlowAmount(major.majorCategoryKey, major.totalRemaining);
        return acc;
      },
      {
        totalEffectiveBudget: 0,
        totalSpent: 0,
        totalRemaining: 0,
        percentUsed: summary.totals.percentUsed
      }
    );
  }, [summary]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Budgets</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button onClick={() => setShowMajorPlanner(!showMajorPlanner)}>
            {showMajorPlanner ? "Cancel Major Planner" : "Major Budget Planner"}
          </button>
          <button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Add Subcategory Budget"}</button>
          <button onClick={applyCanadianTemplates} className="btn-secondary" disabled={applyingTemplate}>
            {applyingTemplate ? "Applying..." : "Apply Canadian Templates"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Cycle Settings</h3>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label>
            View Cycle:
            <select value={cycle} onChange={(e) => setCycle(e.target.value as BudgetCycle)} style={{ marginLeft: "0.5rem" }}>
              <option value="monthly">Monthly</option>
              <option value="biweekly">Biweekly</option>
            </select>
          </label>
          <label>
            Payday Anchor:
            <input
              type="date"
              value={paydayAnchor}
              onChange={(e) => setPaydayAnchor(e.target.value)}
              style={{ marginLeft: "0.5rem" }}
            />
          </label>
          {summary && (
            <span style={{ color: "var(--text-light)" }}>
              Period: {new Date(summary.periodStart).toLocaleDateString()} to {new Date(summary.periodEnd).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {showMajorPlanner && (
        <div className="card form-card" style={{ marginBottom: "1rem" }}>
          <h3>Major Category Budget Planner</h3>
          <p style={{ color: "var(--text-light)", marginTop: 0 }}>
            Choose a major category, set one total amount, then split it across subcategories.
          </p>
          <form onSubmit={handleMajorPlanSubmit}>
            <select
              value={majorPlan.majorCategoryKey}
              onChange={(e) => setMajorPlan((prev) => ({ ...prev, majorCategoryKey: e.target.value }))}
              required
            >
              <option value="">Select Major Category</option>
              {categories.map((major) => (
                <option key={major.key} value={major.key}>
                  {major.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Major Category Total"
              value={majorPlan.totalAmount}
              onChange={(e) => setMajorPlan((prev) => ({ ...prev, totalAmount: e.target.value }))}
              required
            />

                        <label style={{ color: "var(--text-light)" }}>Entry Basis</label>
            <select
              value={majorPlan.amountCadence}
              onChange={(e) => setMajorPlan((prev) => ({ ...prev, amountCadence: e.target.value as AmountCadence }))}
            >
              <option value="monthly">Monthly amount entered</option>
              <option value="biweekly">Biweekly amount entered</option>
            </select>

            <select value={majorPlan.period} onChange={(e) => setMajorPlan((prev) => ({ ...prev, period: e.target.value as BudgetCycle }))}>
              <option value="monthly">Monthly</option>
              <option value="biweekly">Biweekly</option>
            </select>

            <select
              value={majorPlan.rolloverMode}
              onChange={(e) => setMajorPlan((prev) => ({ ...prev, rolloverMode: e.target.value as RolloverMode }))}
            >
              <option value="carry-unused">Rollover Unused</option>
              <option value="carry-net">Rollover Net (incl. overspend)</option>
              <option value="none">Reset Every Cycle</option>
            </select>

            <input
              type="date"
              value={majorPlan.startDate}
              onChange={(e) => setMajorPlan((prev) => ({ ...prev, startDate: e.target.value }))}
            />

            {majorAllocations.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>Subcategory Allocation</strong>
                  <button type="button" className="btn-secondary" onClick={fillEqualAllocations}>
                    Split Equally
                  </button>
                </div>
                <div style={{ maxHeight: "320px", overflow: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Subcategory</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {majorAllocations.map((allocation, index) => (
                        <tr key={allocation.subcategoryKey}>
                          <td>{allocation.subcategoryName}</td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={allocation.amount}
                              onChange={(e) => {
                                const next = [...majorAllocations];
                                next[index] = { ...next[index], amount: e.target.value };
                                setMajorAllocations(next);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>
                    Allocated: <strong>{fmtMoney(majorPlanAllocationTotal)}</strong>
                  </span>
                  <span>
                    Remaining: <strong className={majorPlanRemaining < 0 ? "negative" : "positive"}>{fmtMoney(majorPlanRemaining)}</strong>
                  </span>
                </div>
              </div>
            )}

            <button type="submit">Save Major Budget Plan</button>
          </form>
        </div>
      )}

      {showForm && (
        <div className="card form-card">
          <h3>New Envelope Budget</h3>
          <form onSubmit={handleSubmit}>
            <select
              value={formData.categoryKey || formData.category}
              onChange={(e) => {
                const selected = categories.flatMap((m) => m.subcategories).find((s) => s.key === e.target.value);
                setFormData({ ...formData, categoryKey: selected?.key || "", category: selected?.name || "" });
              }}
              required
            >
              <option value="">Select Subcategory</option>
              {categories.map((major) => (
                <optgroup key={major.key} label={major.name}>
                  {major.subcategories.map((sub) => (
                    <option key={sub.key} value={sub.key}>
                      {sub.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />

                        <label style={{ color: "var(--text-light)" }}>Entry Basis</label>
            <select
              value={formData.amountCadence}
              onChange={(e) => setFormData({ ...formData, amountCadence: e.target.value as AmountCadence })}
            >
              <option value="monthly">Monthly amount entered</option>
              <option value="biweekly">Biweekly amount entered</option>
            </select>

            <select value={formData.period} onChange={(e) => setFormData({ ...formData, period: e.target.value as BudgetCycle })}>
              <option value="monthly">Monthly</option>
              <option value="biweekly">Biweekly</option>
            </select>

            <select
              value={formData.rolloverMode}
              onChange={(e) => setFormData({ ...formData, rolloverMode: e.target.value as RolloverMode })}
            >
              <option value="carry-unused">Rollover Unused</option>
              <option value="carry-net">Rollover Net (incl. overspend)</option>
              <option value="none">Reset Every Cycle</option>
            </select>

            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Active Budget
            </label>

            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />

            <button type="submit">Save Budget</button>
          </form>
        </div>
      )}

      {summary && (
        <div className="card-grid" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <h3>Total Budget Flow</h3>
            <p className={`amount ${flowTotals.totalEffectiveBudget < 0 ? "negative" : "positive"}`}>
              {formatSignedMoney(flowTotals.totalEffectiveBudget)}
            </p>
            <small>By money flow rules (Income +, Non-income -)</small>
          </div>
          <div className="card">
            <h3>Spent Flow</h3>
            <p className={`amount ${flowTotals.totalSpent < 0 ? "negative" : "positive"}`}>
              {formatSignedMoney(flowTotals.totalSpent)}
            </p>
            <small>{summary.totals.percentUsed.toFixed(1)}% used</small>
          </div>
          <div className="card">
            <h3>Remaining Flow</h3>
            <p className={`amount ${flowTotals.totalRemaining < 0 ? "negative" : "positive"}`}>
              {formatSignedMoney(flowTotals.totalRemaining)}
            </p>
            <small>{cycle === "biweekly" ? "This pay cycle" : "This month"}</small>
          </div>
        </div>
      )}

      {summary && summary.majorSummaries.some(m => m.majorCategoryKey !== "income" && m.totalSpent > 0) && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Spending by Category</h3>
          <DonutChart
            data={summary.majorSummaries
              .filter(m => m.majorCategoryKey !== "income" && m.totalSpent > 0)
              .map(m => ({ name: m.majorCategoryName, value: m.totalSpent }))}
            height={220}
          />
        </div>
      )}

      {summary && summary.majorSummaries.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Major Category Progress</h3>
          <table>
            <thead>
              <tr>
                <th>Major Category</th>
                <th>Budget</th>
                <th>Spent</th>
                <th>Remaining</th>
                <th>Used</th>
                <th>Subcategories</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.majorSummaries
                .slice()
                .sort((a, b) => a.majorCategoryName.localeCompare(b.majorCategoryName))
                .map((major) => (
                  <tr key={major.majorCategoryKey}>
                    <td>{major.majorCategoryName}</td>
                    <td className={major.majorCategoryKey === "income" ? "positive" : "negative"}>
                      {formatSignedMoney(signedMajorFlowAmount(major.majorCategoryKey, major.totalEffectiveBudget))}
                    </td>
                    <td className={major.majorCategoryKey === "income" ? "positive" : "negative"}>
                      {formatSignedMoney(signedMajorFlowAmount(major.majorCategoryKey, major.totalSpent))}
                    </td>
                    <td className={major.majorCategoryKey === "income" ? "positive" : "negative"}>
                      {formatSignedMoney(signedMajorFlowAmount(major.majorCategoryKey, major.totalRemaining))}
                    </td>
                    <td>{major.percentUsed.toFixed(1)}%</td>
                    <td>{major.subcategoryCount}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button className="btn-secondary btn-sm" onClick={() => handleEditMajor(major.majorCategoryKey)}>
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDeleteMajor(major.majorCategoryKey, major.majorCategoryName)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && summary.items.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Envelope Progress & Alerts</h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {summary.items.map((item) => (
              <div key={item.budget._id} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <strong>{item.budget.category}</strong>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {item.majorCategoryName && <span className="badge">{item.majorCategoryName}</span>}
                    {item.alertLevel > 0 && <span className="badge expense">Alert {item.alertLevel}%</span>}
                    <button className="btn-danger btn-sm" onClick={() => handleDelete(item.budget._id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: "0.35rem", color: "var(--text-light)" }}>
                  Spent {fmtMoney(item.currentSpent)} / Effective {fmtMoney(item.effectiveBudget)}
                  {item.rolloverAmount !== 0 && ` (Rollover ${item.rolloverAmount >= 0 ? "+" : ""}${fmtMoney(Math.abs(item.rolloverAmount))})`}
                </div>
                <div
                  style={{
                    marginTop: "0.5rem",
                    height: "10px",
                    borderRadius: "999px",
                    background: "#edf0f5",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(item.percentUsed, 100)}%`,
                      height: "100%",
                      background: item.percentUsed >= 100 ? "#d32f2f" : item.percentUsed >= 90 ? "#ef6c00" : "#2a9d8f"
                    }}
                  />
                </div>
                <div style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
                  Remaining: <strong className={item.remaining < 0 ? "negative" : "positive"}>{fmtMoney(item.remaining)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Budget Pace Predictor</h3>
          {(() => {
            const start = new Date(summary.periodStart).getTime();
            const end = new Date(summary.periodEnd).getTime();
            const now = Date.now();
            const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
            const nonIncome = summary.majorSummaries.filter(m => m.majorCategoryKey !== "income");
            const totalBudget = nonIncome.reduce((s, m) => s + m.totalEffectiveBudget, 0);
            const totalSpent = nonIncome.reduce((s, m) => s + m.totalSpent, 0);
            const spentRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
            const paceRatio = elapsed > 0 ? spentRatio / elapsed : 1;
            const projectedEnd = elapsed > 0 ? totalSpent / elapsed : totalSpent;
            const overUnder = projectedEnd - totalBudget;
            const daysLeft = Math.ceil(Math.max(0, end - now) / 86400000);
            const paceOk = paceRatio <= 1.05;
            return (
              <div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                  {[
                    { label: "Period Elapsed", value: `${(elapsed * 100).toFixed(0)}%`, sub: `${daysLeft} days left`, color: "#3B82F6" },
                    { label: "Budget Used", value: `${(spentRatio * 100).toFixed(0)}%`, sub: `${fmtMoney(totalSpent)} of ${fmtMoney(totalBudget)}`, color: paceOk ? "#059669" : "#dc2626" },
                    { label: "Spend Pace", value: `${(paceRatio * 100).toFixed(0)}%`, sub: paceOk ? "On track" : "Running over", color: paceOk ? "#059669" : "#dc2626" },
                    { label: "Projected End-of-Period", value: fmtMoney(projectedEnd), sub: overUnder > 0 ? `${fmtMoney(overUnder)} over budget` : `${fmtMoney(Math.abs(overUnder))} under budget`, color: overUnder > 0 ? "#dc2626" : "#059669" },
                  ].map(c => (
                    <div key={c.label} style={{ flex: 1, minWidth: 140, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.6rem 0.9rem" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: c.color }}>{c.value}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-light)" }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-light)", marginBottom: "0.25rem" }}>Period progress vs. budget used</div>
                <div style={{ position: "relative", height: 16, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: `${Math.min(elapsed * 100, 100)}%`, background: "#3B82F6", opacity: 0.3 }} />
                  <div style={{ position: "absolute", inset: 0, width: `${Math.min(spentRatio * 100, 100)}%`, background: paceOk ? "#059669" : "#dc2626", opacity: 0.75 }} />
                </div>
                <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.7rem", marginTop: "0.35rem" }}>
                  <span style={{ color: "#3B82F6" }}>■ Period elapsed</span>
                  <span style={{ color: paceOk ? "#059669" : "#dc2626" }}>■ Budget used</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Payday Auto-Allocation Planner</h3>
        <p>Split each paycheck into savings, debt, and your active envelopes.</p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "end" }}>
          <label>
            Net Pay
            <input type="number" step="0.01" value={paycheckAmount} onChange={(e) => setPaycheckAmount(e.target.value)} />
          </label>
          <label>
            Savings %
            <input type="number" step="1" value={savingsPct} onChange={(e) => setSavingsPct(e.target.value)} />
          </label>
          <label>
            Debt %
            <input type="number" step="1" value={debtPct} onChange={(e) => setDebtPct(e.target.value)} />
          </label>
          <button onClick={loadPaydayPlan}>Generate Payday Plan</button>
        </div>

        {paydayPlan && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <span>
                Savings: <strong>{fmtMoney(paydayPlan.savingsAmount)}</strong>
              </span>
              <span>
                Debt: <strong>{fmtMoney(paydayPlan.debtAmount)}</strong>
              </span>
              <span>
                Envelopes: <strong>{fmtMoney(paydayPlan.envelopesAmount)}</strong>
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Suggested Allocation</th>
                </tr>
              </thead>
              <tbody>
                {paydayPlan.allocations.map((a) => (
                  <tr key={a.category}>
                    <td>{a.category}</td>
                    <td>{a.kind}</td>
                    <td>{fmtMoney(a.suggested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeBudgets.length === 0 && !showForm && !showMajorPlanner && (
        <div className="empty-state" style={{ marginTop: "1rem" }}>
          <p>No {cycle} budgets yet. Use Major Budget Planner to set a major total and split into subcategories.</p>
        </div>
      )}
    </div>
  );
}



















