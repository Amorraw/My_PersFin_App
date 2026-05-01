import { useState } from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import "./InsurancePlanning.css";

// ── shared helpers ──────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const PROVINCES = [
  ["AB","Alberta"],["BC","British Columbia"],["MB","Manitoba"],["NB","New Brunswick"],
  ["NL","Newfoundland & Labrador"],["NS","Nova Scotia"],["NT","Northwest Territories"],
  ["NU","Nunavut"],["ON","Ontario"],["PE","Prince Edward Island"],
  ["QC","Québec"],["SK","Saskatchewan"],["YT","Yukon"],
];

// ── types ───────────────────────────────────────────────────────────────────
interface LifeResult {
  dime: { D: number; I: number; M: number; E: number; totalNeed: number };
  existingCoverage: number;
  coverageGap: number;
  hasEnoughCoverage: boolean;
  termEstimates: Record<string, { monthly: number; annualCost?: number; lifetimeCost?: number; note?: string }>;
  notes: string[];
}

interface DisabilityResult {
  monthly: number;
  target: number;
  eiSickness: { eiMonthly: number; weeks: number };
  shortTerm: { stdMonthly: number; weeks: number };
  longTerm: { ltdGross: number; cppMonthly: number; ltdNet: number; totalLTD: number; personalMonthly: number };
  ltdGap: number;
  estimatedGapPremium: number;
  cppDisabilityInfo: { avgMonthly: number; maxMonthly: number; flatRate: number };
}

interface DentalResult {
  cdcpEligible: boolean;
  cdcpCoverageRate: number;
  cdcpPhase: string;
  cdcpNotes: string[];
  provincialGap: Record<string, string>;
  province: string;
  recommendation: string;
}

