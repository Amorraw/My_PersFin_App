// Recurring transaction manager with pattern-detection from transaction history
import { useState, useEffect } from "react";
import EmptyState from "../components/EmptyState";
import './RecurringTransactions.css';
import { fmtMoney as CAD } from "../utils/formatters";

interface Recurring {
  _id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  frequency: string;
  dayOfMonth: number;
  nextDueDate: string;
  accountId?: string;
  isActive: boolean;
}

interface DetectedPattern {
  name: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  frequency: string;
  confidence: number;
  occurrences: number;
  lastDate: string;
  nextDueDate: string;
  dayOfMonth: number;
  accountId?: string;
  alreadyTracked: boolean;
}

const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"];
const CATEGORIES = ["Housing", "Utilities", "Subscriptions", "Insurance", "Transportation", "Food", "Health", "Savings", "Income", "Other"];
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function confidenceColor(c: number): { bg: string; text: string; label: string } {
  if (c >= 0.8) return { bg: "#d1fae5", text: "#065f46", label: "Strong" };
  if (c >= 0.6) return { bg: "#fef3c7", text: "#92400e", label: "Likely" };
  return { bg: "#fee2e2", text: "#991b1b", label: "Possible" };
}

const blank = (): Omit<Recurring, "_id"> => ({
  name: "", amount: 0, type: "expense", category: "Subscriptions",
  frequency: "monthly", dayOfMonth: 1, nextDueDate: new Date().toISOString().slice(0, 10),
  isActive: true,
});

