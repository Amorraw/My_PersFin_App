import { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";

const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

export default function Settings() {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [province, setProvince]   = useState(user?.province  ?? "ON");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName   ?? "");
      setProvince(user.province   ?? "ON");
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile({ firstName, lastName, province });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 600 }}>
      <h1>Profile &amp; Settings</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Your province of residence is used to calculate accurate federal + provincial
        combined marginal tax rates across all tax tools.
      </p>

      <form onSubmit={handleSave}>
        <section style={{ marginBottom: "2rem" }}>
          <h3>Personal Information</h3>
          <div className="form-group" style={{ marginBottom: "1rem" }}>
            <label>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="form-group" style={{ marginBottom: "1rem" }}>
            <label>Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
          <div className="form-group" style={{ marginBottom: "1rem" }}>
            <label>Email</label>
            <input type="email" value={user?.email ?? ""} disabled style={{ opacity: 0.6 }} />
          </div>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h3>Tax Settings</h3>
          <div className="form-group" style={{ marginBottom: "1rem" }}>
            <label>Province / Territory of Residence</label>
            <select value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <small style={{ color: "var(--text-secondary)" }}>
              Used to calculate your combined federal + provincial marginal tax rate in all tax tools.
            </small>
          </div>
        </section>

        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        {saved && <p style={{ color: "var(--success)" }}>Profile saved successfully.</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
