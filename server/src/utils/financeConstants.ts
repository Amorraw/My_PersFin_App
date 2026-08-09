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
