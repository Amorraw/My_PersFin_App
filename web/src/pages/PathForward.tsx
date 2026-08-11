import { useState } from "react";
import { api } from "../api";
import { useFinancialData } from "../contexts/FinancialDataContext";
import { financialHealthTier, TIER_LABELS, TIER_COLORS, emergencyFundStatus } from "../utils/financeRules";
import { fmtCAD, fmtMonth } from "../utils/formatters";
import { TrendAreaChart } from "../components/charts";
import type { TrendSeries } from "../components/charts";
import "./PathForward.css";

const TIER_MESSAGE: Record<string, string> = {
  crisis: "Your spending currently exceeds your income and your net worth is negative. The priority right now is stopping the bleeding, not optimizing.",
  struggling: "You're keeping your head above water, but a thin emergency fund or high-interest debt leaves little room for a surprise expense.",
  stable: "The basics are covered. From here, the fastest wins usually come from clearing any remaining high-interest debt and building your emergency fund.",
  growing: "Your foundation is solid — emergency fund and debt are under control. This is the stage where consistent investing starts to compound.",
  thriving: "Strong position across the board: funded emergency reserve, no high-interest debt, and a positive monthly surplus.",
};

interface MonthPoint { month: string; debt: number; cash: number; netWorth: number; }
interface PathMilestones {
  highInterestDebtClearedMonth: number | null;
  emergencyFundFundedMonth: number | null;
  netWorthPositiveMonth: number | null;
}
interface PathResult { monthly: MonthPoint[]; milestones: PathMilestones; }
interface SimResult {
  current: PathResult;
  recommended: PathResult;
  aggressive: PathResult;
  hasStructuralShortfall: boolean;
}

const PATH_SERIES: TrendSeries[] = [
  { key: "current", label: "Current Trajectory", color: "#9ca3af" },
  { key: "recommended", label: "Recommended Plan", color: "#2563eb" },
  { key: "aggressive", label: "Aggressive Plan", color: "#16a34a", dashed: true },
];

const PATH_RATIONALE: Record<string, string> = {
  current: "No change in behavior — surplus (if any) just accumulates unmanaged, and debt keeps costing whatever it costs today.",
  recommended: "Every dollar of surplus clears your highest-rate debt first, then builds a 6-month emergency reserve — avoiding interest is a guaranteed return no investment can promise.",
  aggressive: "Same priority order as the recommended plan, plus your extra monthly amount added on top — the fastest of the three, if it's sustainable for your budget.",
};

const MILESTONE_ROWS: { key: keyof PathMilestones; label: string; shortLabel: string }[] = [
  { key: "highInterestDebtClearedMonth", label: "High-Interest Debt Cleared", shortLabel: "Debt-free" },
  { key: "emergencyFundFundedMonth", label: "Emergency Fund Funded", shortLabel: "EF funded" },
  { key: "netWorthPositiveMonth", label: "Net Worth Positive", shortLabel: "NW+" },
];

function milestoneText(monthIndex: number | null, monthly: MonthPoint[]): string {
  if (monthIndex === null) return "Beyond 5 years";
  if (monthIndex === 0) return "Already achieved";
  const point = monthly[monthIndex - 1];
  return point ? fmtMonth(point.month) : "—";
}

