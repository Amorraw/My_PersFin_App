// FHSA account tracker with annual/lifetime room tracking for first-time buyers
import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { fmtMoney as CAD } from "../utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FHSAContribution {
  _id: string;
  year: number;
  amount: number;
  date: string;
  note?: string;
}

interface FHSAAccount {
  _id: string;
  institution: string;
  accountName: string;
  openedYear: number;
  currentBalance: number;
  contributions: FHSAContribution[];
  notes?: string;
}

interface FHSASummary {
  totalAccounts: number;
  totalBalance: number;
  annualLimit: number;
  lifetimeLimit: number;
  openedYear: number | null;
  totalContributed: number;
  lifetimeRemaining: number;
  currentYearAvailable: number;
  currentYearContributed: number;
  currentYearRemaining: number;
  carryForward: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct  = (n: number, d: number) => d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;

const BLANK_ACCOUNT = { institution: "", accountName: "", openedYear: new Date().getFullYear(), currentBalance: "", notes: "" };
const BLANK_CONTRIB = { year: new Date().getFullYear(), amount: "", date: new Date().toISOString().split("T")[0], note: "" };

const RULES = [
  "Annual contribution limit: $8,000 (unused room carries forward up to $8,000)",
  "Lifetime contribution limit: $40,000",
  "Contributions are tax-deductible (like an RRSP)",
  "Qualifying withdrawals for a first home purchase are tax-free",
  "Unused funds can be transferred to your RRSP/RRIF (no RRSP room impact)",
  "Account must be closed within 15 years of opening, or the year you turn 71",
];

// ── Component ─────────────────────────────────────────────────────────────────

// Renders FHSA account cards with contribution modals and carry-forward room display
export default function FHSATracker() {
  const [accounts, setAccounts]     = useState<FHSAAccount[]>([]);
  const [summary, setSummary]       = useState<FHSASummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [showRules, setShowRules]   = useState(false);

  // Account modal
  const [acctModal, setAcctModal]   = useState(false);
  const [editingAcct, setEditingAcct] = useState<FHSAAccount | null>(null);
  const [acctForm, setAcctForm]     = useState({ ...BLANK_ACCOUNT });
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctError, setAcctError]   = useState("");

  // Contribution modal
  const [contribModal, setContribModal]     = useState(false);
  const [contribTarget, setContribTarget]   = useState<FHSAAccount | null>(null);
  const [contribForm, setContribForm]       = useState({ ...BLANK_CONTRIB });
  const [contribSaving, setContribSaving]   = useState(false);
  const [contribError, setContribError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, sum] = await Promise.all([api("/fhsa"), api("/fhsa/summary")]);
      setAccounts(accts);
      setSummary(sum);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Account CRUD ─────────────────────────────────────────────────────────────

  function openAddAcct() {
    setEditingAcct(null);
    setAcctForm({ ...BLANK_ACCOUNT });
    setAcctError("");
    setAcctModal(true);
  }

  function openEditAcct(a: FHSAAccount) {
    setEditingAcct(a);
    setAcctForm({ institution: a.institution, accountName: a.accountName, openedYear: a.openedYear, currentBalance: String(a.currentBalance), notes: a.notes || "" });
    setAcctError("");
    setAcctModal(true);
  }

  async function saveAcct() {
    if (!acctForm.institution || !acctForm.accountName) { setAcctError("Institution and account name are required."); return; }
    if (acctForm.openedYear < 2023) { setAcctError("FHSA was introduced in 2023."); return; }
    setAcctSaving(true);
    setAcctError("");
    try {
      const body = { ...acctForm, openedYear: Number(acctForm.openedYear), currentBalance: Number(acctForm.currentBalance) || 0 };
      if (editingAcct) await api(`/fhsa/${editingAcct._id}`, { method: "PUT", body: JSON.stringify(body) });
      else             await api("/fhsa", { method: "POST", body: JSON.stringify(body) });
      setAcctModal(false);
      load();
    } catch (err: any) {
      setAcctError(err?.message ?? "Save failed");
    } finally {
      setAcctSaving(false);
    }
  }

