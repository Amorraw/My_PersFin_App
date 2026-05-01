import { useState } from "react";
import "./AnnualReview.css";

interface CheckItem {
  id: string;
  category: string;
  task: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

const CHECKLIST: CheckItem[] = [
  // Tax & Registered Accounts
  { id: "rrsp-max", category: "Tax & Registered Accounts", task: "Maximize RRSP contribution", detail: "Deadline: first 60 days of next year. Check your NOA for contribution room.", priority: "high" },
  { id: "tfsa-max", category: "Tax & Registered Accounts", task: "Top up TFSA to annual limit", detail: "$7,000 for 2024. Unused room carries forward indefinitely.", priority: "high" },
  { id: "fhsa-check", category: "Tax & Registered Accounts", task: "Review FHSA if first-time buyer", detail: "Up to $8,000/year, $40,000 lifetime. Contributions are tax-deductible.", priority: "medium" },
  { id: "resp-check", category: "Tax & Registered Accounts", task: "Contribute to RESP (if applicable)", detail: "Get 20% CESG on first $2,500 ($500 grant/child/year). Lifetime CESG: $7,200.", priority: "medium" },
  { id: "tax-loss", category: "Tax & Registered Accounts", task: "Harvest tax losses before Dec 31", detail: "Sell losing non-registered positions to offset capital gains. Watch superficial loss rule (30 days).", priority: "high" },
  { id: "t5-collect", category: "Tax & Registered Accounts", task: "Collect T-slips (T4, T5, T3, T5008)", detail: "Issued by Feb 28 next year. T5008 for investment dispositions.", priority: "high" },

  // Insurance & Protection
  { id: "life-review", category: "Insurance & Protection", task: "Review life insurance coverage", detail: "DIME method: Debt + Income × 10 + Mortgage + Education. Review after major life events.", priority: "medium" },
  { id: "disability-check", category: "Insurance & Protection", task: "Verify disability insurance gap", detail: "Most employer LTD covers 60–70% of income. Check if top-up is needed.", priority: "medium" },
  { id: "home-auto", category: "Insurance & Protection", task: "Shop home & auto insurance", detail: "Get competing quotes. Bundling can save 10–15%. Update replacement values.", priority: "medium" },
  { id: "beneficiaries", category: "Insurance & Protection", task: "Update beneficiary designations", detail: "RRSP, TFSA, life insurance, and pension plans. Review after marriage, divorce, or birth.", priority: "high" },

  // Investments & Portfolio
  { id: "rebalance", category: "Investments & Portfolio", task: "Rebalance investment portfolio", detail: "Drift beyond 5% from target triggers rebalancing. Use contributions to avoid selling.", priority: "medium" },
  { id: "asset-location", category: "Investments & Portfolio", task: "Review asset location", detail: "US ETFs → RRSP; bonds → RRSP/RRIF; growth → TFSA; Canadian equity → non-reg.", priority: "medium" },
  { id: "mer-review", category: "Investments & Portfolio", task: "Audit fund MERs", detail: "Switch to all-in-one ETFs (XEQT, VEQT) if paying >0.5% MER on mutual funds.", priority: "low" },
  { id: "gic-mature", category: "Investments & Portfolio", task: "Check GIC maturities", detail: "Decide whether to reinvest, redirect to equities, or use for spending.", priority: "medium" },

  // Budget & Cash Flow
  { id: "net-worth-snap", category: "Budget & Cash Flow", task: "Record annual net worth snapshot", detail: "Assets – Liabilities = Net Worth. Track year-over-year trend.", priority: "high" },
  { id: "budget-ytd", category: "Budget & Cash Flow", task: "Review budget performance YTD", detail: "Identify categories consistently over budget. Adjust allocations for next year.", priority: "high" },
  { id: "emergency-fund", category: "Budget & Cash Flow", task: "Verify emergency fund (3–6 months)", detail: "Keep in HISA or TFSA. Replenish if drawn down during the year.", priority: "high" },
  { id: "subscription-audit", category: "Budget & Cash Flow", task: "Audit recurring subscriptions", detail: "Cancel unused streaming, software, and gym memberships.", priority: "low" },
  { id: "debt-progress", category: "Budget & Cash Flow", task: "Review debt payoff progress", detail: "Check balances on HELOC, credit cards, auto loans. Confirm interest rates are competitive.", priority: "medium" },

  // Estate & Legal
  { id: "will-review", category: "Estate & Legal", task: "Review / create a will", detail: "Update after any major life change. Name an executor and guardians for minor children.", priority: "high" },
  { id: "poa", category: "Estate & Legal", task: "Set up Power of Attorney", detail: "Financial POA and personal care POA. Separate documents in most provinces.", priority: "medium" },
  { id: "digital-assets", category: "Estate & Legal", task: "Organize digital asset access", detail: "Document crypto wallets, password managers, and online accounts for your executor.", priority: "low" },

  // Goals & Planning
  { id: "goals-review", category: "Goals & Planning", task: "Review financial goals progress", detail: "Are you on track for each goal? Adjust contributions or timelines as needed.", priority: "high" },
  { id: "retirement-proj", category: "Goals & Planning", task: "Run retirement projection", detail: "Use the Retirement Projector to verify you're on track. Adjust savings rate if off-course.", priority: "medium" },
  { id: "cpp-oas-plan", category: "Goals & Planning", task: "Plan CPP / OAS timing", detail: "Each year of deferral past 65 adds 8.4% to CPP and 7.2% to OAS (to age 70).", priority: "low" },
];

const CATEGORIES = [...new Set(CHECKLIST.map((c) => c.category))];
const PRIORITY_COLORS = { high: "#dc2626", medium: "#d97706", low: "#6b7280" };
const PRIORITY_BG = { high: "#fef2f2", medium: "#fffbeb", low: "#f9fafb" };

export default function AnnualReview() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState("all");
  const [filterPri, setFilterPri] = useState("all");

