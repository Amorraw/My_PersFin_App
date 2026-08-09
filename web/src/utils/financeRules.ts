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