  async function deleteAcct(id: string) {
    if (!confirm("Delete this FHSA account and all its contribution history?")) return;
    try { await api(`/fhsa/${id}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  // ── Contribution CRUD ─────────────────────────────────────────────────────────

  function openAddContrib(a: FHSAAccount) {
    setContribTarget(a);
    setContribForm({ ...BLANK_CONTRIB });
    setContribError("");
    setContribModal(true);
  }

  async function saveContrib() {
    if (!contribTarget) return;
    if (!contribForm.amount || Number(contribForm.amount) <= 0) { setContribError("Enter a valid amount."); return; }
    setContribSaving(true);
    setContribError("");
    try {
      await api(`/fhsa/${contribTarget._id}/contributions`, {
        method: "POST",
        body: JSON.stringify({ ...contribForm, amount: Number(contribForm.amount), year: Number(contribForm.year) }),
      });
      setContribModal(false);
      load();
    } catch (err: any) {
      setContribError(err?.message ?? "Save failed");
    } finally {
      setContribSaving(false);
    }
  }

  async function deleteContrib(acctId: string, cid: string) {
    if (!confirm("Remove this contribution?")) return;
    try { await api(`/fhsa/${acctId}/contributions/${cid}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--text-light)" }}>Loading…</div>;

  const lifetimePct    = summary ? pct(summary.totalContributed, summary.lifetimeLimit) : 0;
  const currentYearPct = summary ? pct(summary.currentYearContributed, summary.currentYearAvailable) : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>🏠 FHSA Tracker</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-light)", fontSize: "0.9rem" }}>
            First Home Savings Account — tax-deductible contributions, tax-free qualifying withdrawals
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowRules(r => !r)} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: "0.85rem" }}>
            {showRules ? "Hide Rules" : "CRA Rules"}
          </button>
          <button onClick={openAddAcct} style={{ padding: "8px 18px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            + Add Account
          </button>
        </div>
      </div>

      {/* CRA Rules info box */}
      {showRules && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <strong style={{ color: "#1d4ed8" }}>FHSA Key Rules (CRA)</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#1e40af", fontSize: "0.88rem", lineHeight: 1.7 }}>
            {RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Balance",          value: CAD(summary.totalBalance),          color: "#059669" },
            { label: "Lifetime Contributed",   value: CAD(summary.totalContributed),       color: "#4f46e5" },
            { label: "Lifetime Room Left",     value: CAD(summary.lifetimeRemaining),      color: summary.lifetimeRemaining > 0 ? "#d97706" : "#9ca3af" },
            { label: "This Year Available",    value: CAD(summary.currentYearAvailable),   color: "#0ea5e9" },
            { label: "This Year Contributed",  value: CAD(summary.currentYearContributed), color: "#6b7280" },
            { label: "This Year Remaining",    value: CAD(summary.currentYearRemaining),   color: summary.currentYearRemaining > 0 ? "#059669" : "#9ca3af" },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bars */}
      {summary && summary.openedYear && (
        <div style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
              <span>Lifetime room used</span>
              <span style={{ color: "#6b7280" }}>{CAD(summary.totalContributed)} / {CAD(summary.lifetimeLimit)}</span>
            </div>
            <div style={{ height: 10, background: "#e5e7eb", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${lifetimePct}%`, background: lifetimePct >= 90 ? "#ef4444" : "#4f46e5", borderRadius: 5, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 3 }}>{lifetimePct}% used</div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
              <span>{new Date().getFullYear()} room used{summary.carryForward > 0 && ` (incl. ${CAD(summary.carryForward)} carry-forward)`}</span>
              <span style={{ color: "#6b7280" }}>{CAD(summary.currentYearContributed)} / {CAD(summary.currentYearAvailable)}</span>
            </div>
            <div style={{ height: 10, background: "#e5e7eb", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${currentYearPct}%`, background: currentYearPct >= 90 ? "#f59e0b" : "#0ea5e9", borderRadius: 5, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 3 }}>{currentYearPct}% used</div>
          </div>
        </div>
      )}

      {/* Accounts list */}
      {accounts.length === 0 ? (
        <div style={{ background: "var(--bg-card, #fff)", border: "2px dashed var(--border, #e5e7eb)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-light)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏠</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No FHSA accounts yet</div>
          <div style={{ fontSize: "0.9rem", marginBottom: 20 }}>Open an FHSA at any Canadian financial institution and track it here.</div>
          <button onClick={openAddAcct} style={{ padding: "10px 24px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            + Add Your FHSA
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {accounts.map(acct => {
            const totalContrib = acct.contributions.reduce((s, c) => s + c.amount, 0);
            const isOpen       = expanded.has(acct._id);
            return (
              <div key={acct._id} style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
                {/* Account header row */}
                <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>{acct.accountName}</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-light)" }}>{acct.institution} · Opened {acct.openedYear}</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 110 }}>
                    <div style={{ fontWeight: 700, color: "#059669", fontSize: "1.05rem" }}>{CAD(acct.currentBalance)}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-light)" }}>{CAD(totalContrib)} contributed</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openAddContrib(acct)} style={{ padding: "6px 14px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: "0.83rem" }}>
                      + Contribute
                    </button>
                    <button onClick={() => openEditAcct(acct)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem" }}>✏️</button>
                    <button onClick={() => deleteAcct(acct._id)} style={{ padding: "6px 10px", border: "1px solid #fca5a5", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem", color: "#ef4444" }}>🗑️</button>
                    <button onClick={() => toggleExpand(acct._id)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem" }}>
                      {isOpen ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {/* Contribution history */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", padding: "14px 20px" }}>
                    {acct.notes && <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-light)", fontStyle: "italic" }}>{acct.notes}</p>}
                    {acct.contributions.length === 0 ? (
                      <p style={{ color: "var(--text-light)", fontSize: "0.88rem", margin: 0 }}>No contributions recorded yet.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                            {["Year", "Date", "Amount", "Note", ""].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-light)", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...acct.contributions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(c => (
                            <tr key={c._id} style={{ borderBottom: "1px solid var(--border, #f3f4f6)" }}>
                              <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.year}</td>
                              <td style={{ padding: "7px 10px" }}>{new Date(c.date).toLocaleDateString("en-CA")}</td>
                              <td style={{ padding: "7px 10px", color: "#059669", fontWeight: 600 }}>{CAD(c.amount)}</td>
                              <td style={{ padding: "7px 10px", color: "var(--text-light)" }}>{c.note || "—"}</td>
                              <td style={{ padding: "7px 10px" }}>
                                <button onClick={() => deleteContrib(acct._id, c._id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}>Remove</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Account Modal */}
      {acctModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: "1.2rem" }}>{editingAcct ? "Edit FHSA Account" : "Add FHSA Account"}</h2>
            {acctError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: "0.88rem" }}>{acctError}</div>}
            {[
              { label: "Account Name", key: "accountName", placeholder: "e.g. TD FHSA" },
              { label: "Institution",  key: "institution",  placeholder: "e.g. TD, RBC, Wealthsimple" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>{f.label}</label>
                <input
                  value={(acctForm as any)[f.key]}
                  onChange={e => setAcctForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Year Opened</label>
                <input
                  type="number" min={2023} max={new Date().getFullYear()}
                  value={acctForm.openedYear}
                  onChange={e => setAcctForm(prev => ({ ...prev, openedYear: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Current Balance ($)</label>
                <input
                  type="number" min={0} step="0.01"
                  value={acctForm.currentBalance}
                  onChange={e => setAcctForm(prev => ({ ...prev, currentBalance: e.target.value }))}
                  placeholder="0.00"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Notes (optional)</label>
              <textarea
                value={acctForm.notes}
                onChange={e => setAcctForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setAcctModal(false)} style={{ padding: "10px 20px", border: "1px solid #FECACA", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveAcct} disabled={acctSaving} style={{ padding: "10px 22px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                {acctSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contribution Modal */}
      {contribModal && contribTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>Record Contribution</h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--text-light)" }}>{contribTarget.accountName}</p>
            {contribError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: "0.88rem" }}>{contribError}</div>}
            {summary && summary.currentYearRemaining > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.85rem", color: "#166534" }}>
                {CAD(summary.currentYearRemaining)} of contribution room remaining for {new Date().getFullYear()}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Tax Year</label>
                <input
                  type="number" min={2023} max={new Date().getFullYear()}
                  value={contribForm.year}
                  onChange={e => setContribForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Amount ($)</label>
                <input
                  type="number" min={0} step="0.01"
                  value={contribForm.amount}
                  onChange={e => setContribForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Date</label>
              <input
                type="date"
                value={contribForm.date}
                onChange={e => setContribForm(prev => ({ ...prev, date: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Note (optional)</label>
              <input
                value={contribForm.note}
                onChange={e => setContribForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="e.g. Monthly pre-authorized contribution"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setContribModal(false)} style={{ padding: "10px 20px", border: "1px solid #FECACA", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveContrib} disabled={contribSaving} style={{ padding: "10px 22px", background: "#059669", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                {contribSaving ? "Saving…" : "Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
