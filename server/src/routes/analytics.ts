// Analytics routes: spending breakdowns, trends, budget comparisons, and dashboard KPIs

import { Router, Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Account } from "../models/Account";
import { Debt } from "../models/Debt";
import { Goal } from "../models/Goal";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { requireAuth } from "../middleware/requireLogin";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Account types that represent liabilities, not assets.
// Must stay in sync with the same constant in netWorth.ts and Accounts.tsx.
const LIABILITY_TYPES = new Set([
  'credit-card', 'line-of-credit', 'mortgage',
  'auto-loan', 'personal-loan', 'student-loan',
]);

// GET /spending-by-category — group expense totals by category for a date range
router.get("/spending-by-category", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { startDate, endDate } = req.query;

    const filter: any = { userId, type: "expense" };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    } else {
      // Default to current month
      const now = new Date();
      filter.date = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0)
      };
    }

    const transactions = await Transaction.find(filter);

    // Group by category
    const byCategory: { [key: string]: number } = {};
    transactions.forEach(t => {
      const cat = t.category || "Uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + t.amount;
    });

    // Convert to array and sort by amount
    const categories = Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const totalSpending = categories.reduce((sum, c) => sum + c.amount, 0);

    return res.json({ categories, totalSpending });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /spending-trends — monthly income, expenses, and net savings for the last N months
router.get("/spending-trends", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { months = 6 } = req.query;

    const monthsCount = parseInt(months as string);
    const trends = [];

    for (let i = monthsCount - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const [expenses, income] = await Promise.all([
        Transaction.find({
          userId,
          type: "expense",
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }),
        Transaction.find({
          userId,
          type: "income",
          date: { $gte: startOfMonth, $lte: endOfMonth }
        })
      ]);

      const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
      const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);

      trends.push({
        month: startOfMonth.toISOString().substring(0, 7), // YYYY-MM format
        income: totalIncome,
        expenses: totalExpenses,
        netSavings: totalIncome - totalExpenses
      });
    }

    return res.json(trends);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /budget-comparison — actual spending vs budget amount per category this month
