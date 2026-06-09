// Account type constants shared across pages.
// Import from here instead of redefining locally.

/** Account types that represent liabilities (negative net worth contribution). */
export const LIABILITY_TYPES = new Set([
  "credit-card", "line-of-credit", "student-loan",
  "mortgage", "auto-loan", "personal-loan",
]);

/**
 * Account types classified as "debt" for the Transactions tab filter.
 * Distinct from DEBT_PRODUCT_TYPES in Debts.tsx — credit-card gets its own tab
 * there, and line-of-credit is a debt tab account but not a tracked debt product.
 */
export const DEBT_ACCOUNT_TYPES = new Set([
  "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan",
]);

/** Account types classified as investments for the Transactions tab filter. */
export const INVESTMENT_TYPES = new Set(["tfsa", "rrsp", "gic", "investment"]);

/** Human-readable display labels for account type strings. */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  chequing: "Chequing", checking: "Checking", savings: "Savings",
  "credit-card": "Credit Card", "line-of-credit": "LOC",
  tfsa: "TFSA", rrsp: "RRSP", fhsa: "FHSA", gic: "GIC",
  "student-loan": "Student Loan", mortgage: "Mortgage",
  "auto-loan": "Auto Loan", "personal-loan": "Personal Loan",
  investment: "Investment", other: "Other",
};
