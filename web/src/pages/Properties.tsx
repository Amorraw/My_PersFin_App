import { useState, useEffect } from "react";
import { api } from "../api";
import "./Properties.css";

interface Property {
  _id: string;
  nickname: string;
  type: string;
  street?: string;
  city: string;
  province: string;
  postalCode?: string;
  purchasePrice: number;
  purchaseDate: string;
  currentEstimatedValue: number;
  lastValuationDate: string;
  linkedMortgageDebtId?: string;
  annualPropertyTax?: number;
  notes?: string;
  mortgageBalance: number;
  equity: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  isPrimaryResidence: boolean;
}

interface Debt {
  _id: string;
  name: string;
  type: string;
  currentBalance: number;
}

const PROPERTY_TYPES = [
  { value: "primary-residence", label: "Primary Residence" },
  { value: "rental",            label: "Rental Property" },
  { value: "vacation",          label: "Vacation / Cottage" },
  { value: "commercial",        label: "Commercial" },
  { value: "land",              label: "Land" },
  { value: "other",             label: "Other" },
];

const PROVINCES = [
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
];

const emptyForm = {
  nickname: "",
  type: "primary-residence",
  street: "",
  city: "",
  province: "ON",
  postalCode: "",
  purchasePrice: "",
  purchaseDate: "",
  currentEstimatedValue: "",
  linkedMortgageDebtId: "",
  annualPropertyTax: "",
  notes: "",
};