// Renders recurring items list and auto-detected pattern suggestions
export default function RecurringTransactions() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [posting, setPosting] = useState<string | null>(null);

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedPattern[] | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [addingAll, setAddingAll] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/recurring", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json();
      })
      .then((d) => { setItems(d); setLoading(false); })
      .catch((err) => { setLoadError(err.message || "Failed to load"); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(blank()); setEditId(null); setShowForm(true); };
  const openEdit = (r: Recurring) => {
    setForm({ ...r, nextDueDate: r.nextDueDate.slice(0, 10) });
    setEditId(r._id);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editId ? `/api/recurring/${editId}` : "/api/recurring";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Server error ${res.status}`);
      }
      closeForm();
      load();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this recurring transaction?")) return;
    try {
      await fetch(`/api/recurring/${id}`, { method: "DELETE", credentials: "include" });
      load();
    } catch {
      alert("Failed to delete");
    }
  };

  const postNow = async (id: string) => {
    setPosting(id);
    try {
      const res = await fetch(`/api/recurring/${id}/post`, { method: "POST", credentials: "include" });
      const data = await res.json();
      setPosting(null);
      if (data.ok) load();
      else alert(data.message || "Failed to post");
    } catch {
      setPosting(null);
      alert("Failed to post transaction");
    }
  };

  // ── Detection ──────────────────────────────────────────────────────────────

  const detect = async () => {
    setDetecting(true);
    setDetectError(null);
    setDetected(null);
    setDismissed(new Set());
    try {
      const res = await fetch("/api/recurring/detect", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Server error ${res.status}`);
      }
      const data: DetectedPattern[] = await res.json();
      setDetected(data);
    } catch (err: any) {
      setDetectError(err.message || "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const addDetected = async (p: DetectedPattern) => {
    try {
      const res = await fetch("/api/recurring", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          amount: p.amount,
          type: p.type,
          category: p.category,
          frequency: p.frequency,
          dayOfMonth: p.dayOfMonth,
          nextDueDate: p.nextDueDate,
          accountId: p.accountId,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to add");
      }
      setDetected((prev) =>
        prev ? prev.map((d) => d.name === p.name ? { ...d, alreadyTracked: true } : d) : prev
      );
      load();
    } catch (err: any) {
      alert(err.message || "Failed to add recurring transaction");
    }
  };

  const addAllDetected = async () => {
    if (!detected) return;
    const toAdd = detected.filter((p) => !p.alreadyTracked && !dismissed.has(p.name));
    if (toAdd.length === 0) return;
    setAddingAll(true);
    for (const p of toAdd) {
      await addDetected(p);
    }
    setAddingAll(false);
  };

  const dismissDetected = (name: string) => {
    setDismissed((prev) => new Set([...prev, name]));
  };

  const visibleDetected = detected
    ? detected.filter((p) => !dismissed.has(p.name))
    : [];
  const newCount = visibleDetected.filter((p) => !p.alreadyTracked).length;

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalMonthly = items
    .filter((r) => r.isActive)
    .reduce((sum, r) => {
      const factor: Record<string, number> = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
      const sign = r.type === "income" ? 1 : -1;
      return sum + r.amount * (factor[r.frequency] ?? 1) * sign;
    }, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="recurring-container">

      {/* Header */}
      <div className="rt-header">
        <div>
          <h1>Recurring Transactions</h1>
          <p className="rt-header-subtitle">
            Monthly net: <strong className={totalMonthly >= 0 ? "positive" : "negative"}>{CAD(totalMonthly)}</strong>
          </p>
        </div>
        <div className="rt-header-actions">
          <button className="rt-detect-btn" onClick={detect} disabled={detecting}>
            {detecting ? "Detecting…" : "🔍 Detect Recurring"}
          </button>
          <button className="btn-primary" onClick={openNew}>+ Add Recurring</button>
        </div>
      </div>

      {/* Detection panel */}
      {(detected !== null || detecting || detectError) && (
        <div className="rt-detect-panel">
          <div className="rt-detect-header">
            <div>
              <h3>
                {detecting ? "Scanning transaction history…" : detectError ? "Detection failed" : "Detected Patterns"}
              </h3>
              {!detecting && !detectError && detected !== null && (
                <p className="rt-detect-subtitle">
                  {visibleDetected.length === 0
                    ? "No untracked patterns found — you're all caught up."
                    : `${newCount} new pattern${newCount !== 1 ? "s" : ""} found from your transaction history`}
                </p>
              )}
              {detectError && <p className="rt-detect-error">{detectError}</p>}
            </div>
            <div className="rt-detect-actions">
              {!detecting && !detectError && newCount > 0 && (
                <button className="btn-primary btn-sm" onClick={addAllDetected} disabled={addingAll}>
                  {addingAll ? "Adding…" : `Add All ${newCount} New`}
                </button>
              )}
              <button className="btn-secondary btn-sm" onClick={() => { setDetected(null); setDetectError(null); }}>
                Close
              </button>
            </div>
          </div>

          {detecting && (
            <div className="rt-loading">Analyzing transactions for recurring patterns…</div>
          )}

          {!detecting && visibleDetected.length > 0 && (
            <div className="rt-patterns-list">
              {visibleDetected.map((p) => {
                const conf = confidenceColor(p.confidence);
                return (
                  <div key={p.name} className={`rt-pattern-row${p.alreadyTracked ? " tracked" : ""}`}>
                    <div style={{ minWidth: 0 }}>
                      <div className="rt-pattern-name">{p.name}</div>
                      <div className="rt-pattern-meta">
                        {p.category} · {p.occurrences} occurrences · last {formatDate(p.lastDate)}
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: p.type === "income" ? "var(--success)" : "var(--danger)", whiteSpace: "nowrap" }}>
                      {p.type === "income" ? "+" : "-"}{CAD(p.amount)}
                    </div>

                    <span className="rt-freq-badge">{p.frequency}</span>

                    <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: 10, background: conf.bg, color: conf.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {conf.label} {Math.round(p.confidence * 100)}%
                    </span>

                    {p.alreadyTracked ? (
                      <span className="rt-tracked-badge">✓ Tracked</span>
                    ) : (
                      <button className="rt-add-btn" onClick={() => addDetected(p)}>+ Add</button>
                    )}

                    <button className="rt-dismiss-btn" onClick={() => dismissDetected(p.name)} title="Dismiss">×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rt-form-card">
          <h3>{editId ? "Edit" : "New"} Recurring Transaction</h3>
          <form onSubmit={save}>
            <div className="rt-form-grid">
              <div>
                <label className="rt-form-label">Name</label>
                <input
                  type="text"
                  required
                  className="rt-form-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="rt-form-label">Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  required
                  className="rt-form-field"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="rt-form-label">Type</label>
                <select
                  className="rt-form-field"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <label className="rt-form-label">Category</label>
                <select
                  className="rt-form-field"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="rt-form-label">Frequency</label>
                <select
                  className="rt-form-field"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="rt-form-label">Next Due Date</label>
                <input
                  type="date"
                  required
                  className="rt-form-field"
                  value={form.nextDueDate}
                  onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
                />
              </div>
            </div>
            <label className="rt-active-label">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
            <div className="rt-form-actions">
              <button type="submit" className="btn-primary">Save</button>
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Recurring list */}
      {loading ? (
        <div className="rt-loading">Loading…</div>
      ) : loadError ? (
        <div className="rt-error-state">
          {loadError} — <button className="rt-retry-btn" onClick={load}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="No recurring transactions"
          description="Add bills, subscriptions, and income that repeat regularly, or use Detect Recurring to find them automatically."
          action={{ label: "+ Add Recurring", onClick: openNew }}
        />
      ) : (
        <div className="rt-table-card">
          <table className="rt-table">
            <thead>
              <tr>
                {["Name", "Amount", "Type", "Category", "Frequency", "Next Due", "Status", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const dateStr = r.nextDueDate.slice(0, 10);
                const today = new Date().toISOString().slice(0, 10);
                const daysUntil = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000);
                const overdue = daysUntil < 0;
                const soon = daysUntil >= 0 && daysUntil <= 3;
                return (
                  <tr key={r._id} className={r.isActive ? "" : "rt-row-inactive"}>
                    <td className="td-name">{r.name}</td>
                    <td style={{ fontWeight: 600, color: r.type === "income" ? "var(--success)" : "var(--danger)" }}>
                      {r.type === "income" ? "+" : "-"}{CAD(r.amount)}
                    </td>
                    <td>
                      <span className={`rt-type-badge ${r.type}`}>{r.type}</span>
                    </td>
                    <td className="td-category">{r.category}</td>
                    <td className="td-freq">{r.frequency}</td>
                    <td className={overdue ? "rt-date-overdue" : soon ? "rt-date-soon" : ""}>
                      {formatDate(r.nextDueDate)}
                      {overdue && <span className="rt-date-tag">OVERDUE</span>}
                      {soon && !overdue && <span className="rt-date-tag">SOON</span>}
                    </td>
                    <td>
                      <span className={`rt-status-badge ${r.isActive ? "active" : "paused"}`}>
                        {r.isActive ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td>
                      <div className="rt-actions">
                        <button
                          className="rt-btn-post"
                          onClick={() => postNow(r._id)}
                          disabled={posting === r._id}
                          title="Post now as a transaction"
                        >
                          {posting === r._id ? "…" : "Post"}
                        </button>
                        <button className="rt-btn-edit" onClick={() => openEdit(r)}>Edit</button>
                        <button className="rt-btn-del" onClick={() => remove(r._id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
