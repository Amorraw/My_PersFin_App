// RRSP vs TFSA decision tool: compares after-tax retirement value using real Canadian marginal tax rates
import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import "./RRSPvsTFSA.css";
import { fmtCADShort } from "../components/charts";
import { fmtCAD as fmt } from "../utils/formatters";

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

interface Result {
  inputs: any;
  currentRates: { combined: number; federal: number; provincial: number; provinceName: string };
  retirementRates: { combined: number; federal: number; provincial: number };
  rateDifference: number;
  rrsp: {
    grossContribution: number;
    immediateRefund: number;
    netCost: number;
    futureGrossValue: number;
    futureTaxOnWithdrawal: number;
    futureAfterTaxValue: number;
    refundReinvestedTFSA: number;
    totalRetirementValue: number;
  };
  tfsa: {
    contribution: number;
    futureValue: number;
    totalRetirementValue: number;
  };
  advantage: { winner: "rrsp" | "tfsa"; amount: number; percent: number };
  recommendation: "rrsp" | "tfsa" | "split";
  recommendationStrength: "strong" | "moderate" | "marginal";
  reasoning: string;
  oasClawbackRisk: boolean;
  estimatedAnnualRRIFWithdrawal: number;
  growthTable: Array<{ year: number; rrspValue: number; tfsaValue: number }>;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

const RECOMMENDATION_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  rrsp:  { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8", label: "RRSP Recommended" },
  tfsa:  { bg: "#f0fdf4", border: "#22c55e", text: "#15803d", label: "TFSA Recommended" },
  split: { bg: "#fefce8", border: "#eab308", text: "#854d0e", label: "Split Contributions" },
};

const STRENGTH_LABEL: Record<string, string> = {
  strong:   "Strong recommendation",
  moderate: "Moderate recommendation",
  marginal: "Marginal difference",
};

// Renders slider inputs, recommendation banner, rate cards, side-by-side comparison, and growth chart
export default function RRSPvsTFSA() {
  const { user } = useAuth();

  const [form, setForm] = useState({
    currentIncome:            75000,
    expectedRetirementIncome: 50000,
    province:                 user?.province ?? "ON",
    contributionAmount:       10000,
    yearsToRetirement:        25,
    assumedAnnualReturn:      6,
  });

  const [result, setResult]   = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (user?.province) setForm((f) => ({ ...f, province: user.province! }));
  }, [user?.province]);

  const calculate = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/tax-accounts/rrsp-vs-tfsa", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? "Calculation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const set = (key: keyof typeof form, val: number | string) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="rrsp-container">
      <h1>RRSP vs TFSA Decision Tool</h1>
      <p className="rrsp-intro">
        Enter your current income, expected retirement income, and province to find out which
        account will leave you with more money in retirement. The comparison uses the same
        out-of-pocket cost for both options.
      </p>

      {/* ── Inputs ── */}
      <div className="section-card">
        <h2>Your Details</h2>
        <div className="rrsp-inputs-grid">
          <Slider label={`Current Annual Income: ${fmt(form.currentIncome)}`}
            min={20000} max={400000} step={5000} value={form.currentIncome}
            onChange={(v) => set("currentIncome", v)} />

          <Slider label={`Expected Retirement Income: ${fmt(form.expectedRetirementIncome)}`}
            min={15000} max={200000} step={5000} value={form.expectedRetirementIncome}
            onChange={(v) => set("expectedRetirementIncome", v)}
            hint="Include CPP, OAS, pension, part-time work, rental income, etc." />

          <div className="form-group">
            <label>Province / Territory</label>
            <select value={form.province} onChange={(e) => set("province", e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>

          <Slider label={`Contribution Amount: ${fmt(form.contributionAmount)}`}
            min={500} max={50000} step={500} value={form.contributionAmount}
            onChange={(v) => set("contributionAmount", v)} />

          <Slider label={`Years to Retirement: ${form.yearsToRetirement} yrs`}
            min={1} max={40} step={1} value={form.yearsToRetirement}
            onChange={(v) => set("yearsToRetirement", v)} />

          <Slider label={`Assumed Annual Return: ${form.assumedAnnualReturn}%`}
            min={2} max={12} step={0.5} value={form.assumedAnnualReturn}
            onChange={(v) => set("assumedAnnualReturn", v)}
            hint="Historical Canadian balanced portfolio: ~5–7% annually." />
        </div>

        <button
          className="btn btn-primary rrsp-calculate-btn"
          onClick={calculate}
          disabled={loading}
        >
          {loading ? "Calculating…" : "Compare RRSP vs TFSA"}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Recommendation banner — per-recommendation semantic colors preserved */}
          {(() => {
            const s = RECOMMENDATION_STYLES[result.recommendation];
            return (
              <div className="rec-banner" style={{ background: s.bg, borderColor: s.border }}>
                <div className="rec-banner-inner">
                  <span className="rec-banner-icon">
                    {result.recommendation === "rrsp" ? "💰" : result.recommendation === "tfsa" ? "🎁" : "⚖️"}
                  </span>
                  <div>
                    <div className="rec-banner-label" style={{ color: s.text }}>
                      {s.label}
                      <span className="rec-banner-strength">
                        ({STRENGTH_LABEL[result.recommendationStrength]})
                      </span>
                    </div>
                    <div className="rec-banner-reason" style={{ color: s.text }}>
                      {result.reasoning}
                    </div>
                  </div>
                </div>
                {result.advantage.amount > 0 && (
                  <div className="rec-banner-advantage" style={{ color: s.text }}>
                    The <strong>{result.advantage.winner.toUpperCase()}</strong> path delivers{" "}
                    <strong>{fmt(result.advantage.amount)}</strong> more in retirement
                    ({result.advantage.percent.toFixed(1)}% more value).
                  </div>
                )}
              </div>
            );
          })()}

          {/* OAS clawback warning */}
          {result.oasClawbackRisk && (
            <div className="oas-warning">
              <strong>⚠️ OAS Clawback Risk</strong> — Your projected RRSP balance at retirement could
              generate RRIF withdrawals of approximately {fmt(result.estimatedAnnualRRIFWithdrawal)}/year.
              Withdrawals above ~$91,757 (2024 threshold) trigger OAS recovery tax at 15%.
              Consider a "RRSP meltdown" strategy (drawing down RRSP before age 65) or prioritising
              TFSA contributions to reduce future forced RRIF withdrawals.
            </div>
          )}

          {/* Tax rate comparison */}
          <div className="rate-cards-grid">
            <RateCard
              title="Current Marginal Rate"
              subtitle={`${result.currentRates.provinceName} — income ${fmt(result.inputs.currentIncome)}`}
              combined={result.currentRates.combined}
              federal={result.currentRates.federal}
              provincial={result.currentRates.provincial}
              color="var(--primary)"
            />
            <RateCard
              title="Retirement Marginal Rate"
              subtitle={`Estimated — retirement income ${fmt(result.inputs.expectedRetirementIncome)}`}
              combined={result.retirementRates.combined}
              federal={result.retirementRates.federal}
              provincial={result.retirementRates.provincial}
              color="var(--success)"
            />
          </div>

          {/* Side-by-side comparison */}
          <div className="comparison-cards-grid">
            <ComparisonCard
              title="RRSP Path"
              icon="💰"
              winner={result.advantage.winner === "rrsp"}
              rows={[
                { label: "Gross contribution",     value: fmt(result.rrsp.grossContribution) },
                { label: "Immediate tax refund",   value: fmt(result.rrsp.immediateRefund), highlight: true },
                { label: "Net out-of-pocket cost", value: fmt(result.rrsp.netCost) },
                { label: "RRSP grows to (gross)",  value: fmt(result.rrsp.futureGrossValue) },
                { label: "Tax on withdrawal",      value: `−${fmt(result.rrsp.futureTaxOnWithdrawal)}`, negative: true },
                { label: "RRSP after-tax value",   value: fmt(result.rrsp.futureAfterTaxValue) },
                { label: "Refund (TFSA) grows to", value: fmt(result.rrsp.refundReinvestedTFSA) },
                { label: "Total retirement value", value: fmt(result.rrsp.totalRetirementValue), total: true },
              ]}
            />
            <ComparisonCard
              title="TFSA Path"
              icon="🎁"
              winner={result.advantage.winner === "tfsa"}
              rows={[
                { label: "After-tax contribution", value: fmt(result.tfsa.contribution) },
                { label: "Net out-of-pocket cost", value: fmt(result.tfsa.contribution) },
                { label: "TFSA grows to",          value: fmt(result.tfsa.futureValue) },
                { label: "Tax on withdrawal",      value: "$0 — tax-free", highlight: true },
                { label: "Total retirement value", value: fmt(result.tfsa.totalRetirementValue), total: true },
              ]}
            />
          </div>

          {/* Growth chart */}
          {result.growthTable.length > 0 && (
            <div className="section-card chart-card">
              <h3>Projected Retirement Value Over Time</h3>
              <p className="chart-subtitle">
                At {pct(result.inputs.assumedAnnualReturn)} annual return, same out-of-pocket cost for both.
              </p>
              <div style={{ width: "100%", minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={result.growthTable} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tickFormatter={(v) => `Yr ${v}`} />
                  <YAxis tickFormatter={(v) => fmtCADShort(Number(v))} />
                  <Tooltip formatter={((v: number | undefined) => fmt(v ?? 0)) as any} />
                  <Legend />
                  <Bar dataKey="rrspValue" name="RRSP (after-tax + refund)" fill="#3b82f6" />
                  <Bar dataKey="tfsaValue" name="TFSA" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Key rules of thumb */}
          <div className="section-card">
            <h3>Key Rules of Thumb</h3>
            <div className="tips-grid">
              {[
                { icon: "📈", title: "RRSP wins when…", body: "Your current marginal rate is higher than your retirement rate. Typical for high earners expecting a simpler retirement." },
                { icon: "🎁", title: "TFSA wins when…", body: "Your retirement income will be higher than today (e.g. DB pension, multiple income sources) or you're in a low bracket now." },
                { icon: "⚖️", title: "Both make sense when…", body: "Rates are similar. Max TFSA first for flexibility — TFSA withdrawals don't affect GIS, OAS, or income-tested benefits." },
                { icon: "🔄", title: "RRSP meltdown strategy", body: "If you'll face OAS clawback, draw down RRSP before 65 and shelter the proceeds in your TFSA to reduce future RRIF withdrawals." },
              ].map((card) => (
                <div key={card.title} className="tip-card">
                  <div className="tip-card-icon">{card.icon}</div>
                  <div className="tip-card-title">{card.title}</div>
                  <div className="tip-card-body">{card.body}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

// Labelled range slider with optional hint text
function Slider({
  label, min, max, step, value, onChange, hint,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

// Displays combined marginal rate with federal + provincial breakdown
function RateCard({
  title, subtitle, combined, federal, provincial, color,
}: {
  title: string; subtitle: string; combined: number;
  federal: number; provincial: number; color: string;
}) {
  return (
    <div className="rate-card">
      <div className="rate-card-title">{title}</div>
      <div className="rate-card-sub">{subtitle}</div>
      <div className="rate-card-value" style={{ color }}>{combined.toFixed(1)}%</div>
      <div className="rate-card-breakdown">
        Federal {federal}% + Provincial {provincial}%
      </div>
    </div>
  );
}

// Renders RRSP or TFSA path breakdown rows with winner highlight border
function ComparisonCard({
  title, icon, winner, rows,
}: {
  title: string; icon: string; winner: boolean;
  rows: Array<{ label: string; value: string; highlight?: boolean; negative?: boolean; total?: boolean }>;
}) {
  return (
    <div className={winner ? "comparison-card winner" : "comparison-card"}>
      <div className={winner ? "comparison-header winner-header" : "comparison-header"}>
        <span className="comparison-header-icon">{icon}</span>
        <span className="comparison-header-title">{title}</span>
        {winner && <span className="winner-badge">Winner</span>}
      </div>
      <div className="comparison-body">
        {rows.map((row) => (
          <div key={row.label} className={row.total ? "comparison-row total-row" : "comparison-row"}>
            <span className="comparison-row-label">{row.label}</span>
            <span style={{
              color: row.highlight ? "var(--success)" : row.negative ? "var(--danger)" : row.total ? "var(--primary)" : "inherit",
              fontWeight: row.highlight || row.total ? 600 : 400,
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
