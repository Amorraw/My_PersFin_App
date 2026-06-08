import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import './DemoProfiles.css';

interface Profile {
  email: string;
  firstName: string;
  lastName: string;
  province: string;
  emoji: string;
  title: string;
  summary: string;
  income: string;
  netWorth: string;
  netWorthColor: string;
  highlights: string[];
}

const PROFILES: Profile[] = [
  {
    email: "user_test1@demo.com",
    firstName: "Taylor", lastName: "Morrison", province: "ON",
    emoji: "😰", title: "The Overwhelmed Graduate",
    summary: "Recent grad in Toronto, paycheque to paycheque — maxed credit cards, heavy student debt, zero savings.",
    income: "$38,500 / yr", netWorth: "−$41,680", netWorthColor: "#dc2626",
    highlights: ["2 credit cards maxed", "Student loan: $29,800", "LOC: $8,500", "No TFSA / RRSP"],
  },
  {
    email: "user_test2@demo.com",
    firstName: "Marcus", lastName: "Williams", province: "ON",
    emoji: "💳", title: "The Over-Leveraged",
    summary: "Mississauga family man drowning in consumer debt — two maxed cards, car loan, spending more than he earns.",
    income: "$57,000 / yr", netWorth: "−$14,900", netWorthColor: "#dc2626",
    highlights: ["BMO MC: $8,900 owed", "Scotia Visa: $6,200 owed", "Auto loan: $21,500", "Negative savings rate"],
  },
  {
    email: "user_test3@demo.com",
    firstName: "Jennifer", lastName: "Nguyen", province: "BC",
    emoji: "👩‍👧", title: "The Single Parent",
    summary: "Vancouver single mom managing a $492K CMHC mortgage and daycare costs — barely saving, but building.",
    income: "$68,000 / yr", netWorth: "+$46,700", netWorthColor: "#d97706",
    highlights: ["Mortgage: $492K", "TFSA: $19,500", "RESP: $11,200", "Tight monthly cash flow"],
  },
  {
    email: "user_test4@demo.com",
    firstName: "Ethan", lastName: "Park", province: "ON",
    emoji: "📈", title: "The Young Professional",
    summary: "Ottawa software dev with discipline — maxing TFSA, building RRSP, one car loan, on track to wealth.",
    income: "$87,000 / yr", netWorth: "+$71,600", netWorthColor: "#059669",
    highlights: ["TFSA: $32,000", "RRSP: $18,500", "Auto loan: $14,200", "Saving $1,200/mo"],
  },
  {
    email: "user_test5@demo.com",
    firstName: "Ana", lastName: "Garcia", province: "AB",
    emoji: "🏠", title: "The Average Canadian",
    summary: "Calgary family with a mortgage, RRSP, small credit card balance — the textbook middle-class financial picture.",
    income: "$78,000 / yr", netWorth: "+$104,300", netWorthColor: "#059669",
    highlights: ["Mortgage: $315K", "RRSP: $62K", "TFSA: $28.5K", "CC balance: $1,800"],
  },
  {
    email: "user_test6@demo.com",
    firstName: "Michael", lastName: "Chen", province: "ON",
    emoji: "✅", title: "The Comfortable Professional",
    summary: "Toronto finance exec — no consumer debt, growing RRSP & TFSA, mortgage well under control.",
    income: "$112,000 / yr", netWorth: "+$270,500", netWorthColor: "#059669",
    highlights: ["RRSP: $145K", "TFSA: $68.5K", "Savings: $42K", "No credit card debt"],
  },
  {
    email: "user_test7@demo.com",
    firstName: "Sophie", lastName: "Beaumont", province: "QC",
    emoji: "💪", title: "The Power Saver (DINK)",
    summary: "Montreal high-earner saving aggressively — TFSA almost maxed, RRSP growing, investing beyond registered accounts.",
    income: "$135,000 / yr", netWorth: "+$302,000", netWorthColor: "#059669",
    highlights: ["TFSA: $82K (near max)", "RRSP: $95K", "Non-reg invest: $45K", "Saving $5K/mo"],
  },
  {
    email: "user_test8@demo.com",
    firstName: "Robert", lastName: "Tremblay", province: "ON",
    emoji: "🏢", title: "The Business Owner",
    summary: "Hamilton self-employed consultant — business account, variable income, large RRSP, commercial mortgage.",
    income: "$125,000+ / yr", netWorth: "+$523,000", netWorthColor: "#059669",
    highlights: ["RRSP: $285K", "TFSA: $88K", "Invest: $125K", "Business mortgage: $380K"],
  },
  {
    email: "user_test9@demo.com",
    firstName: "Linda", lastName: "MacPherson", province: "NS",
    emoji: "🌅", title: "The Pre-Retiree",
    summary: "Halifax healthcare director at 57 — enormous RRSP, mortgage nearly paid off, counting down to retirement.",
    income: "$118,000 / yr", netWorth: "+$921,000", netWorthColor: "#059669",
    highlights: ["RRSP: $648K", "TFSA: $95K", "Invest: $185K", "Mortgage: $42K remaining"],
  },
  {
    email: "user_test10@demo.com",
    firstName: "Christine", lastName: "Vandenberg", province: "ON",
    emoji: "💎", title: "The High Net Worth Executive",
    summary: "Toronto SVP with multi-million dollar portfolio, fine dining, premium spending — near mortgage payoff.",
    income: "$275,000 / yr", netWorth: "+$1,485,000", netWorthColor: "#059669",
    highlights: ["RRSP: $820K", "TFSA: $95K", "Non-reg: $580K", "Mortgage: $95K remaining"],
  },
];

