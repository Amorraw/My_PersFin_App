// Background job scheduler: daily alerts and first-of-month net-worth snapshot / budget rollover
import mongoose from "mongoose";
import { runAlertEngine } from "./alertEngine";
import { User } from "../models/User";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { Account } from "../models/Account";
import { Budget } from "../models/Budget";
import { Transaction } from "../models/Transaction";
import Notification from "../models/Notification";

// Fetch every user's ObjectId for fan-out to per-user jobs
async function getAllUserIds(): Promise<mongoose.Types.ObjectId[]> {
  const users = await User.find({}, "_id").lean();
  return users.map((u: any) => u._id as mongoose.Types.ObjectId);
}

// Record one net-worth snapshot per user per month and notify them of the total
async function takeMonthlyNetWorthSnapshot() {
  const userIds = await getAllUserIds();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const userId of userIds) {
    const existing = await NetWorthSnapshot.findOne({
      userId: userId.toString(),
      snapshotDate: { $gte: startOfMonth },
    });
    if (existing) continue;

    const accounts = await Account.find({ userId }).lean();
    let totalAssets = 0;
    let totalLiabilities = 0;

    const liabilityTypes = ["credit-card", "mortgage", "line-of-credit", "student-loan", "auto-loan", "personal-loan"];
    for (const acct of accounts) {
      const balance = (acct as any).balance ?? 0;
      const accountType = (acct as any).type ?? "";
      if (liabilityTypes.includes(accountType)) {
        totalLiabilities += Math.abs(balance);
      } else {
        totalAssets += balance;
      }
    }

    await NetWorthSnapshot.create({
      userId: userId.toString(),
      snapshotDate: now,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    });

    await Notification.create({
      userId,
      category: "automation",
      title: "Monthly Net Worth Snapshot Taken",
      message: `Your net worth snapshot for ${now.toLocaleString("default", { month: "long", year: "numeric" })} has been recorded: $${(totalAssets - totalLiabilities).toLocaleString("en-CA", { minimumFractionDigits: 2 })}.`,
      severity: "info",
      relatedId: `snapshot-${now.getFullYear()}-${now.getMonth()}`,
    });
  }
}

// Notify users of unspent budget amounts eligible to carry into the new month
async function rolloverMonthlyBudgets() {
  const userIds = await getAllUserIds();
  const now = new Date();

  for (const userId of userIds) {
    const budgets = await Budget.find({ userId, isActive: true, rolloverMode: { $ne: "none" } }).lean();

    for (const budget of budgets) {
      const b = budget as any;
      if (!b.rolloverMode || b.rolloverMode === "none") continue;

      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const result = await Transaction.aggregate([
        {
          $match: {
            userId,
            category: b.category,
            date: { $gte: prevMonthStart, $lte: prevMonthEnd },
            amount: { $lt: 0 },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const spent = Math.abs(result[0]?.total ?? 0);
      const remaining = (b.amount ?? 0) - spent;

      // Only notify once per rollover event to avoid duplicate alerts
      if (remaining > 0 && (b.rolloverMode === "carry-unused" || b.rolloverMode === "carry-net")) {
        const alreadyNotified = await Notification.findOne({
          userId,
          category: "automation",
          relatedId: `rollover-${budget._id}-${now.getFullYear()}-${now.getMonth()}`,
        });
        if (!alreadyNotified) {
          await Notification.create({
            userId,
            category: "automation",
            title: `Budget Rollover: ${b.category}`,
            message: `$${remaining.toFixed(2)} unspent from your ${b.category} budget last month. This amount can be rolled over to this month's budget.`,
            severity: "info",
            relatedId: `rollover-${budget._id}-${now.getFullYear()}-${now.getMonth()}`,
          });
        }
      }
    }
  }
}

// Fan out alert engine to all users in parallel, ignoring individual failures
async function runDailyAlerts() {
  const userIds = await getAllUserIds();
  await Promise.allSettled(userIds.map((id) => runAlertEngine(id)));
}

// Run snapshot and budget rollover concurrently; surface failures independently
async function runFirstOfMonthJobs() {
  await Promise.allSettled([takeMonthlyNetWorthSnapshot(), rolloverMonthlyBudgets()]);
}

// Wire up daily (24 h) and first-of-month (hourly check) intervals
export function startScheduler() {
  runDailyAlerts().catch(console.error);
  setInterval(() => runDailyAlerts().catch(console.error), 24 * 60 * 60 * 1000);

  const checkFirstOfMonth = () => {
    const now = new Date();
    // Only fire during the first two hours of the 1st to avoid duplicate runs
    if (now.getDate() === 1 && now.getHours() < 2) {
      runFirstOfMonthJobs().catch(console.error);
    }
  };
  setInterval(checkFirstOfMonth, 60 * 60 * 1000);
}