  const toggle = (id: string) =>
    setChecked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const resetAll = () => setChecked(new Set());

  const filtered = CHECKLIST.filter(
    (c) => (filterCat === "all" || c.category === filterCat) && (filterPri === "all" || c.priority === filterPri)
  );

  const total = CHECKLIST.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: filtered.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "10px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: "0.92rem", fontWeight: 700, margin: 0 }}>Annual Financial Review</h1>
          <p style={{ color: "var(--text-light)", fontSize: "0.72rem", margin: "2px 0 0" }}>
            Year-end checklist — {done} of {total} tasks complete
          </p>
        </div>
        <button
          onClick={resetAll}
          style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: "0.75rem", cursor: "pointer" }}
        >
          Reset All
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-light)", marginBottom: 4 }}>
          <span>Progress</span><span>{pct}%</span>
        </div>
        <div style={{ height: 6, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#059669" : "#4f46e5", borderRadius: 10, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text)", fontSize: "0.72rem" }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterPri}
          onChange={(e) => setFilterPri(e.target.value)}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text)", fontSize: "0.72rem" }}
        >
          <option value="all">All Priorities</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(["high", "medium", "low"] as const).map((p) => {
            const count = CHECKLIST.filter((c) => c.priority === p && checked.has(c.id)).length;
            const total = CHECKLIST.filter((c) => c.priority === p).length;
            return (
              <div key={p} style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: 20, background: PRIORITY_BG[p], color: PRIORITY_COLORS[p], fontWeight: 600 }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}: {count}/{total}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checklist */}
      {grouped.map(({ cat, items }) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>{cat}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item) => {
              const done = checked.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                    background: done ? "var(--bg)" : "var(--bg-card)",
                    border: `1px solid ${done ? "var(--border)" : "var(--border)"}`,
                    opacity: done ? 0.6 : 1, transition: "opacity 0.2s",
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                    border: done ? "none" : "2px solid var(--border)",
                    background: done ? "#059669" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {done && <span style={{ color: "white", fontSize: "0.68rem", fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: done ? 400 : 600, color: "var(--text)", textDecoration: done ? "line-through" : "none" }}>
                        {item.task}
                      </span>
                      <span style={{
                        fontSize: "0.65rem", fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                        background: PRIORITY_BG[item.priority], color: PRIORITY_COLORS[item.priority],
                        textTransform: "uppercase", letterSpacing: "0.04em",
                      }}>
                        {item.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-light)", lineHeight: 1.5 }}>{item.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {pct === 100 && (
        <div style={{ textAlign: "center", padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginTop: 6 }}>
          <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>🎉</div>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#059669" }}>Annual Review Complete!</div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 4 }}>You're financially set for the new year.</div>
        </div>
      )}
    </div>
  );
}
