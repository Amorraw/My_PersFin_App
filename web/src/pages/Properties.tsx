// Real estate tracker showing equity, unrealized gain, and mortgage linkage
import { useState, useEffect } from "react";
import { api } from "../api";
import "./Properties.css";
import { fmtCAD as fmt } from "../utils/formatters";

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

const PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];

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

// Renders property cards with equity, gain, and mortgage balance summary
export default function Properties() {
  const [properties, setProperties]     = useState<Property[]>([]);
  const [mortgageDebts, setMortgageDebts] = useState<Debt[]>([]);
  const [summary, setSummary]           = useState({ totalValue: 0, totalEquity: 0, totalMortgage: 0, totalGain: 0 });
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [formData, setFormData]         = useState({ ...emptyForm });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

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

  const typeLabel = (t: string) =>
    PROPERTY_TYPES.find((p) => p.value === t)?.label ?? t;

  if (loading) return <div style={{ padding: "10px", color: "var(--text-light)" }}>Loading properties…</div>;

  return (
    <div className="properties-container">
      {/* Header */}
      <div className="properties-header">
        <h1>Real Estate &amp; Properties</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Property</button>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        {[
          { label: "Total Property Value", value: fmt(summary.totalValue),    color: "var(--primary)" },
          { label: "Total Mortgage Owing", value: fmt(summary.totalMortgage), color: "var(--danger)"  },
          { label: "Total Equity",         value: fmt(summary.totalEquity),   color: "var(--success)" },
          { label: "Unrealized Gain",      value: fmt(summary.totalGain),     color: summary.totalGain >= 0 ? "var(--success)" : "var(--danger)" },
        ].map((card) => (
          <div key={card.label} className="summary-card">
            <div className="label">{card.label}</div>
            <div className="value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Property list */}
      {properties.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>No properties added yet.</p>
          <p>Add your home, rental, or cottage to include real estate in your net worth.</p>
          <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 8 }}>
            Add Your First Property
          </button>
        </div>
      ) : (
        <div className="properties-list">
          {properties.map((p) => (
            <div key={p._id} className="property-card">
              <div className="property-header">
                <div>
                  <div className="property-title">
                    <h3>{p.nickname}</h3>
                    <span className="property-type-badge">{typeLabel(p.type)}</span>
                    {p.isPrimaryResidence && (
                      <span className="cg-exempt-badge">CG exempt</span>
                    )}
                  </div>
                  <div className="property-address">
                    {[p.street, p.city, p.province, p.postalCode].filter(Boolean).join(", ")}
                  </div>
                </div>
                <div className="property-actions">
                  <button className="btn btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(p._id)}>Delete</button>
                </div>
              </div>

              <div className="property-details-grid">
                {[
                  { label: "Current Value",  value: fmt(p.currentEstimatedValue) },
                  { label: "Purchase Price", value: fmt(p.purchasePrice) },
                  { label: "Mortgage Owing", value: fmt(p.mortgageBalance) },
                  { label: "Equity",         value: fmt(p.equity) },
                  {
                    label: "Unrealized Gain",
                    value: `${p.unrealizedGain >= 0 ? "+" : ""}${fmt(p.unrealizedGain)} (${p.unrealizedGainPercent.toFixed(1)}%)`,
                    color: p.unrealizedGain >= 0 ? "var(--success)" : "var(--danger)",
                  },
                ].map((item) => (
                  <div key={item.label} className="property-detail-item">
                    <div className="label">{item.label}</div>
                    <div className="value" style={{ color: (item as any).color ?? "var(--text)" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {p.annualPropertyTax && (
                <div className="property-meta">
                  Annual property tax: {fmt(p.annualPropertyTax)} &nbsp;|&nbsp;
                  Monthly equivalent: {fmt(p.annualPropertyTax / 12)}
                </div>
              )}
              <div className="property-meta">
                Valuation last updated: {new Date(p.lastValuationDate).toLocaleDateString("en-CA")}
              </div>
              {p.notes && <div className="property-notes">{p.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{editingId ? "Edit Property" : "Add Property"}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">

                <div className="form-group span-2">
                  <label>Nickname / Label *</label>
                  <input
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    placeholder="e.g. Main Home, Kelowna Cottage"
                    required
                  />
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

                <div className="form-group span-2">
                  <label>Street Address</label>
                  <input
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    placeholder="123 Maple St"
                  />
                </div>

                <div className="form-group">
                  <label>City *</label>
                  <input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Vancouver"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Postal Code</label>
                  <input
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="V6B 1A1"
                  />
                </div>

                <div className="form-group">
                  <label>Purchase Price ($) *</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group span-2">
                  <label>Current Estimated Value ($) *</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.currentEstimatedValue}
                    onChange={(e) => setFormData({ ...formData, currentEstimatedValue: e.target.value })}
                    required
                  />
                  <small>Update this manually when you get a new estimate (e.g. from HouseSigma or a formal appraisal).</small>
                </div>

                <div className="form-group span-2">
                  <label>Linked Mortgage</label>
                  <select
                    value={formData.linkedMortgageDebtId}
                    onChange={(e) => setFormData({ ...formData, linkedMortgageDebtId: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {mortgageDebts.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name} (owing: ${d.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <small>Links your mortgage debt so equity is calculated automatically.</small>
                </div>

                <div className="form-group">
                  <label>Annual Property Tax ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.annualPropertyTax}
                    onChange={(e) => setFormData({ ...formData, annualPropertyTax: e.target.value })}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group span-2">
                  <label>Notes</label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes…"
                  />
                </div>
              </div>

              {formData.type === "primary-residence" && (
                <div className="primary-res-notice">
                  Primary residences are exempt from capital gains tax in Canada when sold.
                </div>
              )}

              {error && <div className="error-message">{error}</div>}

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Property"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
