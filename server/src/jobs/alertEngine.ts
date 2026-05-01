import mongoose from "mongoose";
import Notification, { AlertCategory } from "../models/Notification";
import { Bill } from "../models/Bill";
import { Budget } from "../models/Budget";
import { Transaction } from "../models/Transaction";
import { TaxAccount } from "../models/TaxAccount";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";

const NET_WORTH_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];

async function upsertAlert(
  userId: mongoose.Types.ObjectId,
  category: AlertCategory,
  title: string,
  message: string,
  severity: "info" | "warning" | "critical",
  dedupKey: string
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await Notification.findOne({
    userId,
    category,
    relatedId: dedupKey,
    isDismissed: false,
    createdAt: { $gte: today },
  });

  if (!existing) {
    await Notification.create({ userId, category, title, message, severity, relatedId: dedupKey });
  }
}

export async function runAlertEngine(userId: mongoose.Types.ObjectId) {
  await Promise.all([
    checkBills(userId),
    checkBudgets(userId),
    checkTaxAccounts(userId),
    checkNetWorthMilestones(userId),
    checkSpendingSpike(userId),
  ]);
}

async function checkBills(userId: mongoose.Types.ObjectId) {
  const bills = await Bill.find({ userId: userId.toString(), status: "active" });
  const today = new Date();
  const todayDay = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  for (const bill of bills) {
    const dueDay: number = (bill as any).dueDate;
    const reminderDays: number = (bill as any).reminderDaysBefore ?? 7;
    let daysUntilDue = dueDay - todayDay;
    if (daysUntilDue < 0) daysUntilDue += daysInMonth;

    const key = `bill-${bill._id}-${today.getFullYear()}-${today.getMonth()}`;
    if (daysUntilDue <= 1) {
      await upsertAlert(
        userId,
        "bill",
        `Bill Due Today/Tomorrow: ${(bill as any).name}`,
        `Your ${(bill as any).name} bill of $${(bill as any).amount?.toFixed(2)} is due in ${daysUntilDue} day(s).`,
        "critical",
        key
      );
    } else if (daysUntilDue <= reminderDays) {
      await upsertAlert(
        userId,
        "bill",
        `Upcoming Bill: ${(bill as any).name}`,
        `Your ${(bill as any).name} bill of $${(bill as any).amount?.toFixed(2)} is due in ${daysUntilDue} days.`,
        "warning",
        key
      );
    }
  }
}

