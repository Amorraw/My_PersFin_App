// Shared TypeScript interfaces for API responses and domain models
export interface CategoryNode {
  key: string;
  name: string;
}

export interface CategoryMajor {
  key: string;
  name: string;
  subcategories: CategoryNode[];
}
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  province?: string;
  demoProfileIndex?: number | null;
}

export interface Account {
  _id: string;
  userId: string;
  name: string;
  type: "chequing" | "savings" | "credit-card" | "tfsa" | "rrsp" | "gic" | "line-of-credit" | "student-loan" | "mortgage" | "auto-loan" | "personal-loan" | "investment" | "other";
  balance: number;
  currency: string;
  createdAt: string;
}

export interface Transaction {
  _id: string;
  userId: string;
  accountId: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  category?: string;
  description?: string;
  date: string;
  createdAt: string;
}

export interface Budget {
  _id: string;
  userId: string;
  category: string;
  categoryKey?: string;
  majorCategoryKey?: string;
  majorCategoryName?: string;
  amount: number;
  period: "biweekly" | "monthly" | "yearly";
  rolloverMode?: "none" | "carry-unused" | "carry-net";
  isActive?: boolean;
  startDate: string;
  endDate?: string;
  createdAt: string;
}

export interface Debt {
  _id: string;
  userId: string;
  name: string;
  type: "credit-card" | "student-loan" | "mortgage" | "auto-loan" | "personal-loan" | "other";
  principal: number;
  currentBalance: number;
  interestRate: number;
  minimumPayment: number;
  dueScheduleType?: "specific" | "monthly" | "biweekly";
  dueDate?: string;
  nextDueDate?: string;
  accountNumber?: string;
  lender?: string;
  createdAt: string;
}

export interface SpendingByCategory {
  category: string;
  amount: number;
}

export interface SpendingTrend {
  month: string;
  income: number;
  expenses: number;
  netSavings: number;
}

export interface BudgetComparison {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
}

export interface FinancialOverview {
  totalBalance: number;
  totalDebt: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  savingsRate: number;
  accountsCount: number;
  debtsCount: number;
}

export interface PayoffStrategy {
  cadence?: "monthly" | "biweekly";
  paymentPerCadence?: number;
  extraPerCadence?: number;
  method: "avalanche" | "snowball";
  totalMonths: number;
  totalYears: string;
  totalInterestPaid: number;
  payoffSchedule: Array<{
    debtId: string;
    debtName: string;
    payoffMonth: number;
  }>;
  monthlyPayment: number;
}








