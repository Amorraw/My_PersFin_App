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
import { DemoSnapshot } from "../models/DemoSnapshot";

const router = Router();
router.use(requireAuth);

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
  ]);
}

async function takeSnapshot(userId: mongoose.Types.ObjectId, profileIndex: number) {
  const s = userId.toString();
  const [accounts, transactions, budgets, bills, goals, netWorthSnapshots] = await Promise.all([
    Account.find({ userId: s }).lean(),
    Transaction.find({ userId: s }).lean(),
    Budget.find({ userId: s }).lean(),
    Bill.find({ userId: s }).lean(),
    Goal.find({ userId: s }).lean(),
    NetWorthSnapshot.find({ userId: s }).lean(),
  ]);
  await DemoSnapshot.findOneAndUpdate(
    { userId },
    { userId, profileIndex, savedAt: new Date(), accounts, transactions, budgets, bills, goals, netWorthSnapshots },
    { upsert: true, new: true }
  );
}

async function restoreFromSnapshot(userId: mongoose.Types.ObjectId): Promise<boolean> {
  const snap = await DemoSnapshot.findOne({ userId }).lean() as any;
  if (!snap) return false;
  const s = userId.toString();
  await Promise.all([
    Transaction.deleteMany({ userId: s }),
    Account.deleteMany({ userId: s }),
    Budget.deleteMany({ userId: s }),
    Bill.deleteMany({ userId: s }),
    Goal.deleteMany({ userId: s }),
    NetWorthSnapshot.deleteMany({ userId: s }),
  ]);
  if (snap.accounts.length)          await Account.collection.insertMany(snap.accounts);
  if (snap.transactions.length)      await Transaction.collection.insertMany(snap.transactions);
  if (snap.budgets.length)           await Budget.collection.insertMany(snap.budgets);
  if (snap.bills.length)             await Bill.collection.insertMany(snap.bills);
  if (snap.goals.length)             await Goal.collection.insertMany(snap.goals);
  if (snap.netWorthSnapshots.length) await NetWorthSnapshot.collection.insertMany(snap.netWorthSnapshots);
  return true;
}

// ── POST /api/demo/activate ───────────────────────────────────────────────────
// Body: { profileIndex: number, years?: number }  (profileIndex 1–10, years 3–7)

router.post("/activate", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  const profileIndex = parseInt(req.body.profileIndex, 10);
  if (!profileIndex || profileIndex < 1 || profileIndex > 10) {
    return res.status(400).json({ message: "profileIndex must be 1–10" });
  }
  const years = Math.max(3, Math.min(7, parseInt(req.body.years, 10) || 5));

  try {
    const { seedDataForUser, PROFILES } = await import("../scripts/seedDemoUsers");
    const profile = (PROFILES as any[])[profileIndex - 1];

    await clearUserData(userId);
    await seedDataForUser(userId, profile, { years });
    await takeSnapshot(userId, profileIndex);

    await User.findByIdAndUpdate(userId, { demoProfileIndex: profileIndex, demoHistoryYears: years });
    return res.json({ ok: true, message: `Profile "${profile.firstName}'s" data loaded (${years} years of history). Reload to see it.`, profileIndex });
  } catch (err: any) {
    console.error("Demo activate error:", err);
    return res.status(500).json({ message: err.message || "Activate failed." });
  }
});

// ── POST /api/demo/regenerate ─────────────────────────────────────────────────
// Wipes current data and re-seeds with fresh random values using the same profile
// and the same history-years choice. Saves a new snapshot.

router.post("/regenerate", async (req: Request, res: Response) => {
  const userId = (req.user as any)._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  if (!user?.demoProfileIndex) {
    return res.status(400).json({ message: "No demo profile loaded. Go to Demo Profiles and load one first." });
  }
  const years = (user as any).demoHistoryYears ?? 5;

  try {
    const { seedDataForUser, PROFILES } = await import("../scripts/seedDemoUsers");
    const profile = (PROFILES as any[])[user.demoProfileIndex - 1];

    await clearUserData(userId);
    await seedDataForUser(userId, profile, { years });
    await takeSnapshot(userId, user.demoProfileIndex);

    return res.json({ ok: true, message: `New random dataset generated (${years} years of history). Reload to see your fresh data.` });
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
    await User.findByIdAndUpdate(userId, { demoProfileIndex: null });
    return res.json({ ok: true, message: "All data cleared. Your account is now blank." });
  } catch (err: any) {
    console.error("Demo clear error:", err);
    return res.status(500).json({ message: err.message || "Clear failed." });
  }
});

export default router;