router.get("/budget-comparison", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const now = new Date();

    // Get current budgets
    const budgets = await Budget.find({
      userId,
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gte: now } }
      ]
    });

    const comparison = [];

    for (const budget of budgets) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const transactions = await Transaction.find({
        userId,
        category: budget.category,
        type: "expense",
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const spent = transactions.reduce((sum, t) => sum + t.amount, 0);
      const remaining = budget.amount - spent;
      const percentUsed = (spent / budget.amount) * 100;

      comparison.push({
        category: budget.category,
        budgeted: budget.amount,
        spent,
        remaining,
        percentUsed: Math.round(percentUsed),
        isOverBudget: spent > budget.amount
      });
    }

    // Sort by percent used (highest first)
    comparison.sort((a, b) => b.percentUsed - a.percentUsed);

    return res.json(comparison);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /overview — high-level totals: balance, debt, net worth, monthly income/expenses, savings rate
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [accounts, debts, monthlyExpenses, monthlyIncome] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Transaction.find({
        userId,
        type: "expense",
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }),
      Transaction.find({
        userId,
        type: "income",
        date: { $gte: startOfMonth, $lte: endOfMonth }
      })
    ]);

    const totalBalance = accounts
      .filter(a => !LIABILITY_TYPES.has(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    const accountLiabilities = accounts
      .filter(a => LIABILITY_TYPES.has(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0) + accountLiabilities;
    const netWorth = totalBalance - totalDebt;

    const totalMonthlyExpenses = monthlyExpenses.reduce((sum, t) => sum + t.amount, 0);
    const totalMonthlyIncome = monthlyIncome.reduce((sum, t) => sum + t.amount, 0);
    const monthlySavings = totalMonthlyIncome - totalMonthlyExpenses;
    const savingsRate = totalMonthlyIncome > 0
      ? ((monthlySavings / totalMonthlyIncome) * 100).toFixed(1)
      : "0";

    return res.json({
      totalBalance,
      totalDebt,
      netWorth,
      monthlyIncome: totalMonthlyIncome,
      monthlyExpenses: totalMonthlyExpenses,
      monthlySavings,
      savingsRate: parseFloat(savingsRate),
      accountsCount: accounts.length,
      debtsCount: debts.length
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /excess-spending — return over-budget categories and near-limit (>80%) warnings
router.get("/excess-spending", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get budgets
    const budgets = await Budget.find({
      userId,
      startDate: { $lte: now },
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gte: now } }
      ]
    });

    const alerts = [];

    for (const budget of budgets) {
      const transactions = await Transaction.find({
        userId,
        category: budget.category,
        type: "expense",
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const spent = transactions.reduce((sum, t) => sum + t.amount, 0);

      if (spent > budget.amount) {
        alerts.push({
          category: budget.category,
          budgeted: budget.amount,
          spent,
          excess: spent - budget.amount,
          percentOver: Math.round(((spent - budget.amount) / budget.amount) * 100),
          severity: "high"
        });
      } else if (spent > budget.amount * 0.8) {
        // Warning if over 80% of budget
        alerts.push({
          category: budget.category,
          budgeted: budget.amount,
          spent,
          remaining: budget.amount - spent,
          percentUsed: Math.round((spent / budget.amount) * 100),
          severity: "low",
          warning: "Approaching budget limit"
        });
      }
    }

    return res.json(alerts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /categorize-suggestion — infer a category from a transaction description string
router.post("/categorize-suggestion", async (req: Request, res: Response) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ message: "Description is required" });
    }

    const { categorizeTransaction } = await import("../utils/categorization");
    const suggestedCategory = categorizeTransaction(description);

    return res.json({ suggestedCategory });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /cash-flow-history — monthly income / expenses / net for the last N months (max 36)
router.get("/cash-flow-history", async (req: Request, res: Response) => {
  try {
    const userId  = (req.user as any).id;
    const months  = Math.min(parseInt((req.query.months as string) || "12"), 36);
    const results = [];

    for (let i = months - 1; i >= 0; i--) {
      const ref   = new Date();
      ref.setDate(1);
      ref.setMonth(ref.getMonth() - i);
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const end   = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59);

      const [expTxns, incTxns] = await Promise.all([
        Transaction.find({ userId, type: "expense", date: { $gte: start, $lte: end } }),
        Transaction.find({ userId, type: "income",  date: { $gte: start, $lte: end } }),
      ]);

      const expenses = expTxns.reduce((s, t) => s + t.amount, 0);
      const income   = incTxns.reduce((s, t) => s + t.amount, 0);

      results.push({
        month:    start.toISOString().substring(0, 7),
        income:   Math.round(income   * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        net:      Math.round((income - expenses) * 100) / 100,
      });
    }

    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

const DEBT_COLORS: Record<string, string> = {
  "mortgage":      "#3B82F6",
  "credit-card":   "#EF4444",
  "auto-loan":     "#F97316",
  "student-loan":  "#8B5CF6",
  "personal-loan": "#F59E0B",
  "other":         "#9CA3AF",
};

function monthsToPayoff(balance: number, annualRate: number, monthlyPayment: number): number | null {
  if (balance <= 0 || monthlyPayment <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.ceil(balance / monthlyPayment);
  const interest = balance * r;
  if (monthlyPayment <= interest) return null; // never paid off at minimum
  return Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
}

// GET /debt-summary — debts by type with balances, average rate, and payoff projections
router.get("/debt-summary", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const debts  = await Debt.find({ userId });

    const byTypeMap: Record<string, number> = {};
    debts.forEach(d => {
      byTypeMap[d.type] = (byTypeMap[d.type] || 0) + d.currentBalance;
    });

    const byType = Object.entries(byTypeMap).map(([type, balance]) => ({
      name:  type.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      value: Math.round(balance * 100) / 100,
      color: DEBT_COLORS[type] ?? "#9CA3AF",
    }));

    const total   = debts.reduce((s, d) => s + d.currentBalance, 0);
    const avgRate = debts.length
      ? debts.reduce((s, d) => s + d.interestRate * d.currentBalance, 0) / (total || 1)
      : 0;

    const projections = debts.map(d => {
      const months = monthsToPayoff(d.currentBalance, d.interestRate, d.minimumPayment);
      return {
        name:           d.name,
        type:           d.type,
        balance:        Math.round(d.currentBalance * 100) / 100,
        rate:           d.interestRate,
        monthlyPayment: d.minimumPayment,
        monthsToPayoff: months,
        payoffDate:     months != null
          ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 7)
          : null,
        color: DEBT_COLORS[d.type] ?? "#9CA3AF",
      };
    }).sort((a, b) => b.rate - a.rate);

    return res.json({
      byType,
      total:   Math.round(total   * 100) / 100,
      avgRate: Math.round(avgRate * 10)  / 10,
      projections,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

const ASSET_GROUPS: Record<string, { label: string; color: string }> = {
  "chequing":   { label: "Cash",        color: "#6EE7B7" },
  "checking":   { label: "Cash",        color: "#6EE7B7" },
  "savings":    { label: "Cash",        color: "#6EE7B7" },
  "tfsa":       { label: "TFSA",        color: "#34D399" },
  "rrsp":       { label: "RRSP",        color: "#A78BFA" },
  "gic":        { label: "GIC",         color: "#60A5FA" },
  "investment": { label: "Investments", color: "#3B82F6" },
  "other":      { label: "Other",       color: "#9CA3AF" },
};
// GET /investment-allocation — group asset account balances by financial category (Cash, TFSA, etc.)
router.get("/investment-allocation", async (req: Request, res: Response) => {
  try {
    const userId   = (req.user as any).id;
    const accounts = await Account.find({ userId });

    const totals: Record<string, { value: number; color: string }> = {};

    accounts.forEach(acc => {
      if (LIABILITY_TYPES.has(acc.type) || acc.balance <= 0) return;
      const group = ASSET_GROUPS[acc.type] ?? { label: "Other", color: "#9CA3AF" };
      if (!totals[group.label]) totals[group.label] = { value: 0, color: group.color };
      totals[group.label].value += acc.balance;
    });

    const allocation = Object.entries(totals)
      .map(([name, { value, color }]) => ({ name, value: Math.round(value * 100) / 100, color }))
      .sort((a, b) => b.value - a.value);

    return res.json(allocation);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /goals-progress — active goals with progress %, days remaining, and monthly amount needed
router.get("/goals-progress", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const goals  = await Goal.find({ userId, status: "active" });

    const now = Date.now();
    const data = goals.map(g => {
      const pct        = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
      const daysLeft   = Math.max(0, Math.ceil((g.targetDate.getTime() - now) / (1000 * 60 * 60 * 24)));
      const remaining  = Math.max(0, g.targetAmount - g.currentAmount);
      const monthsLeft = daysLeft / 30.44;
      const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining;

      return {
        name:           g.name,
        category:       g.category,
        target:         Math.round(g.targetAmount  * 100) / 100,
        current:        Math.round(g.currentAmount * 100) / 100,
        pct:            Math.round(pct * 10) / 10,
        daysLeft,
        monthlyNeeded:  Math.round(monthlyNeeded * 100) / 100,
        priority:       g.priority,
      };
    }).sort((a, b) => b.pct - a.pct);

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /financial-snapshot — comprehensive dashboard KPIs including emergency fund months and net worth trend
router.get("/financial-snapshot", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const now    = new Date();
    const som    = new Date(now.getFullYear(), now.getMonth(), 1);
    const eom    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Run all queries in parallel
    const [accounts, debts, goals, incTxns, expTxns, snapshots] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Goal.find({ userId, status: "active" }),
      Transaction.find({ userId, type: "income",  date: { $gte: som, $lte: eom } }),
      Transaction.find({ userId, type: "expense", date: { $gte: som, $lte: eom } }),
      NetWorthSnapshot.find({ userId }).sort({ snapshotDate: -1 }).limit(6),
    ]);

    // Asset / liability split from accounts
    const assets = accounts
      .filter(a => !LIABILITY_TYPES.has(a.type))
      .reduce((s, a) => s + a.balance, 0);

    const accountLiabilities = accounts
      .filter(a => LIABILITY_TYPES.has(a.type))
      .reduce((s, a) => s + a.balance, 0);

    const totalDebt        = debts.reduce((s, d) => s + d.currentBalance, 0) + accountLiabilities;
    const totalLiabilities = totalDebt;
    const netWorth         = assets - totalLiabilities;

    // Cash for emergency fund (chequing + savings)
    const cash = accounts
      .filter(a => ["chequing","checking","savings"].includes(a.type))
      .reduce((s, a) => s + a.balance, 0);

    // Monthly figures
    const monthlyIncome   = incTxns.reduce((s, t) => s + t.amount, 0);
    const monthlyExpenses = expTxns.reduce((s, t) => s + t.amount, 0);
    const monthlyCashFlow = monthlyIncome - monthlyExpenses;
    const savingsRate     = monthlyIncome > 0 ? (monthlyCashFlow / monthlyIncome) * 100 : 0;
    const debtRatio       = assets > 0 ? (totalDebt / assets) * 100 : 0;

    // Avg monthly expenses over last 3 months for emergency fund calc
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const pastExp = await Transaction.find({
      userId, type: "expense", date: { $gte: threeMonthsAgo, $lte: eom },
    });
    const avgMonthlyExp       = pastExp.reduce((s, t) => s + t.amount, 0) / 3;
    const emergencyFundMonths = avgMonthlyExp > 0 ? cash / avgMonthlyExp : 0;

    // Net worth trend: delta vs previous month (snapshots arrive newest-first)
    const netWorthTrend = snapshots.length >= 2
      ? snapshots[0].netWorth - snapshots[1].netWorth
      : 0;

    // Goals aggregate
    const goalsProgress = goals.length
      ? goals.reduce((s, g) => s + (g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0), 0) / goals.length
      : 0;

    return res.json({
      netWorth:            Math.round(netWorth         * 100) / 100,
      totalAssets:         Math.round(assets           * 100) / 100,
      totalLiabilities:    Math.round(totalLiabilities * 100) / 100,
      totalDebt:           Math.round(totalDebt        * 100) / 100,
      monthlyIncome:       Math.round(monthlyIncome    * 100) / 100,
      monthlyExpenses:     Math.round(monthlyExpenses  * 100) / 100,
      monthlyCashFlow:     Math.round(monthlyCashFlow  * 100) / 100,
      savingsRate:         Math.round(savingsRate       * 10) / 10,
      debtRatio:           Math.round(debtRatio         * 10) / 10,
      emergencyFundMonths: Math.round(emergencyFundMonths * 10) / 10,
      netWorthTrend,
      activeGoals:    goals.length,
      goalsProgress:  Math.round(goalsProgress * 10) / 10,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
