// RESP plan tracker with per-beneficiary CESG room and contribution limit enforcement
import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { fmtMoney as CAD } from "../utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RESPBeneficiary { _id?: string; name: string; birthYear: number; sin?: string; }

interface RESPContribution {
  _id: string;
  year: number;
  amount: number;
  beneficiaryName: string;
  cesgReceived: number;
  date: string;
  note?: string;
}

interface RESPPlan {
  _id: string;
  planType: "individual" | "family";
  institution: string;
  accountName: string;
  beneficiaries: RESPBeneficiary[];
  currentBalance: number;
  contributions: RESPContribution[];
  notes?: string;
}

interface BeneficiarySummary {
  beneficiaryName: string;
  totalContributed: number;
  totalCesgReceived: number;
  remainingCesgRoom: number;
  remainingContribRoom: number;
  currentYearContrib: number;
  currentYearCesgRoom: number;
}

interface RESPSummary {
  totalPlans: number;
  totalBalance: number;
  totalContributed: number;
  totalCesgReceived: number;
  lifetimeLimit: number;
  maxCesgLifetime: number;
  byBeneficiary: BeneficiarySummary[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CESG_ELIGIBLE_PER_YEAR = 2_500;
const MAX_CESG_PER_YEAR      = 500;
const MAX_CESG_LIFETIME      = 7_200;

// Calculates expected CESG (20% on first $2,500) capped at lifetime $7,200 maximum
function suggestedCesg(amount: number, alreadyReceivedLifetime: number): number {
  const eligible = Math.min(amount, CESG_ELIGIBLE_PER_YEAR);
  return Math.round(Math.min(eligible * 0.2, MAX_CESG_PER_YEAR, Math.max(0, MAX_CESG_LIFETIME - alreadyReceivedLifetime)) * 100) / 100;
}

const BLANK_PLAN = { planType: "individual" as "individual" | "family", institution: "", accountName: "", currentBalance: "", notes: "" };
const BLANK_CONTRIB = { year: new Date().getFullYear(), beneficiaryName: "", amount: "", cesgReceived: "", date: new Date().toISOString().split("T")[0], note: "" };

const RULES = [
  "Lifetime contribution limit: $50,000 per beneficiary (no annual limit)",
  "CESG (Canada Education Savings Grant): 20% on first $2,500/year = max $500/year per beneficiary",
  "Lifetime CESG maximum: $7,200 per beneficiary",
  "Contributions can be made until the beneficiary turns 18 (31 for CESG eligibility ends at 17)",
  "Plan must be closed 35 years after opening (or 40 for disabled beneficiaries)",
  "Additional CESG available for lower-income families (contact your institution)",
  "Canada Learning Bond (CLB): up to $2,000 for eligible low-income families — no contribution required",
];

// ── Component ─────────────────────────────────────────────────────────────────

// Renders RESP plan cards with beneficiary CESG tracking and contribution modals
export default function RESPTracker() {
  const [plans, setPlans]           = useState<RESPPlan[]>([]);
  const [summary, setSummary]       = useState<RESPSummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [showRules, setShowRules]   = useState(false);

  // Plan modal
  const [planModal, setPlanModal]   = useState(false);
  const [editingPlan, setEditingPlan] = useState<RESPPlan | null>(null);
  const [planForm, setPlanForm]     = useState({ ...BLANK_PLAN });
  const [beneficiaryForms, setBeneficiaryForms] = useState<{ name: string; birthYear: string; sin: string }[]>([{ name: "", birthYear: "", sin: "" }]);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError]   = useState("");

  // Contribution modal
  const [contribModal, setContribModal]   = useState(false);
  const [contribTarget, setContribTarget] = useState<RESPPlan | null>(null);
  const [contribForm, setContribForm]     = useState({ ...BLANK_CONTRIB });
  const [contribSaving, setContribSaving] = useState(false);
  const [contribError, setContribError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api("/resp"), api("/resp/summary")]);
      setPlans(p);
      setSummary(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Plan CRUD ─────────────────────────────────────────────────────────────────

  function openAddPlan() {
    setEditingPlan(null);
    setPlanForm({ ...BLANK_PLAN });
    setBeneficiaryForms([{ name: "", birthYear: "", sin: "" }]);
    setPlanError("");
    setPlanModal(true);
  }

  function openEditPlan(p: RESPPlan) {
    setEditingPlan(p);
    setPlanForm({ planType: p.planType, institution: p.institution, accountName: p.accountName, currentBalance: String(p.currentBalance), notes: p.notes || "" });
    setBeneficiaryForms(p.beneficiaries.map(b => ({ name: b.name, birthYear: String(b.birthYear), sin: b.sin || "" })));
    setPlanError("");
    setPlanModal(true);
  }

  async function savePlan() {
    if (!planForm.institution || !planForm.accountName) { setPlanError("Institution and account name are required."); return; }
    if (beneficiaryForms.some(b => !b.name || !b.birthYear)) { setPlanError("All beneficiaries need a name and birth year."); return; }
    setPlanSaving(true);
    setPlanError("");
    try {
      const body = {
        ...planForm,
        currentBalance: Number(planForm.currentBalance) || 0,
        beneficiaries: beneficiaryForms.map(b => ({ name: b.name, birthYear: Number(b.birthYear), sin: b.sin || undefined })),
      };
      if (editingPlan) await api(`/resp/${editingPlan._id}`, { method: "PUT", body: JSON.stringify(body) });
      else             await api("/resp", { method: "POST", body: JSON.stringify(body) });
      setPlanModal(false);
      load();
    } catch (err: any) {
      setPlanError(err?.message ?? "Save failed");
    } finally {
      setPlanSaving(false);
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this RESP plan and all contribution history?")) return;
    try { await api(`/resp/${id}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  // ── Contribution CRUD ─────────────────────────────────────────────────────────

  function openAddContrib(p: RESPPlan) {
    setContribTarget(p);
    const first = p.beneficiaries[0]?.name ?? "";
    setContribForm({ ...BLANK_CONTRIB, beneficiaryName: first });
    setContribError("");
    setContribModal(true);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  // Auto-suggest CESG when amount or beneficiary changes
  function handleContribAmountChange(val: string) {
    const amount = Number(val);
    if (!contribTarget || !Number.isFinite(amount)) { setContribForm(prev => ({ ...prev, amount: val })); return; }
    const existingCesg = summary?.byBeneficiary.find(b => b.beneficiaryName === contribForm.beneficiaryName)?.totalCesgReceived ?? 0;
    const cesg = suggestedCesg(amount, existingCesg);
    setContribForm(prev => ({ ...prev, amount: val, cesgReceived: String(cesg) }));
  }

  async function saveContrib() {
    if (!contribTarget) return;
    if (!contribForm.beneficiaryName) { setContribError("Select a beneficiary."); return; }
    if (!contribForm.amount || Number(contribForm.amount) <= 0) { setContribError("Enter a valid amount."); return; }
    setContribSaving(true);
    setContribError("");
    try {
      await api(`/resp/${contribTarget._id}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          ...contribForm,
          amount:       Number(contribForm.amount),
          cesgReceived: Number(contribForm.cesgReceived) || 0,
          year:         Number(contribForm.year),
        }),
      });
      setContribModal(false);
      load();
    } catch (err: any) {
      setContribError(err?.message ?? "Save failed");
    } finally {
      setContribSaving(false);
    }
  }

  async function deleteContrib(planId: string, cid: string) {
    if (!confirm("Remove this contribution?")) return;
    try { await api(`/resp/${planId}/contributions/${cid}`, { method: "DELETE" }); load(); }
    catch (err: any) { alert(err?.message ?? "Delete failed"); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--text-light)" }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>🎓 RESP Tracker</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-light)", fontSize: "0.9rem" }}>
            Registered Education Savings Plan — track contributions &amp; Canada Education Savings Grants
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowRules(r => !r)} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: "0.85rem" }}>
            {showRules ? "Hide Rules" : "CRA Rules"}
          </button>
          <button onClick={openAddPlan} style={{ padding: "8px 18px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            + Add Plan
          </button>
        </div>
      </div>

      {/* Rules */}
      {showRules && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <strong style={{ color: "#92400e" }}>RESP Key Rules (CRA)</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#78350f", fontSize: "0.88rem", lineHeight: 1.7 }}>
            {RULES.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Balance",      value: CAD(summary.totalBalance),       color: "#059669" },
            { label: "Total Contributed",  value: CAD(summary.totalContributed),   color: "#4f46e5" },
            { label: "Total CESG Received",value: CAD(summary.totalCesgReceived),  color: "#d97706" },
            { label: "CESG Lifetime Max",  value: CAD(summary.maxCesgLifetime) + " / beneficiary", color: "#6b7280" },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-light)", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-beneficiary CESG table */}
      {summary && summary.byBeneficiary.length > 0 && (
        <div style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700 }}>CESG by Beneficiary</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border, #e5e7eb)" }}>
                  {["Beneficiary", "Contributed", "CESG Received", "CESG Remaining", "This Year Contrib", "This Year CESG Room"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-light)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.byBeneficiary.map(b => (
                  <tr key={b.beneficiaryName} style={{ borderBottom: "1px solid var(--border, #f3f4f6)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600 }}>{b.beneficiaryName}</td>
                    <td style={{ padding: "9px 12px" }}>{CAD(b.totalContributed)}</td>
                    <td style={{ padding: "9px 12px", color: "#d97706", fontWeight: 600 }}>{CAD(b.totalCesgReceived)}</td>
                    <td style={{ padding: "9px 12px", color: b.remainingCesgRoom > 0 ? "#059669" : "#9ca3af" }}>{CAD(b.remainingCesgRoom)}</td>
                    <td style={{ padding: "9px 12px" }}>{CAD(b.currentYearContrib)}</td>
                    <td style={{ padding: "9px 12px", color: "#0ea5e9" }}>{CAD(b.currentYearCesgRoom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div style={{ background: "var(--bg-card, #fff)", border: "2px dashed var(--border, #e5e7eb)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-light)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🎓</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No RESP plans yet</div>
          <div style={{ fontSize: "0.9rem", marginBottom: 20 }}>Open an RESP and start capturing CESG grants for your child's education.</div>
          <button onClick={openAddPlan} style={{ padding: "10px 24px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            + Add Your RESP
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {plans.map(plan => {
            const totalContrib = plan.contributions.reduce((s, c) => s + c.amount, 0);
            const totalCesg    = plan.contributions.reduce((s, c) => s + c.cesgReceived, 0);
            const isOpen       = expanded.has(plan._id);
            return (
              <div key={plan._id} style={{ background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "flex-start", padding: "16px 20px", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: "1rem" }}>{plan.accountName}</span>
                      <span style={{ fontSize: "0.72rem", background: plan.planType === "family" ? "#dbeafe" : "#f0fdf4", color: plan.planType === "family" ? "#1d4ed8" : "#166534", padding: "2px 8px", borderRadius: 12, fontWeight: 600 }}>
                        {plan.planType === "family" ? "Family" : "Individual"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-light)", marginBottom: 6 }}>{plan.institution}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {plan.beneficiaries.map(b => (
                        <span key={b._id ?? b.name} style={{ fontSize: "0.78rem", background: "var(--bg, #f9fafb)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 20, padding: "2px 10px" }}>
                          👶 {b.name} (b. {b.birthYear})
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#059669", fontSize: "1.05rem" }}>{CAD(plan.currentBalance)}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-light)" }}>{CAD(totalContrib)} contributed</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#d97706" }}>{CAD(totalCesg)}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-light)" }}>CESG received</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openAddContrib(plan)} style={{ padding: "6px 14px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: "0.83rem" }}>
                      + Contribute
                    </button>
                    <button onClick={() => openEditPlan(plan)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem" }}>✏️</button>
                    <button onClick={() => deletePlan(plan._id)} style={{ padding: "6px 10px", border: "1px solid #fca5a5", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem", color: "#ef4444" }}>🗑️</button>
                    <button onClick={() => toggleExpand(plan._id)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: "0.83rem" }}>
                      {isOpen ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", padding: "14px 20px" }}>
                    {plan.notes && <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-light)", fontStyle: "italic" }}>{plan.notes}</p>}
                    {plan.contributions.length === 0 ? (
                      <p style={{ color: "var(--text-light)", fontSize: "0.88rem", margin: 0 }}>No contributions recorded yet.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}>
                            {["Year", "Date", "Beneficiary", "Amount", "CESG", "Note", ""].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-light)", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...plan.contributions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(c => (
                            <tr key={c._id} style={{ borderBottom: "1px solid var(--border, #f3f4f6)" }}>
                              <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.year}</td>
                              <td style={{ padding: "7px 10px" }}>{new Date(c.date).toLocaleDateString("en-CA")}</td>
                              <td style={{ padding: "7px 10px" }}>{c.beneficiaryName}</td>
                              <td style={{ padding: "7px 10px", color: "#059669", fontWeight: 600 }}>{CAD(c.amount)}</td>
                              <td style={{ padding: "7px 10px", color: "#d97706", fontWeight: 600 }}>{c.cesgReceived > 0 ? CAD(c.cesgReceived) : "—"}</td>
                              <td style={{ padding: "7px 10px", color: "var(--text-light)" }}>{c.note || "—"}</td>
                              <td style={{ padding: "7px 10px" }}>
                                <button onClick={() => deleteContrib(plan._id, c._id)} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.8rem" }}>Remove</button>
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

      {/* Add/Edit Plan Modal */}
      {planModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "24px 16px", overflowY: "auto" }}>
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", marginTop: 24 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: "1.2rem" }}>{editingPlan ? "Edit RESP Plan" : "Add RESP Plan"}</h2>
            {planError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: "0.88rem" }}>{planError}</div>}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Plan Type</label>
              <select value={planForm.planType} onChange={e => setPlanForm(p => ({ ...p, planType: e.target.value as any }))}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem" }}>
                <option value="individual">Individual — one beneficiary</option>
                <option value="family">Family — multiple beneficiaries</option>
              </select>
            </div>

            {[
              { label: "Account Name", key: "accountName", placeholder: "e.g. RBC RESP" },
              { label: "Institution",  key: "institution",  placeholder: "e.g. RBC, TD, Wealthsimple" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>{f.label}</label>
                <input value={(planForm as any)[f.key]} onChange={e => setPlanForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Current Balance ($)</label>
              <input type="number" min={0} step="0.01" value={planForm.currentBalance} onChange={e => setPlanForm(p => ({ ...p, currentBalance: e.target.value }))} placeholder="0.00"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
            </div>

            {/* Beneficiaries */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Beneficiaries</label>
                {planForm.planType === "family" && (
                  <button type="button" onClick={() => setBeneficiaryForms(prev => [...prev, { name: "", birthYear: "", sin: "" }])}
                    style={{ fontSize: "0.8rem", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                    + Add
                  </button>
                )}
              </div>
              {beneficiaryForms.map((b, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <input value={b.name} onChange={e => setBeneficiaryForms(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Child's name"
                    style={{ padding: "8px 10px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 7, fontSize: "0.88rem" }} />
                  <input type="number" value={b.birthYear} onChange={e => setBeneficiaryForms(prev => prev.map((x, j) => j === i ? { ...x, birthYear: e.target.value } : x))}
                    placeholder="Birth year" min={1990} max={new Date().getFullYear()}
                    style={{ width: 90, padding: "8px 10px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 7, fontSize: "0.88rem" }} />
                  {beneficiaryForms.length > 1 && (
                    <button type="button" onClick={() => setBeneficiaryForms(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "1rem" }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Notes (optional)</label>
              <textarea value={planForm.notes} onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box", resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPlanModal(false)} style={{ padding: "10px 20px", border: "1px solid #FECACA", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={savePlan} disabled={planSaving} style={{ padding: "10px 22px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                {planSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contribution Modal */}
      {contribModal && contribTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>Record Contribution</h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--text-light)" }}>{contribTarget.accountName}</p>
            {contribError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: "0.88rem" }}>{contribError}</div>}

            <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.84rem", color: "#78350f" }}>
              CESG tip: contribute at least $2,500/year per beneficiary to maximize the $500 annual grant.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Beneficiary</label>
              <select value={contribForm.beneficiaryName} onChange={e => setContribForm(prev => ({ ...prev, beneficiaryName: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem" }}>
                <option value="">Select beneficiary…</option>
                {contribTarget.beneficiaries.map(b => <option key={b._id ?? b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Tax Year</label>
                <input type="number" min={2000} max={new Date().getFullYear()} value={contribForm.year}
                  onChange={e => setContribForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Amount ($)</label>
                <input type="number" min={0} step="0.01" value={contribForm.amount}
                  onChange={e => handleContribAmountChange(e.target.value)}
                  placeholder="0.00"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Date</label>
                <input type="date" value={contribForm.date} onChange={e => setContribForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>CESG Received ($)</label>
                <input type="number" min={0} step="0.01" value={contribForm.cesgReceived}
                  onChange={e => setContribForm(prev => ({ ...prev, cesgReceived: e.target.value }))}
                  placeholder="Auto-calculated"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
                <div style={{ fontSize: "0.72rem", color: "var(--text-light)", marginTop: 3 }}>Auto-filled — adjust to match your actual grant</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 5 }}>Note (optional)</label>
              <input value={contribForm.note} onChange={e => setContribForm(prev => ({ ...prev, note: e.target.value }))} placeholder="e.g. Annual lump-sum"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, fontSize: "0.9rem", boxSizing: "border-box" }} />
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
