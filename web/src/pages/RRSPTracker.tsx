// RRSP account tracker managing contributions, withdrawals, and deduction limit
import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { fmtMoney } from "../components/charts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RRSPContrib { _id: string; year: number; amount: number; date: string; }
interface RRSPWithdrawal { _id: string; year: number; amount: number; date: string; withholding: number; }

interface RRSPAccount {
  _id: string;
  accountName: string;
  institution: string;
  balance: number;
  deductionLimit: number;
  isAccountOwner: boolean;
  contributions: RRSPContrib[];
  withdrawals: RRSPWithdrawal[];
  notes?: string;
}

interface RRSPSummary {
  totalAccounts: number;
  totalBalance: number;
  deductionLimit: number;
  thisYearContrib: number;
  remainingRoom: number;
  totalContributed: number;
  totalWithdrawn: number;
  totalWithholding: number;
  usedPct: number;
  currentYear: number;
  annualMax: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);
const TODAY = new Date().toISOString().split("T")[0];
const CY = new Date().getFullYear();

const BLANK_ACCT   = { accountName: "", institution: "", balance: "", deductionLimit: "", isAccountOwner: true, notes: "" };
const BLANK_CONTRIB = { year: CY, amount: "", date: TODAY };
const BLANK_WITH    = { year: CY, amount: "", date: TODAY, withholding: "" };

const RRSP_RULES = [
  `${CY} contribution limit: $32,490 (or 18% of your ${CY - 1} earned income, whichever is less)`,
  "Your exact deduction limit is on line 2 of your most recent Notice of Assessment (NOA)",
  "Contributions are tax-deductible — they reduce your taxable income for the year",
  "Deadline: 60 days after December 31 (usually March 1) to claim for the prior tax year",
  "Withdrawals are fully taxable as income — 10–30% withholding tax applies at source",
  "RRSP must be converted to a RRIF or annuity by December 31 of the year you turn 71",
  "Home Buyers' Plan (HBP): withdraw up to $35,000 tax-free for a first home (must repay over 15 years)",
  "Lifelong Learning Plan (LLP): withdraw up to $10,000/year ($20,000 total) for full-time education",
  "Spousal RRSP contributions split retirement income and reduce tax on withdrawal",
  "Unused room carries forward indefinitely — there is no expiry",
];

// ── Component ─────────────────────────────────────────────────────────────────