async function checkBudgets(userId: mongoose.Types.ObjectId) {
  const budgets = await Budget.find({ userId, isActive: true });
  if (!budgets.length) return;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const budget of budgets) {
    const cat = (budget as any).category;
    const limit: number = (budget as any).amount ?? 0;
    if (!limit) continue;

    const result = await Transaction.aggregate([
      {
        $match: {
          userId,
          category: cat,
          date: { $gte: startOfMonth },
          amount: { $lt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const spent = Math.abs(result[0]?.total ?? 0);
    const pct = spent / limit;
    const key = `budget-${budget._id}-${now.getFullYear()}-${now.getMonth()}`;

    if (pct >= 1) {
      await upsertAlert(
        userId,
        "budget",
        `Budget Exceeded: ${cat}`,
        `You've spent $${spent.toFixed(2)} in ${cat}, exceeding your $${limit.toFixed(2)} budget (${Math.round(pct * 100)}%).`,
        "critical",
        key + "-over"
      );
    } else if (pct >= 0.8) {
      await upsertAlert(
        userId,
        "budget",
        `Budget Warning: ${cat}`,
        `You've used ${Math.round(pct * 100)}% of your $${limit.toFixed(2)} ${cat} budget ($${spent.toFixed(2)} of $${limit.toFixed(2)}).`,
        "warning",
        key + "-80"
      );
    }
  }
}

async function checkTaxAccounts(userId: mongoose.Types.ObjectId) {
  const acct = await TaxAccount.findOne({ userId });
  if (!acct) return;

  const a = acct as any;

  // RRSP room running low
  const rrspRoom = (a.rrspContributionLimit ?? 0) - (a.rrspContributions ?? 0);
  if (rrspRoom > 0 && rrspRoom < 500) {
    const key = `rrsp-low-${new Date().getFullYear()}`;
    await upsertAlert(
      userId,
      "rrsp",
      "RRSP Contribution Room Running Low",
      `You have only $${rrspRoom.toFixed(2)} of RRSP room remaining. Avoid over-contributing to prevent a 1%/month penalty.`,
      "warning",
      key
    );
  }

  // TFSA over-contribution
  const tfsaRoom = (a.tfsaLifetimeRoom ?? 0) - (a.tfsaContributions ?? 0);
  if (tfsaRoom < 0) {
    const key = `tfsa-over-${new Date().getFullYear()}`;
    await upsertAlert(
      userId,
      "tfsa",
      "TFSA Over-Contribution Warning",
      `You appear to have over-contributed to your TFSA by $${Math.abs(tfsaRoom).toFixed(2)}. The CRA charges a 1%/month penalty on excess amounts.`,
      "critical",
      key
    );
  } else if (tfsaRoom < 500 && tfsaRoom >= 0) {
    const key = `tfsa-low-${new Date().getFullYear()}`;
    await upsertAlert(
      userId,
      "tfsa",
      "TFSA Room Running Low",
      `You have $${tfsaRoom.toFixed(2)} of TFSA contribution room remaining this year.`,
      "info",
      key
    );
  }
}

async function checkNetWorthMilestones(userId: mongoose.Types.ObjectId) {
  const snapshots = await NetWorthSnapshot.find({ userId: userId.toString() }).sort({ snapshotDate: -1 }).limit(2);
  if (snapshots.length < 1) return;

  const latest = (snapshots[0] as any).netWorth ?? 0;
  const previous = snapshots.length > 1 ? ((snapshots[1] as any).netWorth ?? 0) : 0;

  for (const milestone of NET_WORTH_MILESTONES) {
    if (previous < milestone && latest >= milestone) {
      const key = `networth-milestone-${milestone}`;
      await upsertAlert(
        userId,
        "net_worth",
        `Net Worth Milestone: $${milestone.toLocaleString()}!`,
        `Congratulations! Your net worth has crossed $${milestone.toLocaleString()}. Keep up the great work!`,
        "info",
        key
      );
    }
  }

  // Large drop alert (>10% decline)
  if (previous > 0 && latest < previous) {
    const dropPct = (previous - latest) / previous;
    if (dropPct >= 0.1) {
      const now = new Date();
      const key = `networth-drop-${now.getFullYear()}-${now.getMonth()}`;
      await upsertAlert(
        userId,
        "net_worth",
        "Significant Net Worth Decline",
        `Your net worth dropped by ${Math.round(dropPct * 100)}% ($${(previous - latest).toFixed(2)}) since the last snapshot.`,
        "warning",
        key
      );
    }
  }
}

async function checkSpendingSpike(userId: mongoose.Types.ObjectId) {
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [thisMonth, lastMonth] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId, date: { $gte: startThisMonth }, amount: { $lt: 0 } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId,
          date: { $gte: startLastMonth, $lte: endLastMonth },
          amount: { $lt: 0 },
        },
      },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
  ]);

  const lastMap: Record<string, number> = {};
  for (const r of lastMonth) lastMap[r._id] = Math.abs(r.total);

  for (const r of thisMonth) {
    const cat = r._id;
    const thisSpend = Math.abs(r.total);
    const lastSpend = lastMap[cat] ?? 0;
    if (lastSpend === 0) continue;

    // Normalize for partial month (scale last month's full spend by days elapsed)
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysSoFar = now.getDate();
    const paceAdjusted = (thisSpend / daysSoFar) * daysInMonth;
    const spike = (paceAdjusted - lastSpend) / lastSpend;

    if (spike >= 0.5) {
      const key = `spending-spike-${cat}-${now.getFullYear()}-${now.getMonth()}`;
      await upsertAlert(
        userId,
        "spending",
        `Unusual Spending Spike: ${cat}`,
        `Your ${cat} spending is on pace for $${paceAdjusted.toFixed(2)} this month, ${Math.round(spike * 100)}% higher than last month ($${lastSpend.toFixed(2)}).`,
        "warning",
        key
      );
    }
  }
}
