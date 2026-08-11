// Account types that represent liabilities, not assets.
// Single source of truth — netWorth.ts and analytics.ts both import this
// instead of keeping their own copies in sync by hand.
export const LIABILITY_TYPES = new Set([
  "credit-card", "line-of-credit", "mortgage",
  "auto-loan", "personal-loan", "student-loan",
]);

export const ASSET_CASH_TYPES = new Set(["chequing", "checking", "savings"]);
export const ASSET_INVEST_TYPES = new Set(["investment", "tfsa", "rrsp", "gic"]);

// A debt at or above this rate is "high interest" for gating purposes
// (credit cards / consumer debt tier per the avalanche-first framework rule).
export const HIGH_INTEREST_DEBT_APR = 15;

// Framework's recommended fully-funded emergency reserve.
export const EMERGENCY_FUND_TARGET_MONTHS = 6;

// Minimum reserve before prioritizing extra debt payments or investing risk.
export const EMERGENCY_FUND_MIN_TO_INVEST_MONTHS = 3;

// Mirrors web/src/utils/financeRules.ts — kept in sync by hand since frontend
// and backend don't share a module boundary.

export type EmergencyFundStatus = "critical" | "building" | "adequate" | "funded";

export function emergencyFundStatus(months: number): EmergencyFundStatus {
  if (months < 1) return "critical";
  if (months < EMERGENCY_FUND_MIN_TO_INVEST_MONTHS) return "building";
  if (months < EMERGENCY_FUND_TARGET_MONTHS) return "adequate";
  return "funded";
}

export type FinancialHealthTier = "crisis" | "struggling" | "stable" | "growing" | "thriving";

/**
 * Single-tier read of overall financial standing from the same live signals
 * already computed elsewhere (getLiveFinancials) — no new data source.
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
