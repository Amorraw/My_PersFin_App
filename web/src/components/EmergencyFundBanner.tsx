import { useFinancialData } from "../contexts/FinancialDataContext";
import { EMERGENCY_FUND_TARGET_MONTHS, EMERGENCY_FUND_MIN_TO_INVEST_MONTHS } from "../utils/financeRules";

const STATUS_CONFIG = {
  critical: { color: "#EF4444", icon: "⚠️", label: "Critical" },
  building: { color: "#F59E0B", icon: "🔶", label: "Building" },
  adequate: { color: "#3B82F6", icon: "🔵", label: "Adequate" },
  funded:   { color: "#10B981", icon: "✅", label: "Funded" },
} as const;

const STATUS_MESSAGE: Record<keyof typeof STATUS_CONFIG, string> = {
  critical: `— build a starter reserve before prioritizing extra debt payments or investing.`,
  building: `— the framework recommends at least ${EMERGENCY_FUND_MIN_TO_INVEST_MONTHS} months before committing your full surplus elsewhere.`,
  adequate: `— you're past the minimum; consider building toward the ${EMERGENCY_FUND_TARGET_MONTHS}-month target.`,
  funded:   `— you're at or above the ${EMERGENCY_FUND_TARGET_MONTHS}-month target.`,
};

/** Reusable framework-rule callout: build a reserve before aggressive debt payoff or investing. */
export function EmergencyFundBanner() {
  const { snapshot, emergencyFundMonths, emergencyFundStatus, loading } = useFinancialData();

  // Nothing to warn about yet — no expense history to judge a reserve against.
  if (loading || !snapshot || snapshot.monthlyExpenses <= 0) return null;

  const cfg = STATUS_CONFIG[emergencyFundStatus];

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        marginBottom: "1rem",
        borderLeft: `4px solid ${cfg.color}`,
      }}
    >
      <span style={{ fontSize: 18 }}>{cfg.icon}</span>
      <span style={{ fontSize: 13 }}>
        <strong style={{ color: cfg.color }}>
          {emergencyFundMonths.toFixed(1)} month{emergencyFundMonths === 1 ? "" : "s"} of expenses saved ({cfg.label})
        </strong>{" "}
        <span style={{ color: "var(--text-light)" }}>{STATUS_MESSAGE[emergencyFundStatus]}</span>
      </span>
    </div>
  );
}
