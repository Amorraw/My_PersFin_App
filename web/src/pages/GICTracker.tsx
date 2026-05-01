import { useState, useEffect } from "react";
import { api } from "../api";
import "./GICTracker.css";

interface GIC {
  _id: string;
  issuer: string;
  accountType: string;
  principal: number;
  interestRate: number;
  term: number;
  purchaseDate: string;
  maturityDate: string;
  maturityValue: number;
  isCompound: boolean;
  compoundFrequency: string;
  isCashedOut: boolean;
  notes?: string;
}

interface Summary {
  totalPrincipal: number;
  totalMaturityValue: number;
  totalInterest: number;
  count: number;
  cdicWarnings: string[];
  upcomingMaturities: number;
}

interface LadderRung {
  term: number;
  principal: number;
  rate: number;
  maturityValue: number;
  interest: number;
  maturityYear: number;
}

const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

const ACCOUNT_TYPES = ["TFSA", "RRSP", "FHSA", "RRIF", "non-registered", "RDSP"];
const FREQ_OPTIONS = ["annually", "semi-annually", "quarterly", "monthly"];

const blank = {
  issuer: "",
  accountType: "TFSA",
  principal: "",
  interestRate: "",
  term: "12",
  purchaseDate: new Date().toISOString().slice(0, 10),
  isCompound: false,
  compoundFrequency: "annually",
  notes: "",
};

