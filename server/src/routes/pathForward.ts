// Path Forward: simulates current/recommended/aggressive money trajectories
// from a user's live financial position.
import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/requireLogin";
import { Debt } from "../models/Debt";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { getLiveFinancials } from "../utils/liveFinancials";
import { simulatePathForward, SimDebtInput } from "../utils/pathForwardSimulator";
import { matchesTrackedDebt, debtNameSet } from "../utils/debtMatching";
import { DEBT_DEFAULTS, amortizedPayment } from "./debts";
import { LIABILITY_TYPES } from "../utils/financeConstants";

const router = Router();
router.use(requireAuth);

// A single current-calendar-month snapshot is too volatile to project 5 years
// forward from (e.g. one big trip or a lump investment contribution this month
// shouldn't be assumed to recur every month) — average over a trailing window
// instead, same 3-month basis getLiveFinancials() already uses for emergencyFundMonths.
async function trailingAvgMonthlyCashFlow(userId: any): Promise<{ avgIncome: number; avgExpense: number }> {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [incTxns, expTxns] = await Promise.all([
    Transaction.find({ userId, type: "income", date: { $gte: threeMonthsAgo, $lte: eom } }),
    Transaction.find({ userId, type: "expense", date: { $gte: threeMonthsAgo, $lte: eom } }),
  ]);

  return {
    avgIncome: incTxns.reduce((s, t) => s + t.amount, 0) / 3,
    avgExpense: expTxns.reduce((s, t) => s + t.amount, 0) / 3,
  };
}

// POST /simulate — body: { extraAggressiveMonthly?: number }
router.post("/simulate", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)._id;
    const extraAggressiveMonthly = Math.max(0, Number(req.body.extraAggressiveMonthly) || 200);

    const [debts, accounts, live, trailing] = await Promise.all([
      Debt.find({ userId }),
      Account.find({ userId }),
      getLiveFinancials(userId),
      trailingAvgMonthlyCashFlow(userId),
    ]);

    // Same tracked-vs-untracked-liability-account split calcNetWorth uses, so
    // the simulator's debt list matches what live.netWorth already reflects.
    const trackedNames = debtNameSet(debts);
    const untrackedLiabAccounts = accounts.filter(
      (a) => LIABILITY_TYPES.has(a.type) && !matchesTrackedDebt(a.name, trackedNames)
    );

    const simDebts: SimDebtInput[] = [
      ...debts.map((d) => ({
        currentBalance: d.currentBalance,
        interestRate: d.interestRate,
        minimumPayment: d.minimumPayment,
      })),
      ...untrackedLiabAccounts.map((a) => {
        const defaults = DEBT_DEFAULTS[a.type] ?? { debtType: "other" as const, interestRate: 10, termMonths: 60, label: a.type };
        return {
          currentBalance: a.balance,
          interestRate: defaults.interestRate,
          minimumPayment: amortizedPayment(a.balance, defaults.interestRate, defaults.termMonths),
        };
      }),
    ];

    const totalDebt = simDebts.reduce((s, d) => s + d.currentBalance, 0);
    const otherNetWorth = live.netWorth - (live.cash - totalDebt);
    const monthlyCashFlow = trailing.avgIncome - trailing.avgExpense;

    const result = simulatePathForward({
      debts: simDebts,
      cash: live.cash,
      monthlyCashFlow,
      otherNetWorth,
      avgMonthlyExpense: trailing.avgExpense,
      extraAggressiveMonthly,
    });

    res.json(result);
  } catch (err: any) {
    console.error("Path Forward simulate error:", err);
    res.status(500).json({ message: err.message || "Simulation failed." });
  }
});

export default router;
