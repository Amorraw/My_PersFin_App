import { Account } from "../models/Account";
import { Debt } from "../models/Debt";
import { Property } from "../models/Property";
import { Transaction } from "../models/Transaction";
import { calcNetWorth } from "../routes/netWorth";
import { ASSET_CASH_TYPES } from "./financeConstants";

export interface LiveFinancials {
  totalAssets: number;
  totalLiabilities: number;
  totalDebt: number;
  netWorth: number;
  cash: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyCashFlow: number;
  savingsRate: number;
  debtRatio: number;
  emergencyFundMonths: number;
}

/**
 * The one place every route computes a user's live financial position from —
 * net worth (via calcNetWorth, which includes real estate) plus month-to-date
 * cash flow and a trailing-3-month emergency fund estimate. Callers that need
 * "real surplus" or "real net worth" should use this instead of re-querying
 * Account/Debt/Transaction and reimplementing the math.
 */
export async function getLiveFinancials(userId: any): Promise<LiveFinancials> {
  const now = new Date();
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const [accounts, debts, properties, incTxns, expTxns, pastExp] = await Promise.all([
    Account.find({ userId }),
    Debt.find({ userId }),
    Property.find({ userId }),
    Transaction.find({ userId, type: "income", date: { $gte: som, $lte: eom } }),
    Transaction.find({ userId, type: "expense", date: { $gte: som, $lte: eom } }),
    Transaction.find({ userId, type: "expense", date: { $gte: threeMonthsAgo, $lte: eom } }),
  ]);

  const { totalAssets, totalLiabilities, netWorth } = calcNetWorth(accounts, debts, properties);

  const cash = accounts
    .filter((a) => ASSET_CASH_TYPES.has(a.type))
    .reduce((s, a) => s + a.balance, 0);

  const monthlyIncome = incTxns.reduce((s, t) => s + t.amount, 0);
  const monthlyExpenses = expTxns.reduce((s, t) => s + t.amount, 0);
  const monthlyCashFlow = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (monthlyCashFlow / monthlyIncome) * 100 : 0;
  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  const avgMonthlyExp = pastExp.reduce((s, t) => s + t.amount, 0) / 3;
  const emergencyFundMonths = avgMonthlyExp > 0 ? cash / avgMonthlyExp : 0;

  return {
    totalAssets,
    totalLiabilities,
    totalDebt: totalLiabilities,
    netWorth,
    cash,
    monthlyIncome,
    monthlyExpenses,
    monthlyCashFlow,
    savingsRate,
    debtRatio,
    emergencyFundMonths,
  };
}
