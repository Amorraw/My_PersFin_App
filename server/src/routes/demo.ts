/**
 * Demo / simulation data routes — available to ANY logged-in user.
 *
 * POST /api/demo/activate   — load a financial profile template into the current user's account
 * POST /api/demo/regenerate — fresh random data for the same profile (saves a new snapshot)
 * POST /api/demo/reset      — restore data to the last snapshot (undo edits since last Regenerate)
 * POST /api/demo/clear      — wipe all data and remove the demo profile link
 */

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireLogin";
import { User } from "../models/User";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Bill } from "../models/Bill";
import { Goal } from "../models/Goal";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { Debt } from "../models/Debt";
import { Property } from "../models/Property";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { TaxAccount } from "../models/TaxAccount";
import { Investment } from "../models/Investment";
import { TFSAAccount } from "../models/TFSAAccount";
import { RRSPAccount } from "../models/RRSPAccount";
import { FHSAAccount } from "../models/FHSAAccount";
import { RESPAccount } from "../models/RESPAccount";
import { DemoSnapshot } from "../models/DemoSnapshot";

const router = Router();
router.use(requireAuth);

export const ALLOWED_DEMO_YEARS = [1, 3, 5, 7];

function parseYears(body: any, fallback = 3): number {
  const years = parseInt(body?.years, 10);
  return ALLOWED_DEMO_YEARS.includes(years) ? years : fallback;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearUserData(userId: mongoose.Types.ObjectId) {
  const s = userId.toString();
  await Promise.all([
    Transaction.deleteMany({ userId: s }),
    Account.deleteMany({ userId: s }),
    Budget.deleteMany({ userId: s }),
    Bill.deleteMany({ userId: s }),
    Goal.deleteMany({ userId: s }),
    NetWorthSnapshot.deleteMany({ userId: s }),
    Debt.deleteMany({ userId: s }),
    Property.deleteMany({ userId: s }),
    RecurringTransaction.deleteMany({ userId: s }),
    TaxAccount.deleteMany({ userId: s }),
    Investment.deleteMany({ userId: s }),
    TFSAAccount.deleteMany({ userId: s }),
    RRSPAccount.deleteMany({ userId: s }),
    FHSAAccount.deleteMany({ userId: s }),
    RESPAccount.deleteMany({ userId: s }),
  ]);
}

async function takeSnapshot(userId: mongoose.Types.ObjectId, profileIndex: number) {
  const s = userId.toString();
  const [
    accounts, transactions, budgets, bills, goals, netWorthSnapshots,
    debts, properties, recurringTransactions, taxAccounts, investments,
    tfsaAccounts, rrspAccounts, fhsaAccounts, respAccounts,
  ] = await Promise.all([
    Account.find({ userId: s }).lean(),
    Transaction.find({ userId: s }).lean(),
    Budget.find({ userId: s }).lean(),
    Bill.find({ userId: s }).lean(),
    Goal.find({ userId: s }).lean(),
    NetWorthSnapshot.find({ userId: s }).lean(),
    Debt.find({ userId: s }).lean(),
    Property.find({ userId: s }).lean(),
    RecurringTransaction.find({ userId: s }).lean(),
    TaxAccount.find({ userId: s }).lean(),
    Investment.find({ userId: s }).lean(),
    TFSAAccount.find({ userId: s }).lean(),
    RRSPAccount.find({ userId: s }).lean(),
    FHSAAccount.find({ userId: s }).lean(),
    RESPAccount.find({ userId: s }).lean(),
  ]);
  await DemoSnapshot.findOneAndUpdate(
    { userId },
    {
      userId, profileIndex, savedAt: new Date(),
      accounts, transactions, budgets, bills, goals, netWorthSnapshots,
      debts, properties, recurringTransactions, taxAccounts, investments,
      tfsaAccounts, rrspAccounts, fhsaAccounts, respAccounts,
    },
    { upsert: true, new: true }
  );
}

async function restoreFromSnapshot(userId: mongoose.Types.ObjectId): Promise<boolean> {
  const snap = await DemoSnapshot.findOne({ userId }).lean() as any;
  if (!snap) return false;
  await clearUserData(userId);

  const restore = async (model: any, docs: any[] | undefined) => {
    if (docs?.length) await model.collection.insertMany(docs);
  };
  await Promise.all([
    restore(Account, snap.accounts),
    restore(Transaction, snap.transactions),
    restore(Budget, snap.budgets),
    restore(Bill, snap.bills),
    restore(Goal, snap.goals),
    restore(NetWorthSnapshot, snap.netWorthSnapshots),
    restore(Debt, snap.debts),
    restore(Property, snap.properties),
    restore(RecurringTransaction, snap.recurringTransactions),
    restore(TaxAccount, snap.taxAccounts),
    restore(Investment, snap.investments),
    restore(TFSAAccount, snap.tfsaAccounts),
    restore(RRSPAccount, snap.rrspAccounts),
    restore(FHSAAccount, snap.fhsaAccounts),
    restore(RESPAccount, snap.respAccounts),
  ]);
  return true;
}

// ── POST /api/demo/activate ───────────────────────────────────────────────────
// Body: { profileIndex: number (1–10), years?: 1|3|5|7 }
// Loads a financial profile template for the current user and saves a snapshot.

router.post("/activate", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  const profileIndex = parseInt(req.body.profileIndex, 10);
  if (!profileIndex || profileIndex < 1 || profileIndex > 10) {
    return res.status(400).json({ message: "profileIndex must be 1–10" });
  }
  const years = parseYears(req.body);

  try {
    const { seedDataForUser, PROFILES } = await import("../scripts/seedDemoUsers");
    const profile = (PROFILES as any[])[profileIndex - 1];

    await clearUserData(userId);
    await seedDataForUser(userId, profile, { years: years as 1 | 3 | 5 | 7 });
    await takeSnapshot(userId, profileIndex);

    // Reset the stale tier so the alert engine's next check doesn't compare
    // this fresh profile's standing against the previous profile's — that
    // would read as a false "your finances got worse" alert.
    await User.findByIdAndUpdate(userId, { demoProfileIndex: profileIndex, demoHistoryYears: years, lastFinancialHealthTier: null });
    return res.json({ ok: true, message: `Profile "${profile.firstName}'s" data loaded (${years} year${years === 1 ? "" : "s"} of history). Reload to see it.`, profileIndex, years });
  } catch (err: any) {
    console.error("Demo activate error:", err);
    return res.status(500).json({ message: err.message || "Activate failed." });
  }
});

