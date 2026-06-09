// Debt manager with avalanche/snowball payoff strategies and what-if optimizer
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Debt, PayoffStrategy } from "../types";
import './Debts.css';
import { fmtMoney as CAD } from "../utils/formatters";

type Cadence = "monthly" | "biweekly";

type DebtDashboard = {
  totals: {
    totalDebt: number;
    totalMinimumPayment: number;
    weightedInterestRate: number;
    monthlyInterestEstimate: number;
    annualInterestEstimate: number;
  };
  upcomingDue: Debt[];
  count: number;
  liveAccountCount?: number;
};

type OptimizerResponse = {
  cadence: Cadence;
  paymentPerCadence: number;
  totalMinimumPerCadence: number;
  extraPerCadence: number;
  allocations: Array<{
    debtId: string;
    debtName: string;
    interestRate: number;
    recommendedPerCadence: number;
    minimumPerCadence: number;
    focusDebt: boolean;
  }>;
};

type WhatIfResponse = {
  baseline: PayoffStrategy & { error?: string; minimumRequiredMonthly?: number };
  scenario: PayoffStrategy & { error?: string; minimumRequiredMonthly?: number };
  comparison: { monthsSaved: number; interestSaved: number } | null;
};

interface DetectedDebt {
  accountId: string;
  name: string;
  suggestedName: string;
  description: string;
  accountType: string;
  accountTypeLabel: string;
  debtType: string;
  balance: number;
  institution: string | null;
  defaultInterestRate: number;
  defaultMinPayment: number;
  alreadyImported: boolean;
}

// Per-row editable state lets each detected debt be corrected before import
interface EditState {
  name: string;
  type: Debt["type"];
  interestRate: string;
  minimumPayment: string;
  lender: string;
}

const DEBT_TYPES: Array<{ value: Debt["type"]; label: string }> = [
  { value: "credit-card",   label: "Credit Card" },
  { value: "student-loan",  label: "Student Loan" },
  { value: "mortgage",      label: "Mortgage" },
  { value: "auto-loan",     label: "Auto Loan" },
  { value: "personal-loan", label: "Personal Loan" },
  { value: "other",         label: "Other" },
];

const TYPE_ICON: Record<string, string> = {
  "credit-card":   "💳",
  "line-of-credit":"💳",
  "mortgage":      "🏠",
  "auto-loan":     "🚗",
  "student-loan":  "🎓",
  "personal-loan": "💰",
  "other":         "📋",
};

