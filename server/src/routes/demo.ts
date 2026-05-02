/**
 * Demo management routes.
 * POST /api/demo/reset  — clears and re-seeds data for the current demo user.
 * POST /api/demo/clear  — wipes all data for the current demo user (leaves account blank).
 */

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/requireLogin";
import { User } from "../models/User";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Bill } from "../models/Bill";
import { Goal } from "../models/Goal";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";

const router = Router();
router.use(requireAuth);

const DEMO_DOMAIN = "@demo.com";

function isDemoUser(email: string) {
  return email.endsWith(DEMO_DOMAIN) && /^user_test\d+@demo\.com$/.test(email);
}

async function clearUserData(userId: mongoose.Types.ObjectId) {
  await Promise.all([
    Transaction.deleteMany({ userId }),
    Account.deleteMany({ userId }),
    Budget.deleteMany({ userId }),
    Bill.deleteMany({ userId }),
    Goal.deleteMany({ userId }),
    NetWorthSnapshot.deleteMany({ userId }),
  ]);
}

// POST /api/demo/clear — wipe everything (leave account blank for manual entry)
router.post("/clear", async (req: Request, res: Response) => {
  const email = (req.user as any).email as string;
  if (!isDemoUser(email)) {
    return res.status(403).json({ message: "Only demo accounts can use this endpoint." });
  }
  const userId = (req.user as any).id as mongoose.Types.ObjectId;
  await clearUserData(userId);
  return res.json({ message: "All data cleared. You can now add your own data or reset from a profile." });
});

// POST /api/demo/reset — clear and re-seed from original profile data
router.post("/reset", async (req: Request, res: Response) => {
  const email = (req.user as any).email as string;
  if (!isDemoUser(email)) {
    return res.status(403).json({ message: "Only demo accounts can use this endpoint." });
  }
  const userId = (req.user as any).id as mongoose.Types.ObjectId;

  try {
    await clearUserData(userId);

    // Dynamically import the seeder so we don't pull all that data in at startup
    const { seedProfile } = await import("../scripts/seedDemoUsers");
    const { PROFILES } = await import("../scripts/seedDemoUsers") as any;

    // Find which profile index this user maps to
    const match = (PROFILES as any[]).find((p: any) => p.email === email);
    if (!match) return res.status(404).json({ message: "Profile not found." });

    const passwordHash = await bcrypt.hash("Demo1234!", 10);
    // Temporarily remove user so seedProfile can recreate their data,
    // then restore the existing user record.
    await seedProfile(match, passwordHash);
    // seedProfile creates a new user — merge their data onto existing user
    const seedUser = await User.findOne({ email, _id: { $ne: userId } });
    if (seedUser) {
      // Move all seeded documents from the new userId to the original
      const newUid = seedUser._id as mongoose.Types.ObjectId;
      await Promise.all([
        Account.updateMany({ userId: newUid }, { userId }),
        Transaction.updateMany({ userId: newUid }, { userId }),
        Budget.updateMany({ userId: newUid }, { userId }),
        Bill.updateMany({ userId: newUid }, { userId }),
        Goal.updateMany({ userId: newUid }, { userId }),
        NetWorthSnapshot.updateMany({ userId: newUid }, { userId }),
      ]);
      await User.deleteOne({ _id: newUid });
    }

    return res.json({ message: "Data reset successfully. Reload the app to see your fresh profile." });
  } catch (err: any) {
    console.error("Demo reset error:", err);
    return res.status(500).json({ message: err.message || "Reset failed." });
  }
});

export default router;
