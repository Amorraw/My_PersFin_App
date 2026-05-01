import { useState, useEffect } from "react";
import EmptyState from "../components/EmptyState";

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

const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"];
const CATEGORIES = ["Housing", "Utilities", "Subscriptions", "Insurance", "Transportation", "Food", "Health", "Savings", "Income", "Other"];
const CAD = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });

const blank = (): Omit<Recurring, "_id"> => ({
  name: "", amount: 0, type: "expense", category: "Subscriptions",
  frequency: "monthly", dayOfMonth: 1, nextDueDate: new Date().toISOString().slice(0, 10),
  isActive: true,
});

export default function RecurringTransactions() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [posting, setPosting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/recurring", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(blank()); setEditId(null); setShowForm(true); };
  const openEdit = (r: Recurring) => { setForm({ ...r }); setEditId(r._id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editId ? `/api/recurring/${editId}` : "/api/recurring";
    const method = editId ? "PUT" : "POST";
    await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    closeForm();
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this recurring transaction?")) return;
    await fetch(`/api/recurring/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const postNow = async (id: string) => {
    setPosting(id);
    const res = await fetch(`/api/recurring/${id}/post`, { method: "POST", credentials: "include" });
    const data = await res.json();
    setPosting(null);
    if (data.ok) load();
    else alert(data.message || "Failed to post");
  };

  const totalMonthly = items
    .filter((r) => r.isActive)
    .reduce((sum, r) => {
      const factor: Record<string, number> = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
      const sign = r.type === "income" ? 1 : -1;
      return sum + r.amount * (factor[r.frequency] ?? 1) * sign;
    }, 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Recurring Transactions</h1>
          <p style={{ color: "var(--text-light)", fontSize: 14, margin: "4px 0 0" }}>
            Monthly net: <strong style={{ color: totalMonthly >= 0 ? "#059669" : "#dc2626" }}>{CAD(totalMonthly)}</strong>
          </p>
        </div>
        <button onClick={openNew} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--primary)", color: "white", border: "none", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
          + Add Recurring
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editId ? "Edit" : "New"} Recurring Transaction</h3>
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {[
                { label: "Name", field: "name" as const, type: "text", required: true },
              ].map(({ label, field, type, required }) => (
                <div key={field}>
                  <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    type={type}
                    required={required}
                    value={form[field] as string}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>Amount</label>
                <input type="number" min={0} step={0.01} required value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>Frequency</label>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-light)", display: "block", marginBottom: 4 }}>Next Due Date</label>
                <input type="date" required value={form.nextDueDate}
                  onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 14, margin: 0 }} />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" style={{ padding: "8px 20px", borderRadius: 8, background: "var(--primary)", color: "white", border: "none", fontSize: 14, cursor: "pointer" }}>Save</button>
              <button type="button" onClick={closeForm} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-light)" }}>Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon="🔁" title="No recurring transactions" description="Add bills, subscriptions, and income that repeat regularly." action={{ label: "+ Add Recurring", onClick: openNew }} />
      ) : (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--bg)" }}>
              <tr>
                {["Name", "Amount", "Type", "Category", "Frequency", "Next Due", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: "var(--text-light)", fontWeight: 600, borderBottom: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const due = new Date(r.nextDueDate);
                const daysUntil = Math.ceil((due.getTime() - Date.now()) / 86400000);
                const overdue = daysUntil < 0;
                const soon = daysUntil >= 0 && daysUntil <= 3;
                return (
                  <tr key={r._id} style={{ borderBottom: "1px solid var(--border)", opacity: r.isActive ? 1 : 0.5 }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500, fontSize: 14 }}>{r.name}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: r.type === "income" ? "#059669" : "#dc2626" }}>
                      {r.type === "income" ? "+" : "-"}{CAD(r.amount)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: r.type === "income" ? "#d1fae5" : "#fee2e2", color: r.type === "income" ? "#065f46" : "#991b1b" }}>
                        {r.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-light)" }}>{r.category}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, textTransform: "capitalize" }}>{r.frequency}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: overdue ? "#dc2626" : soon ? "#d97706" : "var(--text)" }}>
                      {due.toLocaleDateString("en-CA")}
                      {overdue && <span style={{ fontSize: 10, marginLeft: 4, color: "#dc2626" }}>OVERDUE</span>}
                      {soon && !overdue && <span style={{ fontSize: 10, marginLeft: 4, color: "#d97706" }}>SOON</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: r.isActive ? "#d1fae5" : "#f3f4f6", color: r.isActive ? "#065f46" : "#6b7280" }}>
                        {r.isActive ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => postNow(r._id)} disabled={posting === r._id} title="Post now as a transaction"
                          style={{ padding: "4px 10px", borderRadius: 6, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", fontSize: 12, cursor: "pointer" }}>
                          {posting === r._id ? "…" : "Post"}
                        </button>
                        <button onClick={() => openEdit(r)}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", fontSize: 12, cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={() => remove(r._id)}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, cursor: "pointer" }}>
                          Del
                        </button>
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