// ── component ───────────────────────────────────────────────────────────────
export default function InsurancePlanning() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"life" | "disability" | "health">("life");

  // ── Life Insurance state ────────────────────────────────────────────────
  const [life, setLife] = useState({
    debts: 0, annualIncome: 0, incomeReplacementYears: 10,
    mortgageBalance: 0, childrenCount: 0, educationCostPerChild: 50000,
    groupLifeInsurance: 0, existingPolicies: 0, age: 35, isSmoker: false,
  });
  const [lifeResult, setLifeResult] = useState<LifeResult | null>(null);
  const [lifeLoading, setLifeLoading] = useState(false);
  const [lifeError, setLifeError] = useState("");

  // ── Disability state ─────────────────────────────────────────────────────
  const [dis, setDis] = useState({
    grossMonthlyIncome: 0, employerSTDWeeks: 0, employerSTDPercent: 0,
    employerLTDPercent: 0, employerLTDOffsetsCPP: true,
    hasPersonalPolicy: false, personalPolicyMonthly: 0,
    eligibleForCPPDisability: true, targetReplacementRate: 0.85,
  });
  const [disResult, setDisResult] = useState<DisabilityResult | null>(null);
  const [disLoading, setDisLoading] = useState(false);
  const [disError, setDisError] = useState("");

  // ── Dental / Health state ────────────────────────────────────────────────
  const [dental, setDental] = useState({
    netFamilyIncome: 0, hasPrivateDentalInsurance: false,
    age: 35, hasDisability: false,
    province: user?.province || "ON",
  });
  const [dentalResult, setDentalResult] = useState<DentalResult | null>(null);
  const [dentalLoading, setDentalLoading] = useState(false);
  const [dentalError, setDentalError] = useState("");

  // ── Calculations ─────────────────────────────────────────────────────────
  const calcLife = async () => {
    setLifeLoading(true); setLifeError("");
    try {
      const data = await api("/insurance/life-needs", { method: "POST", body: JSON.stringify(life) });
      setLifeResult(data);
    } catch (e: any) { setLifeError(e?.message ?? "Calculation failed"); }
    finally { setLifeLoading(false); }
  };

  const calcDisability = async () => {
    setDisLoading(true); setDisError("");
    try {
      const data = await api("/insurance/disability-gap", { method: "POST", body: JSON.stringify(dis) });
      setDisResult(data);
    } catch (e: any) { setDisError(e?.message ?? "Calculation failed"); }
    finally { setDisLoading(false); }
  };

  const calcDental = async () => {
    setDentalLoading(true); setDentalError("");
    try {
      const data = await api("/insurance/dental-eligibility", { method: "POST", body: JSON.stringify(dental) });
      setDentalResult(data);
    } catch (e: any) { setDentalError(e?.message ?? "Calculation failed"); }
    finally { setDentalLoading(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const tabBtn = (t: "life" | "disability" | "health", label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: "0.3rem 0.75rem", border: "none",
        borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
        background: "none", cursor: "pointer",
        fontWeight: tab === t ? 700 : 400,
        color: tab === t ? "var(--primary)" : "var(--text-secondary)",
        fontSize: "0.78rem",
      }}
    >{label}</button>
  );

  const numInput = (
    label: string,
    value: number | boolean,
    onChange: (v: any) => void,
    opts: { min?: number; max?: number; step?: number; prefix?: string; type?: string; small?: string } = {}
  ) => (
    <div className="form-group">
      <label>{label}</label>
      {opts.type === "checkbox" ? (
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
          <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      ) : (
        <input
          type="number"
          min={opts.min ?? 0}
          max={opts.max}
          step={opts.step ?? 1}
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      {opts.small && <small style={{ color: "var(--text-secondary)" }}>{opts.small}</small>}
    </div>
  );

  const card = (label: string, value: string, color = "inherit", sub?: string) => (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.65rem" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>{label}</div>
      <div style={{ fontSize: "0.92rem", fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{sub}</div>}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "10px", maxWidth: 960 }}>
      <h1>Insurance Planning</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", maxWidth: 680, fontSize: "0.72rem" }}>
        Analyze your life insurance needs using the DIME method, calculate your disability coverage gap,
        and check your eligibility for the Canada Dental Care Plan.
      </p>

      <div style={{ borderBottom: "1px solid var(--border)", marginBottom: "10px", display: "flex" }}>
        {tabBtn("life", "Life Insurance")}
        {tabBtn("disability", "Disability Insurance")}
        {tabBtn("health", "Critical Illness & Healthcare")}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — LIFE INSURANCE (DIME METHOD)
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "life" && (
        <div>
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px", fontSize: "0.72rem" }}>
            <strong>DIME Method:</strong> Debt + Income replacement + Mortgage + Education costs.
            This is the most widely-used framework for estimating life insurance needs in Canada.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginBottom: "10px" }}>

            {/* Inputs */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
              <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Your Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {numInput("Annual Income ($)", life.annualIncome, (v) => setLife(p => ({ ...p, annualIncome: v })))}
                {numInput("Income Replacement (Years)", life.incomeReplacementYears, (v) => setLife(p => ({ ...p, incomeReplacementYears: v })), { min: 1, max: 40, small: "Years of income your family would need" })}
                {numInput("Other Debts ($)", life.debts, (v) => setLife(p => ({ ...p, debts: v })), { small: "Credit cards, car loans — not mortgage" })}
                {numInput("Mortgage Balance ($)", life.mortgageBalance, (v) => setLife(p => ({ ...p, mortgageBalance: v })))}
                {numInput("Number of Children", life.childrenCount, (v) => setLife(p => ({ ...p, childrenCount: v })), { min: 0, max: 10 })}
                {numInput("Education Cost / Child ($)", life.educationCostPerChild, (v) => setLife(p => ({ ...p, educationCostPerChild: v })), { small: "Average 4-year post-secondary ≈ $50,000" })}
              </div>

              <h3 style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>Existing Coverage</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {numInput("Group Life Insurance ($)", life.groupLifeInsurance, (v) => setLife(p => ({ ...p, groupLifeInsurance: v })), { small: "Employer-sponsored (typically 1–2× salary)" })}
                {numInput("Other Policies ($)", life.existingPolicies, (v) => setLife(p => ({ ...p, existingPolicies: v })))}
                {numInput("Your Age", life.age, (v) => setLife(p => ({ ...p, age: v })), { min: 18, max: 85, small: "Used for premium estimates" })}
                <div className="form-group">
                  <label>Smoker?</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                    <input type="checkbox" checked={life.isSmoker} onChange={(e) => setLife(p => ({ ...p, isSmoker: e.target.checked }))} />
                    Yes (premiums ~2.5× higher)
                  </label>
                </div>
              </div>

              <button className="btn btn-primary" style={{ marginTop: "0.5rem", minWidth: 160 }} onClick={calcLife} disabled={lifeLoading}>
                {lifeLoading ? "Calculating…" : "Calculate My Need"}
              </button>
              {lifeError && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{lifeError}</p>}
            </div>

            {/* DIME breakdown (live) */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
              <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>DIME Breakdown</h3>
              {[
                { letter: "D", label: "Debt (excl. mortgage)", value: life.debts, color: "#dc2626" },
                { letter: "I", label: `Income (${life.incomeReplacementYears} yrs × ${fmt(life.annualIncome)})`, value: life.annualIncome * life.incomeReplacementYears, color: "#2563eb" },
                { letter: "M", label: "Mortgage balance", value: life.mortgageBalance, color: "#d97706" },
                { letter: "E", label: `Education (${life.childrenCount} × ${fmt(life.educationCostPerChild)})`, value: life.childrenCount * life.educationCostPerChild, color: "#16a34a" },
              ].map((row) => (
                <div key={row.letter} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: row.color, color: "white", fontWeight: 800, fontSize: "0.72rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {row.letter}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{row.label}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{fmt(row.value)}</div>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: "2px solid var(--border)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.82rem" }}>
                  <span>Total Need</span>
                  <span style={{ color: "var(--primary)" }}>{fmt(life.debts + life.annualIncome * life.incomeReplacementYears + life.mortgageBalance + life.childrenCount * life.educationCostPerChild)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  <span>Existing coverage</span>
                  <span>−{fmt(life.groupLifeInsurance + life.existingPolicies)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.82rem", marginTop: "0.25rem" }}>
                  <span>Coverage Gap</span>
                  <span style={{ color: Math.max(0, life.debts + life.annualIncome * life.incomeReplacementYears + life.mortgageBalance + life.childrenCount * life.educationCostPerChild - life.groupLifeInsurance - life.existingPolicies) > 0 ? "var(--danger)" : "var(--success)" }}>
                    {fmt(Math.max(0, life.debts + life.annualIncome * life.incomeReplacementYears + life.mortgageBalance + life.childrenCount * life.educationCostPerChild - life.groupLifeInsurance - life.existingPolicies))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          {lifeResult && (
            <>
              {lifeResult.hasEnoughCoverage ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px" }}>
                  <strong style={{ color: "var(--success)", fontSize: "0.75rem" }}>You appear to have sufficient coverage.</strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "#166534" }}>
                    Your existing life insurance exceeds your estimated DIME need. Review annually as your mortgage, income, and family situation change.
                  </p>
                </div>
              ) : (
                <div style={{ background: "#fef2f2", border: "2px solid var(--danger)", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px" }}>
                  <strong style={{ color: "var(--danger)", fontSize: "0.75rem" }}>Coverage gap detected: {fmt(lifeResult.coverageGap)}</strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "var(--danger)" }}>
                    Your family would be short {fmt(lifeResult.coverageGap)} if you passed away today. Consider purchasing additional term life insurance.
                  </p>
                </div>
              )}

              {/* Term vs Whole Life table */}
              {Object.keys(lifeResult.termEstimates).length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "10px" }}>
                  <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                    <h3 style={{ margin: 0, fontSize: "0.75rem" }}>Estimated Premiums for {fmt(lifeResult.coverageGap)} Coverage</h3>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      Illustrative only — actual rates require underwriting. Non-smoker, standard health class.
                    </p>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ background: "var(--background)" }}>
                        {["Policy Type", "Monthly Premium", "Annual Cost", "Total Cost Over Term", "Best For"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: "10yr", label: "10-Year Term", best: "Temporary needs, near-retirees, short-term mortgage coverage" },
                        { key: "20yr", label: "20-Year Term", best: "Most families — covers mortgage + child-rearing years (best value)" },
                        { key: "30yr", label: "30-Year Term", best: "Young families wanting long-term certainty of premium" },
                        { key: "whole-life", label: "Whole Life / Permanent", best: "Estate planning, high net worth, max TFSA/RRSP already funded" },
                      ].filter(r => lifeResult.termEstimates[r.key]).map((r, i) => {
                        const est = lifeResult.termEstimates[r.key];
                        const isWhole = r.key === "whole-life";
                        return (
                          <tr key={r.key} style={{ background: r.key === "20yr" ? "#eff6ff" : i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: r.key === "20yr" ? 700 : 400 }}>
                              {r.label}
                              {r.key === "20yr" && <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", background: "var(--primary)", color: "white", padding: "1px 5px", borderRadius: 8 }}>RECOMMENDED</span>}
                            </td>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{fmt(est.monthly)}/mo</td>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{est.annualCost ? fmt(est.annualCost) : "—"}</td>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{est.lifetimeCost ? fmt(est.lifetimeCost) : isWhole ? "Builds cash value" : "—"}</td>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontSize: "0.72rem", color: "var(--text-secondary)" }}>{r.best}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
                <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Key Points</h3>
                <ul style={{ margin: 0, paddingLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {lifeResult.notes.map((n, i) => (
                    <li key={i} style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{n}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — DISABILITY INSURANCE
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "disability" && (
        <div>
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px", fontSize: "0.72rem" }}>
            <strong>Target:</strong> Most disability policies aim to replace ~70% of gross income (≈85% of after-tax income).
            Employer plans, EI sickness, and CPP disability typically leave a gap — especially for higher earners.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginBottom: "10px" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
              <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Your Situation</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {numInput("Gross Monthly Income ($)", dis.grossMonthlyIncome, (v) => setDis(p => ({ ...p, grossMonthlyIncome: v })))}
                <div className="form-group">
                  <label>Target Replacement Rate</label>
                  <select value={dis.targetReplacementRate} onChange={(e) => setDis(p => ({ ...p, targetReplacementRate: Number(e.target.value) }))}>
                    <option value={0.70}>70% of gross</option>
                    <option value={0.80}>80% of gross</option>
                    <option value={0.85}>85% of gross (recommended)</option>
                    <option value={1.00}>100% of gross</option>
                  </select>
                </div>
              </div>

              <h3 style={{ fontSize: "0.75rem" }}>Employer Benefits</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {numInput("Short-Term Disability (weeks)", dis.employerSTDWeeks, (v) => setDis(p => ({ ...p, employerSTDWeeks: v })), { small: "0 if no employer STD plan" })}
                {numInput("STD % of Salary", dis.employerSTDPercent, (v) => setDis(p => ({ ...p, employerSTDPercent: v })), { min: 0, max: 100, small: "e.g. 66 for 66.7%" })}
                {numInput("LTD % of Salary", dis.employerLTDPercent, (v) => setDis(p => ({ ...p, employerLTDPercent: v })), { min: 0, max: 100, small: "0 if no employer LTD plan" })}
                <div className="form-group">
                  <label>LTD plan has CPP offset?</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                    <input type="checkbox" checked={dis.employerLTDOffsetsCPP} onChange={(e) => setDis(p => ({ ...p, employerLTDOffsetsCPP: e.target.checked }))} />
                    Yes (most group LTDs do)
                  </label>
                </div>
              </div>

              <h3 style={{ fontSize: "0.75rem" }}>Personal Policy</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div className="form-group">
                  <label>Have personal disability policy?</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                    <input type="checkbox" checked={dis.hasPersonalPolicy} onChange={(e) => setDis(p => ({ ...p, hasPersonalPolicy: e.target.checked }))} />
                    Yes
                  </label>
                </div>
                {dis.hasPersonalPolicy && numInput("Personal Policy $/month", dis.personalPolicyMonthly, (v) => setDis(p => ({ ...p, personalPolicyMonthly: v })))}
                <div className="form-group">
                  <label>CPP Disability eligible?</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                    <input type="checkbox" checked={dis.eligibleForCPPDisability} onChange={(e) => setDis(p => ({ ...p, eligibleForCPPDisability: e.target.checked }))} />
                    Yes (contributed 4 of last 6 years)
                  </label>
                </div>
              </div>

              <button className="btn btn-primary" style={{ marginTop: "0.5rem", minWidth: 160 }} onClick={calcDisability} disabled={disLoading}>
                {disLoading ? "Calculating…" : "Calculate Gap"}
              </button>
              {disError && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{disError}</p>}
            </div>

            {/* Results column */}
            {disResult && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  {card("Monthly Income", fmt(disResult.monthly))}
                  {card("Target (85% of gross)", fmt(disResult.target), "var(--primary)")}
                </div>

                {/* Coverage timeline */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem", marginBottom: "8px" }}>
                  <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Coverage Timeline</h3>

                  {[
                    {
                      phase: "Weeks 1–15",
                      title: "EI Sickness Benefits",
                      amount: disResult.eiSickness.eiMonthly,
                      note: `55% of insurable earnings, max $668/week (2024). 2-week waiting period applies.`,
                      color: "#2563eb",
                    },
                    {
                      phase: `Weeks 1–${Math.max(disResult.shortTerm.weeks, 15)}`,
                      title: "Employer Short-Term Disability",
                      amount: disResult.shortTerm.stdMonthly,
                      note: disResult.shortTerm.stdMonthly > 0 ? "Employer STD may overlap or top up EI sickness benefits." : "No employer STD plan entered.",
                      color: "#7c3aed",
                    },
                    {
                      phase: "Long-Term (to age 65)",
                      title: "Employer LTD + CPP Disability",
                      amount: disResult.longTerm.totalLTD,
                      note: `LTD gross: ${fmt(disResult.longTerm.ltdGross)}/mo. CPP disability avg: ${fmt(disResult.longTerm.cppMonthly)}/mo${disResult.longTerm.ltdGross > 0 && disResult.longTerm.cppMonthly > 0 ? ` (offset clause: ${disResult.longTerm.cppMonthly > 0 ? "LTD reduced by CPP" : "no offset"})` : ""}.`,
                      color: "#d97706",
                    },
                  ].map((p) => (
                    <div key={p.phase} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div style={{ width: 3, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{p.phase}</div>
                        <div style={{ fontWeight: 600, fontSize: "0.78rem" }}>{p.title} — <span style={{ color: p.color }}>{fmt(p.amount)}/mo</span></div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>{p.note}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gap result */}
                {disResult.ltdGap > 0 ? (
                  <div style={{ background: "#fef2f2", border: "2px solid var(--danger)", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
                    <strong style={{ color: "var(--danger)", fontSize: "0.75rem" }}>Monthly gap: {fmt(disResult.ltdGap)}</strong>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "var(--danger)" }}>
                      A personal disability policy with a {fmt(disResult.ltdGap)}/month benefit would fill this gap.
                      Estimated monthly premium: ~{fmt(disResult.estimatedGapPremium)} (illustrative — requires underwriting).
                    </p>
                  </div>
                ) : (
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
                    <strong style={{ color: "var(--success)", fontSize: "0.75rem" }}>No gap detected at this income.</strong>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "#166534" }}>
                      Your combined employer LTD + CPP disability appears to meet the target replacement rate.
                    </p>
                  </div>
                )}

                {/* CPP Disability info box */}
                <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", marginTop: "8px", fontSize: "0.72rem" }}>
                  <strong>CPP Disability 2024 —</strong>{" "}
                  Avg: {fmt(disResult.cppDisabilityInfo.avgMonthly)}/mo · Max: {fmt(disResult.cppDisabilityInfo.maxMonthly)}/mo.
                  Requires contributions in 4 of the last 6 years. 4-month waiting period after disability onset.
                  Most group LTD plans contain a CPP offset clause — the LTD insurer reduces their benefit dollar-for-dollar when you receive CPP disability.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — CRITICAL ILLNESS & HEALTHCARE
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "health" && (
        <div>
          {/* CDCP Eligibility Checker */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem", marginBottom: "10px" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Canada Dental Care Plan (CDCP) Eligibility</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem", marginBottom: "8px" }}>
              The CDCP is a federal program launched in 2023 providing dental coverage to uninsured Canadians with household income under $90,000.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", marginBottom: "8px" }}>
              <div className="form-group">
                <label>Net Family Income ($)</label>
                <input type="number" min={0} value={dental.netFamilyIncome} onChange={(e) => setDental(p => ({ ...p, netFamilyIncome: Number(e.target.value) }))} />
                <small style={{ color: "var(--text-secondary)" }}>Line 23600 of your Notice of Assessment</small>
              </div>
              <div className="form-group">
                <label>Your Age</label>
                <input type="number" min={0} max={120} value={dental.age} onChange={(e) => setDental(p => ({ ...p, age: Number(e.target.value) }))} />
              </div>
              <div className="form-group">
                <label>Province</label>
                <select value={dental.province} onChange={(e) => setDental(p => ({ ...p, province: e.target.value }))}>
                  {PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Private dental insurance?</label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                  <input type="checkbox" checked={dental.hasPrivateDentalInsurance} onChange={(e) => setDental(p => ({ ...p, hasPrivateDentalInsurance: e.target.checked }))} />
                  Yes (disqualifies from CDCP)
                </label>
              </div>
              <div className="form-group">
                <label>Disability (DTC)?</label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
                  <input type="checkbox" checked={dental.hasDisability} onChange={(e) => setDental(p => ({ ...p, hasDisability: e.target.checked }))} />
                  Yes (Disability Tax Credit)
                </label>
              </div>
            </div>
            <button className="btn btn-primary" onClick={calcDental} disabled={dentalLoading}>
              {dentalLoading ? "Checking…" : "Check Eligibility"}
            </button>
            {dentalError && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{dentalError}</p>}
          </div>

          {/* CDCP Result */}
          {dentalResult && (
            <>
              <div style={{
                background: dentalResult.cdcpEligible ? "#f0fdf4" : "#fef2f2",
                border: `2px solid ${dentalResult.cdcpEligible ? "#86efac" : "var(--danger)"}`,
                borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "10px"
              }}>
                <strong style={{ color: dentalResult.cdcpEligible ? "var(--success)" : "var(--danger)" }}>
                  {dentalResult.cdcpEligible
                    ? `✓ CDCP Eligible — ${dentalResult.cdcpCoverageRate}% Coverage (${dentalResult.cdcpPhase})`
                    : "✗ Not Eligible for CDCP"}
                </strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: dentalResult.cdcpEligible ? "#166534" : "var(--danger)" }}>
                  {dentalResult.recommendation}
                </p>
                {dentalResult.cdcpNotes.map((n, i) => (
                  <p key={i} style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-secondary)" }}>• {n}</p>
                ))}
              </div>

              {/* CDCP Coverage Rates */}
              {dentalResult.cdcpEligible && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "10px" }}>
                  <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                    <h3 style={{ margin: 0, fontSize: "0.75rem" }}>CDCP Coverage Rates by Income</h3>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ background: "var(--background)" }}>
                        {["Net Family Income", "Coverage Rate", "Your Rate"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { range: "Under $70,000", rate: 100 },
                        { range: "$70,000 – $79,999", rate: 80 },
                        { range: "$80,000 – $89,999", rate: 60 },
                        { range: "$90,000+", rate: 0 },
                      ].map((row, i) => (
                        <tr key={row.range} style={{ background: row.rate === dentalResult.cdcpCoverageRate ? "#eff6ff" : i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>{row.range}</td>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600, color: row.rate > 0 ? "var(--success)" : "var(--danger)" }}>
                            {row.rate > 0 ? `${row.rate}%` : "Not eligible"}
                          </td>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)" }}>
                            {row.rate === dentalResult.cdcpCoverageRate && <span style={{ background: "var(--primary)", color: "white", padding: "1px 6px", borderRadius: 8, fontSize: "0.65rem" }}>Your rate</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Provincial health gaps */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "10px" }}>
                <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ margin: 0, fontSize: "0.75rem" }}>Provincial Health Coverage Gaps — {dentalResult.province}</h3>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                    What your provincial health plan does NOT cover (outside hospital setting).
                  </p>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr style={{ background: "var(--background)" }}>
                      {["Service", "Provincial Coverage"].map(h => (
                        <th key={h} style={{ padding: "5px 8px", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "drugs", label: "Prescription Drugs" },
                      { key: "vision", label: "Vision / Optometry" },
                      { key: "dental", label: "Dental Care" },
                      { key: "physio", label: "Physiotherapy" },
                      { key: "chiro", label: "Chiropractic" },
                      { key: "mental", label: "Psychology / Mental Health" },
                      { key: "ambulance", label: "Ambulance" },
                    ].map((row, i) => {
                      const text = dentalResult.provincialGap[row.key] || "—";
                      const isCovered = text.toLowerCase().includes("covered") && !text.toLowerCase().includes("not covered");
                      return (
                        <tr key={row.key} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", fontWeight: 500 }}>{row.label}</td>
                          <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", color: isCovered ? "var(--success)" : "var(--text-secondary)", fontSize: "0.72rem" }}>
                            {text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Critical Illness info */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.65rem" }}>
            <h3 style={{ marginTop: 0, fontSize: "0.75rem" }}>Critical Illness Insurance — What It Covers</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem", lineHeight: 1.5, marginBottom: "8px" }}>
              Critical illness (CI) insurance pays a <strong>tax-free lump sum</strong> upon diagnosis of a covered condition
              (survival period: typically 30 days). Unlike disability insurance, it is not income-replacement —
              you can use the funds however you choose (medical travel, home modifications, mortgage payments, etc.).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "6px", marginBottom: "8px" }}>
              {[
                { title: "Big 3 (all CI policies)", items: ["Heart attack", "Stroke", "Life-threatening cancer"] },
                { title: "Extended conditions (20–26 typically)", items: ["Multiple sclerosis", "Parkinson's disease", "Severe burns", "Major organ failure", "Blindness / deafness", "Aortic surgery"] },
                { title: "Optional riders", items: ["Return of premium on expiry", "Return of premium on death", "Loss of independent existence"] },
              ].map(g => (
                <div key={g.title} style={{ background: "var(--background)", borderRadius: 6, padding: "0.5rem 0.65rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.72rem", marginBottom: "0.3rem" }}>{g.title}</div>
                  <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                    {g.items.map(item => <li key={item} style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.15rem" }}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 6, padding: "0.5rem 0.65rem", fontSize: "0.72rem", color: "#78350f" }}>
              <strong>Tip:</strong> Canadians with high incomes or self-employed individuals benefit most from CI — provincial coverage doesn't replace lost income during treatment,
              and out-of-pocket costs for private rooms, experimental drugs, and medical travel can be substantial.
              Typical lump-sum amounts: $50,000–$300,000.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