const DEMO_EMAIL = "user_test@demo.com";
const PASSWORD = "Demo1234!";

export default function DemoProfiles() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [historyYears, setHistoryYears] = useState(5);

  const copyCredentials = () => {
    navigator.clipboard.writeText(`Email: ${DEMO_EMAIL}\nPassword: ${PASSWORD}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (profileIndex: number) => {
    const p = PROFILES[profileIndex - 1];
    if (!confirm(`Load "${p.title}" with ${historyYears} years of seasonal history? Your current data will be replaced.`)) return;
    setLoading(profileIndex);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/demo/activate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIndex, years: historyYears }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ ok: true, text: data.message });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setStatusMsg({ ok: false, text: data.message || "Failed." });
      }
    } catch {
      setStatusMsg({ ok: false, text: "Request failed — is the server running?" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 8px" }}>
          Demo Financial Profiles
        </h1>
        <p style={{ color: "var(--text-light, #6b7280)", fontSize: "0.9rem", maxWidth: 620, margin: "0 auto" }}>
          10 pre-seeded Canadian households — from a debt-laden graduate to a high-net-worth executive.
          Choose how many years of realistic, seasonally-varying history to generate, then load any profile.
        </p>
        {/* Single credential box */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 16, marginTop: 16, flexWrap: "wrap", justifyContent: "center",
          background: "#1e293b", border: "1px solid #334155",
          borderRadius: 10, padding: "12px 24px", fontSize: "0.85rem", color: "#e2e8f0",
        }}>
          <span>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem", display: "block", marginBottom: 2 }}>EMAIL</span>
            <strong style={{ fontFamily: "monospace", color: "#7dd3fc" }}>{DEMO_EMAIL}</strong>
          </span>
          <span style={{ color: "#475569" }}>·</span>
          <span>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem", display: "block", marginBottom: 2 }}>PASSWORD</span>
            <strong style={{ fontFamily: "monospace", color: "#86efac" }}>{PASSWORD}</strong>
          </span>
          <button
            onClick={copyCredentials}
            style={{
              padding: "5px 14px", borderRadius: 6, border: "1px solid #475569",
              background: "transparent", color: copied ? "#86efac" : "#94a3b8",
              cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
            }}
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
        {/* History length selector */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10, marginTop: 20,
          background: "var(--bg-card, #fff)", border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 10, padding: "10px 20px", flexWrap: "wrap", justifyContent: "center",
        }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-light, #6b7280)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            History Length
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {[3, 4, 5, 6, 7].map(y => (
              <button
                key={y}
                onClick={() => setHistoryYears(y)}
                style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600,
                  border: `1px solid ${historyYears === y ? "#4f46e5" : "var(--border, #e5e7eb)"}`,
                  background: historyYears === y ? "#4f46e5" : "transparent",
                  color: historyYears === y ? "#fff" : "var(--text, #111)",
                  cursor: "pointer",
                }}
              >
                {y} yr{y > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-light, #6b7280)" }}>
            → {historyYears * 12} months of seasonal data for ML Insights
          </span>
        </div>

        {user && (
          <p style={{ color: "var(--text-light, #6b7280)", fontSize: "0.8rem", marginTop: 12, marginBottom: 0 }}>
            Click <strong>Load this Profile</strong> on any card below. The selected years applies to all profiles.
            Use the <strong>DEMO MODE</strong> bar in the header to Regenerate or Reset.
          </p>
        )}
      </div>

      {statusMsg && (
        <div style={{
          background: statusMsg.ok ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${statusMsg.ok ? "#86efac" : "#fca5a5"}`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.82rem",
          color: statusMsg.ok ? "#166534" : "#991b1b",
        }}>
          {statusMsg.ok ? "✓" : "✕"} {statusMsg.text}
        </div>
      )}

      {/* Profile grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {PROFILES.map((p, idx) => (
          <div
            key={p.email}
            style={{
              background: "var(--bg-card, #fff)",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 12, padding: 18,
              display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "2rem" }}>{p.emoji}</span>
              <div>
                <div style={{ fontSize: "0.65rem", color: "var(--text-light, #6b7280)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Profile {idx + 1} · {p.province}
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{p.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-light, #6b7280)" }}>{p.firstName} {p.lastName}</div>
              </div>
            </div>

            {/* Summary */}
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-light, #6b7280)", lineHeight: 1.5 }}>
              {p.summary}
            </p>

            {/* Financial KPIs */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "var(--bg, #f9fafb)", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: "0.6rem", color: "var(--text-light, #6b7280)", textTransform: "uppercase" }}>Income</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{p.income}</div>
              </div>
              <div style={{ flex: 1, background: "var(--bg, #f9fafb)", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ fontSize: "0.6rem", color: "var(--text-light, #6b7280)", textTransform: "uppercase" }}>Net Worth</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: p.netWorthColor }}>{p.netWorth}</div>
              </div>
            </div>

            {/* Highlights */}
            <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: "0.75rem", color: "var(--text-light, #6b7280)" }}>
              {p.highlights.map(h => <li key={h}>{h}</li>)}
            </ul>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!user ? (
                <button
                  onClick={() => navigate("/login")}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, fontSize: "0.75rem",
                    border: "none", background: "#4f46e5", color: "#fff",
                    cursor: "pointer", fontWeight: 600, minWidth: 110,
                  }}
                >
                  Log In →
                </button>
              ) : (
                <button
                  onClick={() => handleActivate(idx + 1)}
                  disabled={loading !== null}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, fontSize: "0.75rem",
                    border: "none",
                    background: user.demoProfileIndex === idx + 1 ? "#059669" : "#2563eb",
                    color: "#fff", cursor: loading !== null ? "not-allowed" : "pointer",
                    fontWeight: 600, minWidth: 110,
                    opacity: loading !== null && loading !== idx + 1 ? 0.6 : 1,
                  }}
                >
                  {loading === idx + 1
                    ? "Loading…"
                    : user.demoProfileIndex === idx + 1
                    ? "✓ Active — Reload"
                    : "Load this Profile"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 32, padding: "14px 18px", background: "var(--bg, #f9fafb)", borderRadius: 10, fontSize: "0.78rem", color: "var(--text-light, #6b7280)" }}>
        <strong>How to load demo data:</strong> Run <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>npm run seed:demo</code> in the <code>server/</code> directory once.
        To remove all demo data: <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>npm run clear:demo</code>.
        Demo accounts use realistic Canadian transaction histories with seasonal patterns. Choose 3–7 years above before loading any profile. Regenerate preserves the same year-length choice.
      </div>
    </div>
  );
}