export default function GICTracker() {
  const [tab, setTab] = useState<"list" | "ladder" | "cdic">("list");
  const [gics, setGics] = useState<GIC[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GIC | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Ladder calculator state
  const [ladderAmount, setLadderAmount] = useState(50000);
  const [ladderYears, setLadderYears] = useState(5);
  const [ladderRates, setLadderRates] = useState<Record<number, string>>({
    1: "4.25", 2: "4.50", 3: "4.70", 4: "4.80", 5: "4.90",
  });
  const [ladder, setLadder] = useState<{ rungs: LadderRung[]; totalInterest: number; blendedRate: number; amountPerRung: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([api("/gic"), api("/gic/summary")]);
      setGics(g.gics);
      setSummary(s);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(blank); setError(""); setShowModal(true); };
  const openEdit = (g: GIC) => {
    setEditing(g);
    setForm({
      issuer: g.issuer,
      accountType: g.accountType,
      principal: String(g.principal),
      interestRate: String(g.interestRate),
      term: String(g.term),
      purchaseDate: g.purchaseDate.slice(0, 10),
      isCompound: g.isCompound,
      compoundFrequency: g.compoundFrequency,
      notes: g.notes || "",
    });
    setError("");
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        principal: Number(form.principal),
        interestRate: Number(form.interestRate),
        term: Number(form.term),
      };
      if (editing) {
        await api(`/gic/${editing._id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/gic", { method: "POST", body: JSON.stringify(body) });
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deletGIC = async (id: string) => {
    if (!confirm("Delete this GIC?")) return;
    await api(`/gic/${id}`, { method: "DELETE" });
    load();
  };

  const calcLadder = async () => {
    const ratesByTerm: Record<number, number> = {};
    for (let i = 1; i <= ladderYears; i++) {
      ratesByTerm[i] = Number(ladderRates[i] || 4.25);
    }
    const data = await api("/gic/ladder", {
      method: "POST",
      body: JSON.stringify({ totalAmount: ladderAmount, ladderYears, ratesByTerm }),
    });
    setLadder(data);
  };

  const maturityStatus = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const daysLeft = Math.round((d.getTime() - now.getTime()) / (86400 * 1000));
    if (daysLeft < 0) return { label: "Matured", color: "var(--text-secondary)" };
    if (daysLeft <= 30) return { label: `Matures in ${daysLeft}d`, color: "var(--danger)" };
    if (daysLeft <= 90) return { label: `Matures in ${daysLeft}d`, color: "#d97706" };
    return { label: fmtDate(dateStr), color: "inherit" };
  };

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: "0.3rem 0.75rem",
    border: "none",
    borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
    background: "none",
    cursor: "pointer",
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? "var(--primary)" : "var(--text-secondary)",
    fontSize: "0.78rem",
  });

  return (
    <div style={{ padding: "10px", maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>GIC Tracker</h1>
          <p style={{ margin: "0.1rem 0 0", color: "var(--text-secondary)", fontSize: "0.72rem" }}>
            Track your Guaranteed Investment Certificates, check CDIC coverage, and plan a laddered strategy.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add GIC</button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "10px" }}>
          {[
            { label: "Total Invested", value: fmt(summary.totalPrincipal), color: "var(--primary)" },
            { label: "Total at Maturity", value: fmt(summary.totalMaturityValue), color: "var(--primary)" },
            { label: "Total Interest", value: fmt(summary.totalInterest), color: "var(--success)" },
            { label: "Active GICs", value: String(summary.count), color: "inherit" },
            { label: "Maturing in 90 Days", value: String(summary.upcomingMaturities), color: summary.upcomingMaturities > 0 ? "#d97706" : "inherit" },
          ].map((c) => (
            <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.65rem" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>{c.label}</div>
              <div style={{ fontSize: "0.92rem", fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* CDIC warnings */}
      {summary && summary.cdicWarnings.length > 0 && (
        <div style={{ background: "#fef2f2", border: "2px solid var(--danger)", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px" }}>
          <strong style={{ color: "var(--danger)", fontSize: "0.75rem" }}>⚠️ CDIC Coverage Exceeded</strong>
          {summary.cdicWarnings.map((w, i) => (
            <p key={i} style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "var(--danger)" }}>{w}</p>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--border)", marginBottom: "10px", display: "flex" }}>
        <button style={tabStyle("list")} onClick={() => setTab("list")}>My GICs</button>
        <button style={tabStyle("ladder")} onClick={() => setTab("ladder")}>Ladder Calculator</button>
        <button style={tabStyle("cdic")} onClick={() => setTab("cdic")}>CDIC Guide</button>
      </div>

      {/* ── My GICs ── */}
      {tab === "list" && (
        loading ? <p>Loading…</p> : gics.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-secondary)" }}>
            <p style={{ fontSize: "0.82rem" }}>No GICs tracked yet.</p>
            <button className="btn btn-primary" onClick={openAdd}>Add Your First GIC</button>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  {["Issuer", "Account", "Principal", "Rate", "Term", "Matures", "At Maturity", ""].map((h) => (
                    <th key={h} style={{ padding: "5px 8px", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gics.map((g, i) => {
                  const status = maturityStatus(g.maturityDate);
                  return (
                    <tr key={g._id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{g.issuer}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontSize: "0.68rem" }}>
                          {g.accountType}
                        </span>
                      </td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{fmt(g.principal)}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{g.interestRate}%</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{g.term}mo</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", color: status.color, fontWeight: status.color !== "inherit" ? 600 : 400 }}>
                        {status.label}
                      </td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", color: "var(--success)", fontWeight: 600 }}>{fmt(g.maturityValue)}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>
                        <button onClick={() => openEdit(g)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", marginRight: "0.5rem", fontSize: "0.72rem" }}>Edit</button>
                        <button onClick={() => deletGIC(g._id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.72rem" }}>Del</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Ladder Calculator ── */}
      {tab === "ladder" && (
        <div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem", marginBottom: "10px" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Laddered GIC Strategy Calculator</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginBottom: "8px" }}>
              A GIC ladder splits your total investment equally across multiple terms (e.g., 1–5 year).
              Each year, one rung matures — giving you liquidity while still earning higher long-term rates.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", marginBottom: "8px" }}>
              <div className="form-group">
                <label>Total Amount ($)</label>
                <input type="number" min={1000} value={ladderAmount} onChange={(e) => setLadderAmount(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Ladder Length (Years)</label>
                <select value={ladderYears} onChange={(e) => setLadderYears(Number(e.target.value))}>
                  {[2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} years</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px", marginBottom: "8px" }}>
              {Array.from({ length: ladderYears }, (_, i) => i + 1).map((term) => (
                <div key={term} className="form-group">
                  <label>{term}-Year Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={ladderRates[term] || ""}
                    onChange={(e) => setLadderRates((p) => ({ ...p, [term]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={calcLadder}>Calculate Ladder</button>
          </div>

          {ladder && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", gap: "1.5rem" }}>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Amount per Rung</span><br /><strong style={{ fontSize: "0.82rem" }}>{fmt(ladder.amountPerRung)}</strong></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Total Interest</span><br /><strong style={{ color: "var(--success)", fontSize: "0.82rem" }}>{fmt(ladder.totalInterest)}</strong></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Blended Rate</span><br /><strong style={{ fontSize: "0.82rem" }}>{ladder.blendedRate.toFixed(2)}%</strong></div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr style={{ background: "var(--background)" }}>
                    {["Rung", "Term", "Principal", "Rate", "Interest Earned", "Matures", "At Maturity"].map((h) => (
                      <th key={h} style={{ padding: "5px 8px", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ladder.rungs.map((r, i) => (
                    <tr key={r.term} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>#{i + 1}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{r.term} year{r.term > 1 ? "s" : ""}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{fmt(r.principal)}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{r.rate}%</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", color: "var(--success)" }}>{fmt(r.interest)}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{r.maturityYear}</td>
                      <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{fmt(r.maturityValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CDIC Guide ── */}
      {tab === "cdic" && (
        <div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem", marginBottom: "8px" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>CDIC Coverage — How It Works</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem", lineHeight: 1.5 }}>
              The <strong>Canada Deposit Insurance Corporation (CDIC)</strong> protects eligible deposits at member institutions
              up to <strong>$100,000 per depositor per category</strong>. GICs with terms up to 5 years are eligible.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "6px", marginTop: "6px" }}>
              {[
                { cat: "Deposits (non-registered)", limit: "$100,000" },
                { cat: "RRSP deposits", limit: "$100,000" },
                { cat: "TFSA deposits", limit: "$100,000" },
                { cat: "RRIF deposits", limit: "$100,000" },
                { cat: "FHSA deposits", limit: "$100,000" },
                { cat: "Joint deposits", limit: "$100,000" },
                { cat: "Deposits held in trust", limit: "$100,000" },
                { cat: "Registered pension plan deposits", limit: "$100,000" },
              ].map((c) => (
                <div key={c.cat} style={{ background: "var(--background)", borderRadius: 6, padding: "0.4rem 0.6rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.72rem" }}>{c.cat}</div>
                  <div style={{ color: "var(--success)", fontWeight: 700, fontSize: "0.82rem" }}>{c.limit}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 6, padding: "0.5rem 0.65rem", marginBottom: "8px", fontSize: "0.72rem" }}>
            <strong>Key rules:</strong>
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1rem", lineHeight: 1.6 }}>
              <li>Protection is <strong>per institution</strong> — splitting deposits across multiple CDIC member banks multiplies your coverage.</li>
              <li>Credit unions are <strong>not CDIC members</strong> — they are covered by provincial deposit protection (often unlimited, e.g., BC&apos;s CUDIC).</li>
              <li>GICs with terms <strong>over 5 years</strong> are not eligible for CDIC coverage.</li>
              <li>Foreign-currency deposits are <strong>not covered</strong> by CDIC.</li>
              <li>Coverage is automatic — no registration required.</li>
            </ul>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
            <h4 style={{ marginTop: 0, fontSize: "0.7rem" }}>Strategy: Maximize Coverage</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem", lineHeight: 1.5 }}>
              A single person with TFSA, RRSP, FHSA, and non-registered GICs at the same bank has
              <strong> $400,000 in coverage</strong> at that institution. With a spouse (joint account), that adds another $100,000.
              By spreading GICs across two or more CDIC member institutions, coverage doubles again.
            </p>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--surface)", borderRadius: 8, padding: "1rem", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginTop: 0, fontSize: "0.82rem" }}>{editing ? "Edit GIC" : "Add GIC"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div className="form-group" style={{ gridColumn: "1/-1" }}>
                <label>Issuer / Institution</label>
                <input value={form.issuer} onChange={(e) => setForm((p: any) => ({ ...p, issuer: e.target.value }))} placeholder="e.g. TD Bank, EQ Bank" />
              </div>
              <div className="form-group">
                <label>Account Type</label>
                <select value={form.accountType} onChange={(e) => setForm((p: any) => ({ ...p, accountType: e.target.value }))}>
                  {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Principal ($)</label>
                <input type="number" min={0} value={form.principal} onChange={(e) => setForm((p: any) => ({ ...p, principal: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Annual Interest Rate (%)</label>
                <input type="number" min={0} step="0.01" value={form.interestRate} onChange={(e) => setForm((p: any) => ({ ...p, interestRate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Term (months)</label>
                <input type="number" min={1} value={form.term} onChange={(e) => setForm((p: any) => ({ ...p, term: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Purchase Date</label>
                <input type="date" value={form.purchaseDate} onChange={(e) => setForm((p: any) => ({ ...p, purchaseDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input type="checkbox" checked={form.isCompound} onChange={(e) => setForm((p: any) => ({ ...p, isCompound: e.target.checked }))} />
                  Compound Interest
                </label>
              </div>
              {form.isCompound && (
                <div className="form-group">
                  <label>Compounding Frequency</label>
                  <select value={form.compoundFrequency} onChange={(e) => setForm((p: any) => ({ ...p, compoundFrequency: e.target.value }))}>
                    {FREQ_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ gridColumn: "1/-1" }}>
                <label>Notes (optional)</label>
                <input value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            {error && <p style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.72rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