// Renders debt dashboard, payoff strategies, optimizer, and detection panel
export default function Debts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [dashboard, setDashboard] = useState<DebtDashboard | null>(null);
  const [strategies, setStrategies] = useState<{ avalanche?: PayoffStrategy; snowball?: PayoffStrategy } | null>(null);
  const [optimizer, setOptimizer] = useState<OptimizerResponse | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cadence, setCadence] = useState<Cadence>("biweekly");
  const [paymentAmount, setPaymentAmount] = useState("700");
  const [extraPayment, setExtraPayment] = useState("100");

  const [formData, setFormData] = useState({
    name: "",
    type: "credit-card" as Debt["type"],
    principal: "",
    currentBalance: "",
    interestRate: "",
    minimumPayment: "",
    lender: "",
    dueDate: "",
    dueScheduleType: "monthly" as "specific" | "monthly" | "biweekly",
  });

  const [paymentInputs, setPaymentInputs] = useState<Record<string, string>>({});

  // ── Detect & Import state ───────────────────────────────────────────────────
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedDebt[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);

  // Ref so the visibility-change handler always sees the latest detected state
  // without needing to be recreated on every render.
  const detectedRef = useRef<DetectedDebt[] | null>(null);
  useEffect(() => { detectedRef.current = detected; }, [detected]);

  // On every mount (= every SPA page visit) load data + auto-scan.
  useEffect(() => {
    loadData();
    detectAuto();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-scan when the user returns to this browser tab after visiting another.
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        loadData();
        detectAuto();
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [debtData, dashboardData] = await Promise.all([
        api("/debts"),
        api("/debts/dashboard"),
      ]);
      setDebts(debtData);
      setDashboard(dashboardData);
      if (debtData.length > 0) {
        const totalMin = debtData.reduce((sum: number, d: Debt) => sum + d.minimumPayment, 0);
        setPaymentAmount(Math.max(totalMin * 12 / 26 + 50, 300).toFixed(2));
      }
    } catch (err) {
      console.error("Failed to load debts", err);
    } finally {
      setLoading(false);
    }
  };

  // Background auto-scan: runs silently — no loading spinner, no error banner.
  // Opens the detect panel only when there are new untracked liability accounts.
  // Skips the scan if the panel is already open so it doesn't reset in-progress edits.
  const detectAuto = async () => {
    if (detectedRef.current !== null) return; // panel already open, don't disturb
    try {
      const data: DetectedDebt[] = await api("/debts/detect-from-accounts");
      const hasNew = data.some((d) => !d.alreadyImported);
      if (!hasNew) return; // nothing to surface — stay quiet
      const states: Record<string, EditState> = {};
      for (const d of data) {
        states[d.accountId] = {
          name:           d.suggestedName,
          type:           d.debtType as Debt["type"],
          interestRate:   d.defaultInterestRate.toString(),
          minimumPayment: d.defaultMinPayment.toString(),
          lender:         d.institution ?? "",
        };
      }
      setDetected(data);
      setDetectError(null);
      setDismissed(new Set());
      setEditStates(states);
    } catch {
      // Silent — background failures are not surfaced to the user.
    }
  };

  const loadPlanner = async () => {
    if (debts.length === 0) return;
    try {
      const amount = Number(paymentAmount);
      const extra  = Number(extraPayment) || 0;
      const [strategyData, optimizerData, whatIfData] = await Promise.all([
        api(`/debts/payoff/strategies?paymentAmount=${amount}&cadence=${cadence}&extraPayment=0`),
        api(`/debts/payoff/optimizer?paymentAmount=${amount}&cadence=${cadence}`),
        api(`/debts/payoff/what-if?paymentAmount=${amount}&cadence=${cadence}&extraPayment=${extra}`),
      ]);
      setStrategies(strategyData);
      setOptimizer(optimizerData);
      setWhatIf(whatIfData);
    } catch (err: any) {
      alert(err.message || "Failed to load debt planner");
    }
  };

  // ── Detect & Import handlers ────────────────────────────────────────────────

  const detect = async () => {
    setDetecting(true);
    setDetectError(null);
    setDetected(null);
    setDismissed(new Set());
    try {
      const data: DetectedDebt[] = await api("/debts/detect-from-accounts");
      setDetected(data);
      // Seed per-row edit state from suggested values
      const states: Record<string, EditState> = {};
      for (const d of data) {
        states[d.accountId] = {
          name:           d.suggestedName,
          type:           d.debtType as Debt["type"],
          interestRate:   d.defaultInterestRate.toString(),
          minimumPayment: d.defaultMinPayment.toString(),
          lender:         d.institution ?? "",
        };
      }
      setEditStates(states);
    } catch (err: any) {
      setDetectError(err.message || "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const patchEdit = (accountId: string, patch: Partial<EditState>) => {
    setEditStates((prev) => ({ ...prev, [accountId]: { ...prev[accountId], ...patch } }));
  };

  const importOne = async (d: DetectedDebt) => {
    const s = editStates[d.accountId];
    if (!s) return;
    const rate = parseFloat(s.interestRate);
    const minPay = parseFloat(s.minimumPayment);
    if (!s.name.trim()) { alert("Debt name is required"); return; }
    if (!isFinite(rate) || rate < 0)   { alert("Enter a valid interest rate"); return; }
    if (!isFinite(minPay) || minPay < 0) { alert("Enter a valid minimum payment"); return; }

    setImportingId(d.accountId);
    try {
      await api("/debts", {
        method: "POST",
        body: JSON.stringify({
          name:           s.name.trim(),
          type:           s.type,
          principal:      d.balance,
          currentBalance: d.balance,
          interestRate:   rate,
          minimumPayment: minPay,
          lender:         s.lender.trim() || undefined,
          dueScheduleType: "monthly",
        }),
      });
      setDetected((prev) =>
        prev ? prev.map((x) => x.accountId === d.accountId ? { ...x, alreadyImported: true } : x) : prev
      );
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to import");
    } finally {
      setImportingId(null);
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

  // ── Manual form handlers ────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/debts", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          principal:      parseFloat(formData.principal),
          currentBalance: parseFloat(formData.currentBalance),
          interestRate:   parseFloat(formData.interestRate),
          minimumPayment: parseFloat(formData.minimumPayment),
          dueDate:        formData.dueDate || undefined,
          dueScheduleType: formData.dueScheduleType,
        }),
      });
      setShowForm(false);
      setFormData({
        name: "", type: "credit-card", principal: "", currentBalance: "",
        interestRate: "", minimumPayment: "", lender: "", dueDate: "", dueScheduleType: "monthly",
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to add debt");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this debt?")) return;
    try {
      await api(`/debts/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete debt");
    }
  };

  const handleMakePayment = async (debtId: string) => {
    const amount = Number(paymentInputs[debtId] || 0);
    if (!isFinite(amount) || amount <= 0) { alert("Enter a valid payment amount."); return; }
    try {
      await api(`/debts/${debtId}/payment`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setPaymentInputs((prev) => ({ ...prev, [debtId]: "" }));
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    }
  };

  const totalDebt = useMemo(() => debts.reduce((sum, d) => sum + d.currentBalance, 0), [debts]);

  const visibleDetected = detected ? detected.filter((d) => !dismissed.has(d.accountId)) : [];
  const newCount = visibleDetected.filter((d) => !d.alreadyImported).length;

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="page-header">
        <h1>Debt Planner</h1>
        <div className="page-header-actions">
          <button className="debt-detect-trigger" onClick={detect} disabled={detecting}>
            {detecting ? "Scanning…" : "🔍 Detect & Import"}
          </button>
          <button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add Debt"}
          </button>
        </div>
      </div>

      {/* ── Dashboard summary cards ── */}
      {dashboard && (
        <>
          <div className="card-grid" style={{ marginBottom: "0.5rem" }}>
            <div className="card">
              <h3>Total Debt</h3>
              <p className="amount negative">{CAD(dashboard.totals.totalDebt)}</p>
            </div>
            <div className="card">
              <h3>Minimums (Monthly)</h3>
              <p className="amount">{CAD(dashboard.totals.totalMinimumPayment)}</p>
            </div>
            <div className="card">
              <h3>Weighted APR</h3>
              <p className="amount">{dashboard.totals.weightedInterestRate.toFixed(2)}%</p>
            </div>
            <div className="card">
              <h3>Interest Forecast</h3>
              <p className="amount negative">{CAD(dashboard.totals.annualInterestEstimate)}</p>
              <small>{CAD(dashboard.totals.monthlyInterestEstimate)} this month</small>
            </div>
          </div>
          {(dashboard.liveAccountCount ?? 0) > 0 && (
            <p className="debt-live-note">
              Includes {dashboard.liveAccountCount} liability account{dashboard.liveAccountCount !== 1 ? "s" : ""} from your Accounts tab not yet imported — use{" "}
              <button className="debt-live-note-btn" onClick={detect}>
                Detect &amp; Import
              </button>{" "}
              to track them with your actual interest rates.
            </p>
          )}
        </>
      )}

      {/* ── Detect & Import panel ── */}
      {(detected !== null || detecting || detectError) && (
        <div className="card debt-detect-panel">
          <div className="debt-detect-header">
            <div>
              <h3>
                {detecting ? "Scanning your accounts…"
                  : detectError ? "Scan failed"
                  : "Detected Liability Accounts"}
              </h3>
              {!detecting && !detectError && detected !== null && (
                <p className="debt-detect-subtitle">
                  {visibleDetected.length === 0
                    ? "All liability accounts are already in the debt planner."
                    : `${newCount} new debt${newCount !== 1 ? "s" : ""} detected — review and edit the details, then import`}
                </p>
              )}
              {detectError && (
                <p className="debt-detect-error-msg">{detectError}</p>
              )}
            </div>
            <div className="debt-detect-actions">
              {!detecting && !detectError && newCount > 0 && (
                <button className="btn-primary btn-sm" onClick={importAll} disabled={importingAll}>
                  {importingAll ? "Importing…" : `Import All ${newCount}`}
                </button>
              )}
              <button className="btn-secondary btn-sm" onClick={() => { setDetected(null); setDetectError(null); }}>
                Close
              </button>
            </div>
          </div>

          {detecting && (
            <div className="debt-detecting-msg">
              Calculating live balances from transaction history…
            </div>
          )}

          {!detecting && visibleDetected.length > 0 && (
            <div className="debt-cards-list">
              {visibleDetected.map((d) => {
                const s = editStates[d.accountId];
                if (!s) return null;
                const isImporting = importingId === d.accountId;
                return (
                  <div key={d.accountId} className={`debt-detect-card${d.alreadyImported ? " imported" : ""}`}>
                    <div className="debt-detect-card-top">
                      <div className="debt-detect-card-left">
                        <span className="debt-detect-icon">{TYPE_ICON[d.accountType] ?? "📋"}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="debt-detect-name">{d.suggestedName}</div>
                          <div className="debt-detect-desc">{d.description}</div>
                        </div>
                      </div>
                      <div className="debt-detect-card-right">
                        <span className="debt-detect-amount">{CAD(d.balance)}</span>
                        {d.alreadyImported ? (
                          <span className="debt-imported-badge">✓ Imported</span>
                        ) : (
                          <button className="debt-import-btn" onClick={() => importOne(d)} disabled={isImporting}>
                            {isImporting ? "Importing…" : "+ Import"}
                          </button>
                        )}
                        <button
                          className="debt-dismiss-btn"
                          onClick={() => setDismissed((prev) => new Set([...prev, d.accountId]))}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {!d.alreadyImported && (
                      <div className="debt-field-grid">
                        <div>
                          <label className="debt-field-label">Debt Name</label>
                          <input type="text" className="debt-field-input" value={s.name}
                            onChange={(e) => patchEdit(d.accountId, { name: e.target.value })} />
                        </div>
                        <div>
                          <label className="debt-field-label">Debt Type</label>
                          <select className="debt-field-input" value={s.type}
                            onChange={(e) => patchEdit(d.accountId, { type: e.target.value as Debt["type"] })}>
                            {DEBT_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="debt-field-label">
                            Interest Rate %
                            <span className="debt-field-label-note">(est.)</span>
                          </label>
                          <input type="number" min={0} step={0.01} className="debt-field-input"
                            value={s.interestRate}
                            onChange={(e) => patchEdit(d.accountId, { interestRate: e.target.value })} />
                        </div>
                        <div>
                          <label className="debt-field-label">
                            Min. Payment / mo
                            <span className="debt-field-label-note">(calc.)</span>
                          </label>
                          <input type="number" min={0} step={0.01} className="debt-field-input"
                            value={s.minimumPayment}
                            onChange={(e) => patchEdit(d.accountId, { minimumPayment: e.target.value })} />
                        </div>
                        <div>
                          <label className="debt-field-label">Lender / Institution</label>
                          <input type="text" className="debt-field-input" value={s.lender}
                            placeholder={d.institution ?? "e.g. TD Bank"}
                            onChange={(e) => patchEdit(d.accountId, { lender: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <p className="debt-detect-hint">
                💡 Balances are calculated from your transaction history. Interest rates and minimum payments are Canadian estimates — update them to reflect your actual terms before importing.
              </p>
            </div>
          )}

          {!detecting && !detectError && detected !== null && visibleDetected.length === 0 && (
            <div className="debt-detect-empty">
              No untracked liability accounts found. Add accounts in the Accounts tab first, or add debts manually.
            </div>
          )}
        </div>
      )}

      {/* ── Manual add form ── */}
      {showForm && (
        <div className="card form-card">
          <h3>Track New Debt</h3>
          <form onSubmit={handleSubmit}>
            <input type="text" placeholder="Debt Name" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />

            <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as Debt["type"] })}>
              {DEBT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <input type="number" step="0.01" placeholder="Original Principal" value={formData.principal}
              onChange={(e) => setFormData({ ...formData, principal: e.target.value })} required />

            <input type="number" step="0.01" placeholder="Current Balance" value={formData.currentBalance}
              onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })} required />

            <input type="number" step="0.01" placeholder="Interest Rate (%)" value={formData.interestRate}
              onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })} required />

            <input type="number" step="0.01" placeholder="Minimum Payment (Monthly)" value={formData.minimumPayment}
              onChange={(e) => setFormData({ ...formData, minimumPayment: e.target.value })} required />

            <input type="text" placeholder="Lender (optional)" value={formData.lender}
              onChange={(e) => setFormData({ ...formData, lender: e.target.value })} />

            <label>
              Due Date Mode
              <select value={formData.dueScheduleType}
                onChange={(e) => setFormData({ ...formData, dueScheduleType: e.target.value as "specific" | "monthly" | "biweekly" })}>
                <option value="specific">Specific Date (one-time)</option>
                <option value="monthly">Specific Day Each Month</option>
                <option value="biweekly">Biweekly Cycle (every 14 days)</option>
              </select>
            </label>

            <label>
              {formData.dueScheduleType === "specific" ? "Specific Due Date"
                : formData.dueScheduleType === "monthly" ? "Monthly Anchor Date"
                : "Biweekly Anchor Date"}
              <input type="date" value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
            </label>

            <button type="submit">Save Debt</button>
          </form>
        </div>
      )}

      {/* ── Debt accounts table ── */}
      {debts.length > 0 && (
        <div className="card debt-section-card">
          <h3>Debt Accounts</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Balance</th>
                <th>APR</th>
                <th>Min Payment</th>
                <th>Due</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((debt) => (
                <tr key={debt._id}>
                  <td>{debt.name}</td>
                  <td>{debt.type}</td>
                  <td className="negative">{CAD(debt.currentBalance)}</td>
                  <td>{debt.interestRate.toFixed(2)}%</td>
                  <td>{CAD(debt.minimumPayment)}</td>
                  <td>
                    {debt.nextDueDate
                      ? new Date(debt.nextDueDate).toLocaleDateString()
                      : debt.dueDate
                      ? new Date(debt.dueDate).toLocaleDateString()
                      : "-"}
                    <div className="debt-due-sub">
                      {debt.dueScheduleType || "specific"}
                    </div>
                  </td>
                  <td>
                    <div className="row">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={paymentInputs[debt._id] || ""}
                        onChange={(e) => setPaymentInputs((prev) => ({ ...prev, [debt._id]: e.target.value }))}
                        style={{ width: "110px" }}
                      />
                      <button className="btn-secondary btn-sm" onClick={() => handleMakePayment(debt._id)}>
                        Apply
                      </button>
                    </div>
                  </td>
                  <td>
                    <button onClick={() => handleDelete(debt._id)} className="btn-danger btn-sm">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payoff planner ── */}
      {debts.length > 0 && (
        <div className="card debt-section-card">
          <h3>Payoff Planner (Avalanche vs Snowball)</h3>
          <div className="debt-planner-controls">
            <label>
              Cadence
              <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              Payment per {cadence === "biweekly" ? "Paycheck" : "Month"}
              <input type="number" step="0.01" value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)} />
            </label>
            <label>
              What-if Extra
              <input type="number" step="0.01" value={extraPayment}
                onChange={(e) => setExtraPayment(e.target.value)} />
            </label>
            <button onClick={loadPlanner}>Run Planner</button>
          </div>

          {strategies && (
            <div className="card-grid debt-planner-grid">
              <div className="card">
                <h4>Avalanche</h4>
                <p>Payoff Time: <strong>{strategies.avalanche?.totalYears} years</strong></p>
                <p>Interest Cost: <strong>{CAD(strategies.avalanche?.totalInterestPaid ?? 0)}</strong></p>
              </div>
              <div className="card">
                <h4>Snowball</h4>
                <p>Payoff Time: <strong>{strategies.snowball?.totalYears} years</strong></p>
                <p>Interest Cost: <strong>{CAD(strategies.snowball?.totalInterestPaid ?? 0)}</strong></p>
              </div>
              <div className="card">
                <h4>Best Interest Saver</h4>
                <p>
                  Avalanche saves vs Snowball:{" "}
                  <strong>
                    {CAD((strategies.snowball?.totalInterestPaid ?? 0) - (strategies.avalanche?.totalInterestPaid ?? 0))}
                  </strong>
                </p>
              </div>
            </div>
          )}

          {optimizer && (
            <div className="debt-planner-grid">
              <h4>Payment Optimizer</h4>
              <p>Minimum total: {CAD(optimizer.totalMinimumPerCadence)} | Extra: {CAD(optimizer.extraPerCadence)}</p>
              <table>
                <thead>
                  <tr>
                    <th>Debt</th>
                    <th>APR</th>
                    <th>Minimum</th>
                    <th>Recommended</th>
                    <th>Focus</th>
                  </tr>
                </thead>
                <tbody>
                  {optimizer.allocations.map((a) => (
                    <tr key={a.debtId}>
                      <td>{a.debtName}</td>
                      <td>{a.interestRate.toFixed(2)}%</td>
                      <td>{CAD(a.minimumPerCadence)}</td>
                      <td>{CAD(a.recommendedPerCadence)}</td>
                      <td>{a.focusDebt ? "✓ Focus" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {whatIf && whatIf.comparison && (
            <div className="debt-whatif">
              <h4>What-if Simulation</h4>
              <p>
                Adding {CAD(Number(extraPayment))} per {cadence === "biweekly" ? "paycheck" : "month"} saves
                <strong> {whatIf.comparison.monthsSaved} month(s)</strong> and about
                <strong> {CAD(whatIf.comparison.interestSaved)}</strong> in interest.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming due dates ── */}
      {dashboard && dashboard.upcomingDue.length > 0 && (
        <div className="card">
          <h3>Upcoming Due Dates (30 Days)</h3>
          <table>
            <thead>
              <tr>
                <th>Debt</th>
                <th>Due Date</th>
                <th>Minimum Payment</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.upcomingDue.map((debt) => (
                <tr key={debt._id}>
                  <td>{debt.name}</td>
                  <td>
                    {debt.nextDueDate
                      ? new Date(debt.nextDueDate).toLocaleDateString()
                      : debt.dueDate
                      ? new Date(debt.dueDate).toLocaleDateString()
                      : "-"}
                    <div style={{ color: "var(--text-light)", fontSize: "0.8rem" }}>{debt.dueScheduleType || "specific"}</div>
                  </td>
                  <td>{CAD(debt.minimumPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Empty state ── */}
      {debts.length === 0 && !showForm && (
        <div className="empty-state">
          <p>No debts tracked yet.</p>
          <p style={{ fontSize: 13, color: "var(--text-light)" }}>
            Click <strong>Detect &amp; Import</strong> to automatically find debts from your liability accounts,
            or click <strong>Add Debt</strong> to enter one manually.
          </p>
          <p>Total debt tracked: {CAD(totalDebt)}</p>
        </div>
      )}
    </div>
  );
}