// ── POST /api/demo/regenerate ─────────────────────────────────────────────────
// Wipes current data and re-seeds with fresh random values (same profile type).
// Body: { years?: 1|3|5|7 } — omit to keep the previously-activated duration.
// Saves a new snapshot so Reset will restore to THIS new dataset.

router.post("/regenerate", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  if (!user?.demoProfileIndex) {
    return res.status(400).json({ message: "No demo profile loaded. Go to Demo Profiles and load one first." });
  }
  // Omit years to keep whatever duration was last activated/regenerated for this user.
  const years = parseYears(req.body, user.demoHistoryYears ?? 3);

  try {
    const { seedDataForUser, PROFILES } = await import("../scripts/seedDemoUsers");
    const profile = (PROFILES as any[])[user.demoProfileIndex - 1];

    await clearUserData(userId);
    await seedDataForUser(userId, profile, { years: years as 1 | 3 | 5 | 7 }); // Math.random + current date (defaults)
    await takeSnapshot(userId, user.demoProfileIndex);
    // Freshly-regenerated random values could legitimately shift the tier —
    // reset rather than let it read as a real "your finances changed" alert.
    await User.findByIdAndUpdate(userId, { demoHistoryYears: years, lastFinancialHealthTier: null });

    return res.json({ ok: true, message: `New random dataset generated (${years} year${years === 1 ? "" : "s"} of history). Reload to see your fresh data.`, years });
  } catch (err: any) {
    console.error("Demo regenerate error:", err);
    return res.status(500).json({ message: err.message || "Regenerate failed." });
  }
});

// ── POST /api/demo/reset ──────────────────────────────────────────────────────
// Restores data to the last snapshot — undoes any edits made since the last Regenerate.

router.post("/reset", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  try {
    const restored = await restoreFromSnapshot(userId);
    if (!restored) {
      return res.status(404).json({ message: "No snapshot found. Regenerate first to create one." });
    }
    return res.json({ ok: true, message: "Data restored to your last Regenerated state. Reload to see it." });
  } catch (err: any) {
    console.error("Demo reset error:", err);
    return res.status(500).json({ message: err.message || "Reset failed." });
  }
});

// ── POST /api/demo/clear ──────────────────────────────────────────────────────
// Deletes all data, removes the snapshot, and unlinks the demo profile.

router.post("/clear", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  try {
    await clearUserData(userId);
    await DemoSnapshot.deleteOne({ userId });
    await User.findByIdAndUpdate(userId, { demoProfileIndex: null, lastFinancialHealthTier: null });
    return res.json({ ok: true, message: "All data cleared. Your account is now blank." });
  } catch (err: any) {
    console.error("Demo clear error:", err);
    return res.status(500).json({ message: err.message || "Clear failed." });
  }
});

export default router;
