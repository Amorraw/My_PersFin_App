import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

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

const PASSWORD = "Demo1234!";

export default function DemoProfiles() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const copyCredentials = (email: string) => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${PASSWORD}`);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleLogin = (email: string) => {
    // Pre-fill isn't possible without state, so just navigate to login
    navigate("/login");
  };

  const clearData = async () => {
    if (!confirm("This will permanently delete ALL data for this demo account. Continue?")) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/demo/clear", { method: "POST", credentials: "include" });
      const data = await res.json();
      setResetMsg(data.message);
    } catch {
      setResetMsg("Request failed — is the server running?");
    } finally {
      setResetting(false);
    }
  };

  const resetData = async () => {
    if (!confirm("This will wipe and re-seed this demo account's original data. This may take a moment. Continue?")) return;
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST", credentials: "include" });
      const data = await res.json();
      setResetMsg(data.message);
    } catch {
      setResetMsg("Request failed — is the server running?");
    } finally {
      setResetting(false);
    }
  };

  const isDemoUser = user && /^user_test\d+@demo\.com$/.test((user as any).email || "");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 8px" }}>
          Demo Financial Profiles
        </h1>
        <p style={{ color: "var(--text-light, #6b7280)", fontSize: "0.9rem", maxWidth: 620, margin: "0 auto" }}>
          10 pre-seeded Canadian households — from a debt-laden graduate to a high-net-worth executive —
          each with 2 years of realistic transaction history. Log in to explore any profile.
        </p>
        <div style={{
          display: "inline-block", marginTop: 16,
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 8, padding: "10px 20px", fontSize: "0.82rem", color: "#1d4ed8",
        }}>
          All accounts use password: <strong>{PASSWORD}</strong>
        </div>
      </div>

      {/* Demo user controls */}
      {isDemoUser && (
        <div style={{
          background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10,
          padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "0.85rem", color: "#92400e", flex: 1 }}>
            You are logged in as a demo account. You can wipe and reload your data below,
            or log out and log into another demo account to switch profiles.
          </span>
          <button
            onClick={resetData} disabled={resetting}
            style={{ padding: "7px 16px", borderRadius: 6, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
          >
            {resetting ? "Working…" : "↺ Reset My Demo Data"}
          </button>
          <button
            onClick={clearData} disabled={resetting}
            style={{ padding: "7px 16px", borderRadius: 6, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
          >
            🗑 Clear All My Data
          </button>
        </div>
      )}

      {resetMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.82rem", color: "#166534" }}>
          ✓ {resetMsg}
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

            {/* Credentials */}
            <div style={{
              background: "var(--bg, #f9fafb)", border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: "0.75rem",
            }}>
              <div style={{ color: "var(--text-light, #6b7280)", fontSize: "0.65rem", marginBottom: 3 }}>LOGIN CREDENTIALS</div>
              <div><strong>Email:</strong> {p.email}</div>
              <div><strong>Password:</strong> {PASSWORD}</div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => copyCredentials(p.email)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6, fontSize: "0.75rem",
                  border: "1px solid var(--border, #e5e7eb)", background: "transparent",
                  cursor: "pointer", color: "var(--text, #111)",
                }}
              >
                {copied === p.email ? "✓ Copied!" : "📋 Copy Credentials"}
              </button>
              {!user ? (
                <button
                  onClick={() => handleLogin(p.email)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, fontSize: "0.75rem",
                    border: "none", background: "#4f46e5", color: "#fff",
                    cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Log In →
                </button>
              ) : (
                <div style={{ flex: 1, padding: "7px 0", borderRadius: 6, fontSize: "0.72rem",
                  textAlign: "center", color: "var(--text-light, #6b7280)",
                  border: "1px solid var(--border, #e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  Log out → log in as this user
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 32, padding: "14px 18px", background: "var(--bg, #f9fafb)", borderRadius: 10, fontSize: "0.78rem", color: "var(--text-light, #6b7280)" }}>
        <strong>How to load demo data:</strong> Run <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>npm run seed:demo</code> in the <code>server/</code> directory once.
        To remove all demo data: <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>npm run clear:demo</code>.
        Demo accounts use realistic 2-year Canadian transaction histories across all account types.
      </div>
    </div>
  );
}