export default function Properties() {
  const [properties, setProperties]   = useState<Property[]>([]);
  const [mortgageDebts, setMortgageDebts] = useState<Debt[]>([]);
  const [summary, setSummary]         = useState({ totalValue: 0, totalEquity: 0, totalMortgage: 0, totalGain: 0 });
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [formData, setFormData]       = useState({ ...emptyForm });
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [propData, debtData] = await Promise.all([
        api("/properties/summary"),
        api("/debts"),
      ]);
      setProperties(propData.properties ?? []);
      setSummary({
        totalValue:    propData.totalValue    ?? 0,
        totalEquity:   propData.totalEquity   ?? 0,
        totalMortgage: propData.totalMortgage ?? 0,
        totalGain:     propData.totalGain     ?? 0,
      });
      setMortgageDebts((debtData.debts ?? []).filter((d: Debt) => d.type === "mortgage"));
    } catch (err) {
      console.error("Failed to load properties:", err);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setFormData({ ...emptyForm });
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (p: Property) => {
    setFormData({
      nickname:              p.nickname,
      type:                  p.type,
      street:                p.street ?? "",
      city:                  p.city,
      province:              p.province,
      postalCode:            p.postalCode ?? "",
      purchasePrice:         String(p.purchasePrice),
      purchaseDate:          p.purchaseDate.slice(0, 10),
      currentEstimatedValue: String(p.currentEstimatedValue),
      linkedMortgageDebtId:  p.linkedMortgageDebtId ?? "",
      annualPropertyTax:     p.annualPropertyTax != null ? String(p.annualPropertyTax) : "",
      notes:                 p.notes ?? "",
    });
    setEditingId(p._id);
    setError("");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this property? This cannot be undone.")) return;
    await api(`/properties/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        ...formData,
        purchasePrice:         Number(formData.purchasePrice),
        currentEstimatedValue: Number(formData.currentEstimatedValue),
        annualPropertyTax:     formData.annualPropertyTax ? Number(formData.annualPropertyTax) : undefined,
        linkedMortgageDebtId:  formData.linkedMortgageDebtId || undefined,
      };

      if (editingId) {
        await api(`/properties/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/properties", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      fetchAll();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save property.");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  const typeLabel = (t: string) =>
    PROPERTY_TYPES.find((p) => p.value === t)?.label ?? t;

  if (loading) return <div style={{ padding: "10px" }}>Loading properties…</div>;

  return (
    <div style={{ padding: "10px", maxWidth: 1050 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h1>Real Estate &amp; Properties</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Property</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", marginBottom: "10px" }}>
        {[
          { label: "Total Property Value", value: fmt(summary.totalValue),    color: "var(--primary)" },
          { label: "Total Mortgage Owing", value: fmt(summary.totalMortgage), color: "var(--danger)" },
          { label: "Total Equity",         value: fmt(summary.totalEquity),   color: "var(--success)" },
          { label: "Unrealized Gain",      value: fmt(summary.totalGain),     color: summary.totalGain >= 0 ? "var(--success)" : "var(--danger)" },
        ].map((card) => (
          <div key={card.label} className="summary-card" style={{ padding: "0.5rem 0.65rem" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>{card.label}</div>
            <div style={{ fontSize: "0.92rem", fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Property list */}
      {properties.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-secondary)", border: "2px dashed var(--border)", borderRadius: 8 }}>
          <p style={{ fontSize: "0.82rem" }}>No properties added yet.</p>
          <p>Add your home, rental, or cottage to include real estate in your net worth.</p>
          <button className="btn btn-primary" onClick={openAdd}>Add Your First Property</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {properties.map((p) => (
            <div key={p._id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
                    <h3 style={{ margin: 0 }}>{p.nickname}</h3>
                    <span style={{ fontSize: "0.75rem", background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: 12 }}>
                      {typeLabel(p.type)}
                    </span>
                    {p.isPrimaryResidence && (
                      <span style={{ fontSize: "0.75rem", background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 12 }}>
                        CG exempt
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>
                    {[p.street, p.city, p.province, p.postalCode].filter(Boolean).join(", ")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(p._id)}>Delete</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "6px", marginTop: "6px" }}>
                {[
                  { label: "Current Value",    value: fmt(p.currentEstimatedValue) },
                  { label: "Purchase Price",   value: fmt(p.purchasePrice) },
                  { label: "Mortgage Owing",   value: fmt(p.mortgageBalance) },
                  { label: "Equity",           value: fmt(p.equity) },
                  {
                    label: "Unrealized Gain",
                    value: `${p.unrealizedGain >= 0 ? "+" : ""}${fmt(p.unrealizedGain)} (${p.unrealizedGainPercent.toFixed(1)}%)`,
                    color: p.unrealizedGain >= 0 ? "var(--success)" : "var(--danger)",
                  },
                ].map((item) => (
                  <div key={item.label} style={{ background: "var(--background)", borderRadius: 6, padding: "0.4rem 0.5rem" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{item.label}</div>
                    <div style={{ fontWeight: 600, color: (item as any).color ?? "inherit" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {p.annualPropertyTax && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  Annual property tax: {fmt(p.annualPropertyTax)} &nbsp;|&nbsp;
                  Monthly equivalent: {fmt(p.annualPropertyTax / 12)}
                </div>
              )}
              <div style={{ marginTop: "0.3rem", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                Valuation last updated: {new Date(p.lastValuationDate).toLocaleDateString("en-CA")}
              </div>
              {p.notes && (
                <div style={{ marginTop: "0.3rem", fontSize: "0.72rem", fontStyle: "italic", color: "var(--text-secondary)" }}>
                  {p.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: 8, padding: "1rem", width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginTop: 0, fontSize: "0.82rem" }}>{editingId ? "Edit Property" : "Add Property"}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Nickname / Label *</label>
                  <input value={formData.nickname} onChange={(e) => setFormData({ ...formData, nickname: e.target.value })} placeholder="e.g. Main Home, Kelowna Cottage" required />
                </div>

                <div className="form-group">
                  <label>Property Type *</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                    {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Province *</label>
                  <select value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })}>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Street Address</label>
                  <input value={formData.street} onChange={(e) => setFormData({ ...formData, street: e.target.value })} placeholder="123 Maple St" />
                </div>

                <div className="form-group">
                  <label>City *</label>
                  <input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Vancouver" required />
                </div>

                <div className="form-group">
                  <label>Postal Code</label>
                  <input value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} placeholder="V6B 1A1" />
                </div>

                <div className="form-group">
                  <label>Purchase Price ($) *</label>
                  <input type="number" min="0" value={formData.purchasePrice} onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })} required />
                </div>

                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input type="date" value={formData.purchaseDate} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} required />
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Current Estimated Value ($) *</label>
                  <input type="number" min="0" value={formData.currentEstimatedValue} onChange={(e) => setFormData({ ...formData, currentEstimatedValue: e.target.value })} required />
                  <small style={{ color: "var(--text-secondary)" }}>Update this manually when you get a new estimate (e.g. from HouseSigma or a formal appraisal).</small>
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Linked Mortgage</label>
                  <select value={formData.linkedMortgageDebtId} onChange={(e) => setFormData({ ...formData, linkedMortgageDebtId: e.target.value })}>
                    <option value="">— None —</option>
                    {mortgageDebts.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name} (owing: ${d.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <small style={{ color: "var(--text-secondary)" }}>Links your mortgage debt so equity is calculated automatically.</small>
                </div>

                <div className="form-group">
                  <label>Annual Property Tax ($)</label>
                  <input type="number" min="0" value={formData.annualPropertyTax} onChange={(e) => setFormData({ ...formData, annualPropertyTax: e.target.value })} placeholder="Optional" />
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>Notes</label>
                  <textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes…" style={{ resize: "vertical" }} />
                </div>
              </div>

              {formData.type === "primary-residence" && (
                <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6, padding: "0.5rem 0.6rem", marginTop: "0.35rem", fontSize: "0.72rem", color: "#166534" }}>
                  Primary residences are exempt from capital gains tax in Canada when sold.
                </div>
              )}

              {error && <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>{error}</p>}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Property"}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
