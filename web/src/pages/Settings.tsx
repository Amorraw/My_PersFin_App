// User profile settings — province selection drives all combined tax-rate calculations
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import './Settings.css';

const YEAR_OPTIONS = [1, 3, 5, 7] as const;

function isDemoUser(email: string | undefined): boolean {
  return !!email && /^user_test\d+@demo\.com$/.test(email);
}

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

// Renders name and province fields; province persists to auth context
export default function Settings() {
  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName]   = useState(user?.lastName  ?? "");
  const [province, setProvince]   = useState(user?.province  ?? "ON");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");

  const [demoYears, setDemoYears] = useState<typeof YEAR_OPTIONS[number]>(3);
  const [demoBusy, setDemoBusy]   = useState<"regenerate" | "reset" | "clear" | null>(null);
  const [demoMsg, setDemoMsg]     = useState<string | null>(null);

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

  const handleDemoAction = async (action: "regenerate" | "reset" | "clear") => {
    const confirmMsg =
      action === "regenerate"
        ? `Regenerate a fresh ${demoYears}-year dataset for your current demo profile? This replaces your current data.`
        : action === "reset"
        ? "Restore data to your last Regenerated state? This undoes any edits since then."
        : "Clear ALL data? This cannot be undone.";
    if (!window.confirm(confirmMsg)) return;

    setDemoBusy(action);
    setDemoMsg(null);
    try {
      const body = action === "regenerate" ? { years: demoYears } : {};
      const data = await api(`/demo/${action}`, { method: "POST", body: JSON.stringify(body) });
      setDemoMsg(data.message ?? "Done.");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setDemoMsg(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setDemoBusy(null);
    }
  };

  return (
    <div className="settings-container">
      <h1>Profile &amp; Settings</h1>
      <p className="settings-intro">
        Your province of residence is used to calculate accurate federal + provincial
        combined marginal tax rates across all tax tools.
      </p>

      <form onSubmit={handleSave}>
        <section className="settings-section">
          <h3>Personal Information</h3>
          <div className="form-group">
            <label>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={user?.email ?? ""} disabled style={{ opacity: 0.6 }} />
          </div>
        </section>

        <section className="settings-section">
          <h3>Tax Settings</h3>
          <div className="form-group">
            <label>Province / Territory of Residence</label>
            <select value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <small className="form-hint">
              Used to calculate your combined federal + provincial marginal tax rate in all tax tools.
            </small>
          </div>
        </section>

        {error && <p className="error-msg">{error}</p>}
        {saved && <p className="success-msg">Profile saved successfully.</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>

      {isDemoUser(user?.email) && (
        <section className="settings-section">
          <h3>Demo Data</h3>
          <p className="settings-intro" style={{ marginTop: 0 }}>
            Active profile: <strong>{user?.firstName} {user?.lastName}</strong> ({user?.email}).
            Manage the seeded data for this demo account, or load a different profile from{" "}
            <Link to="/demo-profiles">Demo Profiles</Link>.
          </p>
          <div className="form-group">
            <label>Years of history (used by Regenerate)</label>
            <select
              value={demoYears}
              onChange={(e) => setDemoYears(Number(e.target.value) as typeof YEAR_OPTIONS[number])}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y} year{y === 1 ? "" : "s"}</option>
              ))}
            </select>
            <small className="form-hint">
              Regenerate wipes your current data and creates a fresh, differently-randomized dataset for this many years.
            </small>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={!!demoBusy} onClick={() => handleDemoAction("regenerate")}>
              {demoBusy === "regenerate" ? "Regenerating…" : "Regenerate Data"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={!!demoBusy} onClick={() => handleDemoAction("reset")}>
              {demoBusy === "reset" ? "Resetting…" : "Reset to Last Snapshot"}
            </button>
            <button type="button" className="btn btn-danger" disabled={!!demoBusy} onClick={() => handleDemoAction("clear")}>
              {demoBusy === "clear" ? "Clearing…" : "Clear All Data"}
            </button>
          </div>
          {demoMsg && <p className="success-msg">{demoMsg}</p>}
        </section>
      )}
    </div>
  );
}