// Renders RRSP account cards with contribution/withdrawal modals and room summary
export default function RRSPTracker() {
  const [accounts, setAccounts] = useState<RRSPAccount[]>([]);
  const [summary,  setSummary]  = useState<RRSPSummary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<Record<string, "contributions" | "withdrawals">>({});

  // Account modal
  const [acctModal,   setAcctModal]   = useState(false);
  const [editingAcct, setEditingAcct] = useState<RRSPAccount | null>(null);
  const [acctForm,    setAcctForm]    = useState({ ...BLANK_ACCT });
  const [acctSaving,  setAcctSaving]  = useState(false);
  const [acctError,   setAcctError]   = useState("");

  // Contribution modal
  const [cModal,   setCModal]  = useState(false);
  const [cTarget,  setCTarget] = useState<RRSPAccount | null>(null);
  const [cForm,    setCForm]   = useState({ ...BLANK_CONTRIB });
  const [cSaving,  setCSaving] = useState(false);
  const [cError,   setCError]  = useState("");

  // Withdrawal modal
  const [wModal,   setWModal]  = useState(false);
  const [wTarget,  setWTarget] = useState<RRSPAccount | null>(null);
  const [wForm,    setWForm]   = useState({ ...BLANK_WITH });
  const [wSaving,  setWSaving] = useState(false);
  const [wError,   setWError]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, sum] = await Promise.all([api("/rrsp-tracker"), api("/rrsp-tracker/summary")]);
      setAccounts(accts);
      setSummary(sum);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Account CRUD ─────────────────────────────────────────────────────────────

  function openAddAcct() {
    setEditingAcct(null); setAcctForm({ ...BLANK_ACCT }); setAcctError(""); setAcctModal(true);
  }
  function openEditAcct(a: RRSPAccount) {
    setEditingAcct(a);
    setAcctForm({ accountName: a.accountName, institution: a.institution, balance: String(a.balance), deductionLimit: String(a.deductionLimit || ""), isAccountOwner: a.isAccountOwner, notes: a.notes || "" });
    setAcctError(""); setAcctModal(true);
  }
  async function saveAcct() {
    if (!acctForm.accountName.trim()) { setAcctError("Account name is required."); return; }
    setAcctSaving(true); setAcctError("");
    try {
      const body = { ...acctForm, balance: Number(acctForm.balance) || 0, deductionLimit: Number(acctForm.deductionLimit) || 0 };
      if (editingAcct) await api(`/rrsp-tracker/${editingAcct._id}`, { method: "PUT", body: JSON.stringify(body) });
      else             await api("/rrsp-tracker", { method: "POST", body: JSON.stringify(body) });
      setAcctModal(false); load();
    } catch (err: any) { setAcctError(err?.message ?? "Save failed"); }
    finally { setAcctSaving(false); }
  }
  async function deleteAcct(id: string) {
    if (!confirm("Delete this RRSP account and all its history?")) return;
    try { await api(`/rrsp-tracker/${id}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  // ── Contribution CRUD ─────────────────────────────────────────────────────────

  function openAddContrib(a: RRSPAccount) {
    setCTarget(a); setCForm({ ...BLANK_CONTRIB }); setCError(""); setCModal(true);
  }
  async function saveContrib() {
    if (!cTarget) return;
    if (!cForm.amount || Number(cForm.amount) <= 0) { setCError("Enter a valid amount."); return; }
    setCSaving(true); setCError("");
    try {
      await api(`/rrsp-tracker/${cTarget._id}/contributions`, {
        method: "POST",
        body: JSON.stringify({ ...cForm, amount: Number(cForm.amount), year: Number(cForm.year) }),
      });
      setCModal(false); load();
    } catch (err: any) { setCError(err?.message ?? "Save failed"); }
    finally { setCSaving(false); }
  }
  async function deleteContrib(acctId: string, cid: string) {
    if (!confirm("Remove this contribution?")) return;
    try { await api(`/rrsp-tracker/${acctId}/contributions/${cid}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  // ── Withdrawal CRUD ───────────────────────────────────────────────────────────

  function openAddWithdrawal(a: RRSPAccount) {
    setWTarget(a); setWForm({ ...BLANK_WITH }); setWError(""); setWModal(true);
  }
  async function saveWithdrawal() {
    if (!wTarget) return;
    if (!wForm.amount || Number(wForm.amount) <= 0) { setWError("Enter a valid amount."); return; }
    setWSaving(true); setWError("");
    try {
      await api(`/rrsp-tracker/${wTarget._id}/withdrawals`, {
        method: "POST",
        body: JSON.stringify({ ...wForm, amount: Number(wForm.amount), year: Number(wForm.year), withholding: Number(wForm.withholding) || 0 }),
      });
      setWModal(false); load();
    } catch (err: any) { setWError(err?.message ?? "Save failed"); }
    finally { setWSaving(false); }
  }
  async function deleteWithdrawal(acctId: string, wid: string) {
    if (!confirm("Remove this withdrawal?")) return;
    try { await api(`/rrsp-tracker/${acctId}/withdrawals/${wid}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function tabFor(id: string): "contributions" | "withdrawals" { return activeTab[id] ?? "contributions"; }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--text-light)" }}>Loading…</div>;

  const roomPct = summary ? pct(summary.thisYearContrib, summary.deductionLimit) : 0;

  const card  = { background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 10 } as const;
  const input = { width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" as const };
  const btnPrimary   = { padding: "10px 22px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 } as const;
  const btnSecondary = { padding: "10px 20px", border: "1px solid #FECACA", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", cursor: "pointer", fontWeight: 600 } as const;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>📈 RRSP Tracker</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-light)", fontSize: "0.9rem" }}>
            Registered Retirement Savings Plan — track contributions, deduction room, and withdrawals
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowRules(r => !r)} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: "0.85rem" }}>
            {showRules ? "Hide Rules" : "CRA Rules"}
          </button>
          <button onClick={openAddAcct} style={{ padding: "8px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            + Add Account
          </button>
        </div>
      </div>

      {/* CRA Rules */}
      {showRules && (
        <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <strong style={{ color: "#6d28d9" }}>RRSP Key Rules (CRA)</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#4c1d95", fontSize: "0.88rem", lineHeight: 1.7 }}>
            {RRSP_RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total RRSP Balance",     value: fmtMoney(summary.totalBalance),      color: "#7c3aed" },
            { label: "Deduction Limit (NOA)",  value: fmtMoney(summary.deductionLimit),    color: "#6d28d9", sub: "From your Notice of Assessment" },
            { label: `${CY} Contributed`,      value: fmtMoney(summary.thisYearContrib),   color: "#6b7280" },
            { label: "Remaining Room",         value: fmtMoney(summary.remainingRoom),     color: summary.remainingRoom > 0 ? "#059669" : "#9ca3af" },
            { label: "Total Contributed",      value: fmtMoney(summary.totalContributed),  color: "#4c1d95" },
            { label: "Total Withholding Paid", value: fmtMoney(summary.totalWithholding),  color: "#dc2626" },
          ].map(c => (
            <div key={c.label} style={{ ...card, padding: "14px 16px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-light)", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: c.color }}>{c.value}</div>
              {c.sub && <div style={{ fontSize: "0.7rem", color: "var(--text-light)", marginTop: 2 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Room progress bar */}
      {summary && (
        <div style={{ ...card, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
            <span><strong>{CY} deduction room used</strong></span>
            <span style={{ color: "var(--text-light)" }}>{fmtMoney(summary.thisYearContrib)} / {fmtMoney(summary.deductionLimit)}</span>
          </div>
          <div style={{ height: 12, background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${roomPct}%`, background: roomPct >= 100 ? "#ef4444" : roomPct >= 90 ? "#f59e0b" : "#7c3aed", borderRadius: 6, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-light)", marginTop: 4 }}>
            <span>{roomPct}% used · {fmtMoney(summary.remainingRoom)} remaining</span>
            <span>Max {CY}: {fmtMoney(summary.annualMax)}</span>
          </div>
          {summary.deductionLimit === summary.annualMax && (
            <div style={{ marginTop: 8, fontSize: "0.78rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px" }}>
              ⚠️ Using the default limit — check your CRA NOA and update your deduction limit for accuracy.
            </div>
          )}
        </div>
      )}

      {/* Accounts */}
      {accounts.length === 0 ? (
        <div style={{ ...card, border: "2px dashed var(--border, #e5e7eb)", padding: "48px 24px", textAlign: "center", color: "var(--text-light)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📈</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No RRSP accounts yet</div>
          <div style={{ fontSize: "0.9rem", marginBottom: 20 }}>Add your RRSP or Spousal RRSP accounts to track contributions and room.</div>
          <button onClick={openAddAcct} style={btnPrimary}>+ Add Your RRSP</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {accounts.map(acct => {
            const isOpen = expanded.has(acct._id);
            const tab    = tabFor(acct._id);
            const totalContrib  = acct.contributions.reduce((s, c) => s + c.amount, 0);
            const totalWithdraw = acct.withdrawals.reduce((s, w) => s + w.amount, 0);
            return (
              <div key={acct._id} style={{ ...card, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: "1rem" }}>{acct.accountName}</span>
                      {!acct.isAccountOwner && (
                        <span style={{ fontSize: "0.7rem", background: "#faf5ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 4, padding: "2px 6px", fontWeight: 600 }}>Spousal</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-light)" }}>
                      {acct.institution || "No institution"} · {acct.contributions.length} contrib · {acct.withdrawals.length} withdrawals
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 130 }}>
                    <div style={{ fontWeight: 700, color: "#7c3aed", fontSize: "1.1rem" }}>{fmtMoney(acct.balance)}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
                      In: {fmtMoney(totalContrib)} · Out: {fmtMoney(totalWithdraw)}
                    </div>
                    {acct.deductionLimit > 0 && (
                      <div style={{ fontSize: "0.72rem", color: "#6d28d9" }}>Room: {fmtMoney(acct.deductionLimit)}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openAddContrib(acct)} style={{ padding: "6px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: "0.82rem" }}>+ Contribute</button>
                    <button onClick={() => openAddWithdrawal(acct)} style={{ padding: "6px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: "0.82rem" }}>− Withdraw</button>
                    <button onClick={() => openEditAcct(acct)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.82rem" }}>✏️</button>
                    <button onClick={() => deleteAcct(acct._id)} style={{ padding: "6px 10px", border: "1px solid #fca5a5", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.82rem", color: "#ef4444" }}>🗑️</button>
                    <button onClick={() => toggle(acct._id)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.82rem" }}>{isOpen ? "▲" : "▼"}</button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", padding: "14px 20px" }}>
                    {acct.notes && <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-light)", fontStyle: "italic" }}>{acct.notes}</p>}
                    <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "2px solid var(--border, #e5e7eb)" }}>
                      {(["contributions", "withdrawals"] as const).map(t => (
                        <button key={t} onClick={() => setActiveTab(prev => ({ ...prev, [acct._id]: t }))}
                          style={{ padding: "6px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: tab === t ? 700 : 400, color: tab === t ? "#7c3aed" : "var(--text-light)", borderBottom: tab === t ? "2px solid #7c3aed" : "2px solid transparent", marginBottom: -2, textTransform: "capitalize" }}>
                          {t} ({t === "contributions" ? acct.contributions.length : acct.withdrawals.length})
                        </button>
                      ))}
                    </div>

                    {tab === "contributions" && (
                      acct.contributions.length === 0
                        ? <p style={{ color: "var(--text-light)", fontSize: "0.88rem", margin: 0 }}>No contributions recorded.</p>
                        : <ContribTable rows={acct.contributions} onDelete={cid => deleteContrib(acct._id, cid)} />
                    )}
                    {tab === "withdrawals" && (
                      acct.withdrawals.length === 0
                        ? <p style={{ color: "var(--text-light)", fontSize: "0.88rem", margin: 0 }}>No withdrawals recorded.</p>
                        : <WithdrawalTable rows={acct.withdrawals} onDelete={wid => deleteWithdrawal(acct._id, wid)} />
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
        <Modal title={editingAcct ? "Edit RRSP Account" : "Add RRSP Account"} onClose={() => setAcctModal(false)}>
          {acctError && <ErrorBox msg={acctError} />}
          <FieldGroup>
            <Field label="Account Name">
              <input value={acctForm.accountName} onChange={e => setAcctForm(p => ({ ...p, accountName: e.target.value }))} placeholder="e.g. TD RRSP" style={input} />
            </Field>
            <Field label="Institution">
              <input value={acctForm.institution} onChange={e => setAcctForm(p => ({ ...p, institution: e.target.value }))} placeholder="e.g. TD, Fidelity" style={input} />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field label="Current Balance ($)">
              <input type="number" min={0} step="0.01" value={acctForm.balance} onChange={e => setAcctForm(p => ({ ...p, balance: e.target.value }))} placeholder="0.00" style={input} />
            </Field>
            <Field label="Deduction Limit from NOA ($)">
              <input type="number" min={0} step="0.01" value={acctForm.deductionLimit} onChange={e => setAcctForm(p => ({ ...p, deductionLimit: e.target.value }))} placeholder="e.g. 31560" style={input} />
            </Field>
          </FieldGroup>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}>
              <input type="checkbox" checked={!acctForm.isAccountOwner} onChange={e => setAcctForm(p => ({ ...p, isAccountOwner: !e.target.checked }))} style={{ width: 16, height: 16 }} />
              This is a <strong>Spousal RRSP</strong> (you contribute, spouse owns)
            </label>
          </div>
          <Field label="Notes (optional)" style={{ marginBottom: 20 }}>
            <textarea value={acctForm.notes} onChange={e => setAcctForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...input, resize: "vertical" }} />
          </Field>
          <ModalActions>
            <button onClick={() => setAcctModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={saveAcct} disabled={acctSaving} style={btnPrimary}>{acctSaving ? "Saving…" : "Save"}</button>
          </ModalActions>
        </Modal>
      )}

      {/* Contribution Modal */}
      {cModal && cTarget && (
        <Modal title="Record Contribution" subtitle={cTarget.accountName} onClose={() => setCModal(false)}>
          {cError && <ErrorBox msg={cError} />}
          {summary && summary.remainingRoom > 0 && (
            <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.85rem", color: "#6d28d9" }}>
              {fmtMoney(summary.remainingRoom)} room remaining · Deadline: 60 days after Dec 31
            </div>
          )}
          <FieldGroup>
            <Field label="Tax Year">
              <input type="number" min={1991} max={CY} value={cForm.year} onChange={e => setCForm(p => ({ ...p, year: Number(e.target.value) }))} style={input} />
            </Field>
            <Field label="Amount ($)">
              <input type="number" min={0} step="0.01" value={cForm.amount} onChange={e => setCForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={input} />
            </Field>
          </FieldGroup>
          <Field label="Date" style={{ marginBottom: 20 }}>
            <input type="date" value={cForm.date} onChange={e => setCForm(p => ({ ...p, date: e.target.value }))} style={input} />
          </Field>
          <ModalActions>
            <button onClick={() => setCModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={saveContrib} disabled={cSaving} style={btnPrimary}>{cSaving ? "Saving…" : "Record"}</button>
          </ModalActions>
        </Modal>
      )}

      {/* Withdrawal Modal */}
      {wModal && wTarget && (
        <Modal title="Record Withdrawal" subtitle={wTarget.accountName} onClose={() => setWModal(false)}>
          {wError && <ErrorBox msg={wError} />}
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.85rem", color: "#991b1b" }}>
            ⚠️ RRSP withdrawals are fully taxable. Withholding tax is deducted at source (10–30%). The withdrawn amount does <strong>not</strong> add back to your contribution room.
          </div>
          <FieldGroup>
            <Field label="Year">
              <input type="number" min={1991} max={CY} value={wForm.year} onChange={e => setWForm(p => ({ ...p, year: Number(e.target.value) }))} style={input} />
            </Field>
            <Field label="Gross Amount ($)">
              <input type="number" min={0} step="0.01" value={wForm.amount} onChange={e => setWForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={input} />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field label="Date">
              <input type="date" value={wForm.date} onChange={e => setWForm(p => ({ ...p, date: e.target.value }))} style={input} />
            </Field>
            <Field label="Withholding Tax ($)">
              <input type="number" min={0} step="0.01" value={wForm.withholding} onChange={e => setWForm(p => ({ ...p, withholding: e.target.value }))} placeholder="e.g. 1500" style={input} />
            </Field>
          </FieldGroup>
          <div style={{ marginBottom: 20, fontSize: "0.78rem", color: "var(--text-light)" }}>
            Withholding rates: up to $5,000 → 10% · $5,001–$15,000 → 20% · over $15,000 → 30% (Quebec rates differ)
          </div>
          <ModalActions>
            <button onClick={() => setWModal(false)} style={btnSecondary}>Cancel</button>
            <button onClick={saveWithdrawal} disabled={wSaving} style={{ ...btnPrimary, background: "#dc2626" }}>{wSaving ? "Saving…" : "Record"}</button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContribTable({ rows, onDelete }: { rows: RRSPContrib[]; onDelete: (id: string) => void }) {
  const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          {["Year", "Date", "Amount", ""].map(h => (
            <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-light)", fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r._id} style={{ borderBottom: "1px solid var(--border, #f3f4f6)" }}>
            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{r.year}</td>
            <td style={{ padding: "7px 10px" }}>{new Date(r.date).toLocaleDateString("en-CA")}</td>
            <td style={{ padding: "7px 10px", color: "#7c3aed", fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
            <td style={{ padding: "7px 10px" }}>
              <button onClick={() => onDelete(r._id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}>Remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WithdrawalTable({ rows, onDelete }: { rows: RRSPWithdrawal[]; onDelete: (id: string) => void }) {
  const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          {["Year", "Date", "Gross", "Withholding", "Net", ""].map(h => (
            <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-light)", fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r._id} style={{ borderBottom: "1px solid var(--border, #f3f4f6)" }}>
            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{r.year}</td>
            <td style={{ padding: "7px 10px" }}>{new Date(r.date).toLocaleDateString("en-CA")}</td>
            <td style={{ padding: "7px 10px", color: "#dc2626", fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
            <td style={{ padding: "7px 10px", color: "#6b7280" }}>{fmtMoney(r.withholding)}</td>
            <td style={{ padding: "7px 10px", color: "#374151" }}>{fmtMoney(r.amount - r.withholding)}</td>
            <td style={{ padding: "7px 10px" }}>
              <button onClick={() => onDelete(r._id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}>Remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Modal({ title, subtitle, children, onClose: _onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.2rem" }}>{title}</h2>
        {subtitle && <p style={{ margin: "0 0 18px", fontSize: "0.85rem", color: "var(--text-light)" }}>{subtitle}</p>}
        {!subtitle && <div style={{ marginBottom: 18 }} />}
        {children}
      </div>
    </div>
  );
}
function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>{children}</div>;
}
function Field({ label: lbl, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>{lbl}</label>
      {children}
    </div>
  );
}
function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>{children}</div>;
}
function ErrorBox({ msg }: { msg: string }) {
  return <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: "0.88rem" }}>{msg}</div>;
}