export default function PathForward() {
  const { loading, netWorth, monthlySurplus, emergencyFundMonths, hasHighInterestDebt, highInterestDebts } = useFinancialData();

  const [extraAggressiveMonthly, setExtraAggressiveMonthly] = useState(200);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const runSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const data: SimResult = await api("/path-forward/simulate", {
        method: "POST",
        body: JSON.stringify({ extraAggressiveMonthly }),
      });
      setSimResult(data);
    } catch (err: any) {
      setSimError(err.message || "Simulation failed.");
    } finally {
      setSimLoading(false);
    }
  };

  if (loading || !netWorth) {
    return <div style={{ padding: 16, color: "var(--text-light)" }}>Loading your financial standing…</div>;
  }

  const tier = financialHealthTier({
    netWorth: netWorth.netWorth,
    monthlySurplus,
    emergencyFundMonths,
    hasHighInterestDebt,
  });
  const efStatus = emergencyFundStatus(emergencyFundMonths);

  const chartData = simResult
    ? simResult.current.monthly.map((p, i) => ({
        month: p.month,
        current: p.netWorth,
        recommended: simResult.recommended.monthly[i]?.netWorth,
        aggressive: simResult.aggressive.monthly[i]?.netWorth,
      }))
    : [];

  const recommendedReferenceLines = simResult
    ? MILESTONE_ROWS
        .map((row) => ({ month: simResult.recommended.milestones[row.key], label: row.shortLabel }))
        .filter((m): m is { month: number; label: string } => m.month !== null && m.month > 0)
        .map(({ month, label }) => ({ x: simResult.recommended.monthly[month - 1]?.month, label, color: "#2563eb" }))
        .filter((rl) => rl.x)
    : [];

  return (
    <div className="path-forward-container">
      <div className="path-forward-header">
        <h1>Path Forward</h1>
        <p>Where you stand today, and the fastest realistic route to a stronger position.</p>
      </div>

      <div className="tier-card" style={{ borderColor: TIER_COLORS[tier] }}>
        <div className="tier-badge" style={{ background: TIER_COLORS[tier] }}>
          {TIER_LABELS[tier]}
        </div>
        <p className="tier-message">{TIER_MESSAGE[tier]}</p>

        <div className="tier-signals">
          <div className="signal">
            <span className="signal-label">Net Worth</span>
            <span className="signal-value" style={{ color: netWorth.netWorth >= 0 ? "var(--success)" : "var(--danger)" }}>
              {fmtCAD(netWorth.netWorth)}
            </span>
          </div>
          <div className="signal">
            <span className="signal-label">Monthly Surplus</span>
            <span className="signal-value" style={{ color: monthlySurplus > 0 ? "var(--success)" : "var(--danger)" }}>
              {fmtCAD(monthlySurplus)}
            </span>
          </div>
          <div className="signal">
            <span className="signal-label">Emergency Fund</span>
            <span className="signal-value">{emergencyFundMonths.toFixed(1)} months ({efStatus})</span>
          </div>
          <div className="signal">
            <span className="signal-label">High-Interest Debt</span>
            <span className="signal-value" style={{ color: hasHighInterestDebt ? "var(--danger)" : "var(--success)" }}>
              {hasHighInterestDebt ? `${highInterestDebts.length} account${highInterestDebts.length === 1 ? "" : "s"}` : "None"}
            </span>
          </div>
        </div>
      </div>

      <div className="planning-section" style={{ marginTop: 16 }}>
        <div className="sim-controls-row">
          <div>
            <h2>📈 Simulated Recovery Paths</h2>
            <p className="note" style={{ marginBottom: 0 }}>
              5-year projection comparing no behavior change against a debt-first, emergency-fund-second plan.
            </p>
          </div>
          <div className="sim-controls">
            <label className="sim-extra-label" htmlFor="extra-aggressive">
              Aggressive plan extra $/mo
            </label>
            <input
              id="extra-aggressive"
              type="number"
              min={0}
              step={50}
              value={extraAggressiveMonthly}
              onChange={(e) => setExtraAggressiveMonthly(Math.max(0, Number(e.target.value)))}
            />
            <button className="sim-run-btn" onClick={runSimulation} disabled={simLoading}>
              {simLoading ? "Simulating…" : "Run Simulation"}
            </button>
          </div>
        </div>

        {simError && <p className="note" style={{ color: "var(--danger)" }}>⚠ {simError}</p>}

        {simResult && (
          <>
            {simResult.hasStructuralShortfall && (
              <div className="shortfall-banner">
                ⚠️ Your average monthly expenses currently exceed your income. The recommended and aggressive
                plans optimize what to do with a surplus, but neither can fix an income-below-expenses gap on
                its own — consider ways to raise income or reduce expenses first.
              </div>
            )}

            <TrendAreaChart
              data={chartData}
              series={PATH_SERIES}
              xKey="month"
              referenceLines={recommendedReferenceLines}
            />

            <div className="path-milestone-grid">
              {(["current", "recommended", "aggressive"] as const).map((key) => (
                <div key={key} className="path-milestone-card">
                  <h3 style={{ color: PATH_SERIES.find((s) => s.key === key)!.color }}>
                    {PATH_SERIES.find((s) => s.key === key)!.label}
                  </h3>
                  {MILESTONE_ROWS.map((row) => (
                    <div key={row.key} className="milestone-row">
                      <span className="milestone-row-label">{row.label}</span>
                      <span className="milestone-row-value">{milestoneText(simResult[key].milestones[row.key], simResult[key].monthly)}</span>
                    </div>
                  ))}
                  <p className="path-rationale">{PATH_RATIONALE[key]}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
