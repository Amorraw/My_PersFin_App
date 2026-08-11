// Mirrors server/src/utils/financeConstants.ts — kept in sync by hand since
// frontend and backend don't share a module boundary.
export const HIGH_INTEREST_DEBT_APR = 15;
export const EMERGENCY_FUND_TARGET_MONTHS = 6;
export const EMERGENCY_FUND_MIN_TO_INVEST_MONTHS = 3;

export type EmergencyFundStatus = "critical" | "building" | "adequate" | "funded";

export function emergencyFundStatus(months: number): EmergencyFundStatus {
  if (months < 1) return "critical";
  if (months < EMERGENCY_FUND_MIN_TO_INVEST_MONTHS) return "building";
  if (months < EMERGENCY_FUND_TARGET_MONTHS) return "adequate";
  return "funded";
}

export type FinancialHealthTier = "crisis" | "struggling" | "stable" | "growing" | "thriving";

export const TIER_LABELS: Record<FinancialHealthTier, string> = {
  crisis: "Crisis",
  struggling: "Struggling",
  stable: "Stable",
  growing: "Growing",
  thriving: "Thriving",
};

export const TIER_COLORS: Record<FinancialHealthTier, string> = {
  crisis: "#dc2626",
  struggling: "#f97316",
  stable: "#d97706",
  growing: "#059669",
  thriving: "#16a34a",
};

/**
 * Single-tier read of overall financial standing from the same live signals
 * already computed elsewhere (FinancialDataContext) — no new data source.
 * Deliberately coarse (5 tiers): this drives an at-a-glance alert/badge, not
 * a precise score. Order of checks matters — each condition below assumes
 * the ones above it were already false.
 */
export function financialHealthTier(input: {
  netWorth: number;
  monthlySurplus: number;
  emergencyFundMonths: number;
  hasHighInterestDebt: boolean;
}): FinancialHealthTier {
  const { netWorth, monthlySurplus, emergencyFundMonths, hasHighInterestDebt } = input;
  const efStatus = emergencyFundStatus(emergencyFundMonths);

  if (netWorth < 0 && monthlySurplus <= 0) return "crisis";
  if (monthlySurplus <= 0 || efStatus === "critical" || hasHighInterestDebt) return "struggling";
  if (efStatus === "funded" && !hasHighInterestDebt && netWorth > 0) {
    return monthlySurplus > 0 ? "thriving" : "growing";
  }
  if (efStatus === "adequate" && netWorth >= 0) return "growing";
  return "stable";
}
