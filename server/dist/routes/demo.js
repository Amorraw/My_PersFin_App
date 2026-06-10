"use strict";
/**
 * Demo / simulation data routes — available to ANY logged-in user.
 *
 * POST /api/demo/activate   — load a financial profile template into the current user's account
 * POST /api/demo/regenerate — fresh random data for the same profile (saves a new snapshot)
 * POST /api/demo/reset      — restore data to the last snapshot (undo edits since last Regenerate)
 * POST /api/demo/clear      — wipe all data and remove the demo profile link
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireLogin_1 = require("../middleware/requireLogin");
const User_1 = require("../models/User");
const Account_1 = require("../models/Account");
const Transaction_1 = require("../models/Transaction");
const Budget_1 = require("../models/Budget");
const Bill_1 = require("../models/Bill");
const Goal_1 = require("../models/Goal");
const NetWorthSnapshot_1 = require("../models/NetWorthSnapshot");
const DemoSnapshot_1 = require("../models/DemoSnapshot");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
// ── Helpers ───────────────────────────────────────────────────────────────────
async function clearUserData(userId) {
    const s = userId.toString();
    await Promise.all([
        Transaction_1.Transaction.deleteMany({ userId: s }),
        Account_1.Account.deleteMany({ userId: s }),
        Budget_1.Budget.deleteMany({ userId: s }),
        Bill_1.Bill.deleteMany({ userId: s }),
        Goal_1.Goal.deleteMany({ userId: s }),
        NetWorthSnapshot_1.NetWorthSnapshot.deleteMany({ userId: s }),
    ]);
}
async function takeSnapshot(userId, profileIndex) {
    const s = userId.toString();
    const [accounts, transactions, budgets, bills, goals, netWorthSnapshots] = await Promise.all([
        Account_1.Account.find({ userId: s }).lean(),
        Transaction_1.Transaction.find({ userId: s }).lean(),
        Budget_1.Budget.find({ userId: s }).lean(),
        Bill_1.Bill.find({ userId: s }).lean(),
        Goal_1.Goal.find({ userId: s }).lean(),
        NetWorthSnapshot_1.NetWorthSnapshot.find({ userId: s }).lean(),
    ]);
    await DemoSnapshot_1.DemoSnapshot.findOneAndUpdate({ userId }, { userId, profileIndex, savedAt: new Date(), accounts, transactions, budgets, bills, goals, netWorthSnapshots }, { upsert: true, new: true });
}
async function restoreFromSnapshot(userId) {
    const snap = await DemoSnapshot_1.DemoSnapshot.findOne({ userId }).lean();
    if (!snap)
        return false;
    const s = userId.toString();
    await Promise.all([
        Transaction_1.Transaction.deleteMany({ userId: s }),
        Account_1.Account.deleteMany({ userId: s }),
        Budget_1.Budget.deleteMany({ userId: s }),
        Bill_1.Bill.deleteMany({ userId: s }),
        Goal_1.Goal.deleteMany({ userId: s }),
        NetWorthSnapshot_1.NetWorthSnapshot.deleteMany({ userId: s }),
    ]);
    if (snap.accounts.length)
        await Account_1.Account.collection.insertMany(snap.accounts);
    if (snap.transactions.length)
        await Transaction_1.Transaction.collection.insertMany(snap.transactions);
    if (snap.budgets.length)
        await Budget_1.Budget.collection.insertMany(snap.budgets);
    if (snap.bills.length)
        await Bill_1.Bill.collection.insertMany(snap.bills);
    if (snap.goals.length)
        await Goal_1.Goal.collection.insertMany(snap.goals);
    if (snap.netWorthSnapshots.length)
        await NetWorthSnapshot_1.NetWorthSnapshot.collection.insertMany(snap.netWorthSnapshots);
    return true;
}
// ── POST /api/demo/activate ───────────────────────────────────────────────────
// Body: { profileIndex: number, years?: number }  (profileIndex 1–10, years 3–7)
router.post("/activate", async (req, res) => {
    const userId = req.user._id;
    const profileIndex = parseInt(req.body.profileIndex, 10);
    if (!profileIndex || profileIndex < 1 || profileIndex > 10) {
        return res.status(400).json({ message: "profileIndex must be 1–10" });
    }
    const years = Math.max(3, Math.min(7, parseInt(req.body.years, 10) || 5));
    try {
        const { seedDataForUser, PROFILES } = await Promise.resolve().then(() => __importStar(require("../scripts/seedDemoUsers")));
        const profile = PROFILES[profileIndex - 1];
        await clearUserData(userId);
        await seedDataForUser(userId, profile, { years });
        await takeSnapshot(userId, profileIndex);
        await User_1.User.findByIdAndUpdate(userId, { demoProfileIndex: profileIndex, demoHistoryYears: years });
        return res.json({ ok: true, message: `Profile "${profile.firstName}'s" data loaded (${years} years of history). Reload to see it.`, profileIndex });
    }
    catch (err) {
        console.error("Demo activate error:", err);
        return res.status(500).json({ message: err.message || "Activate failed." });
    }
});
// ── POST /api/demo/regenerate ─────────────────────────────────────────────────
// Wipes current data and re-seeds with fresh random values using the same profile
// and the same history-years choice. Saves a new snapshot.
router.post("/regenerate", async (req, res) => {
    const userId = req.user._id;
    const user = await User_1.User.findById(userId);
    if (!user?.demoProfileIndex) {
        return res.status(400).json({ message: "No demo profile loaded. Go to Demo Profiles and load one first." });
    }
    const years = user.demoHistoryYears ?? 5;
    try {
        const { seedDataForUser, PROFILES } = await Promise.resolve().then(() => __importStar(require("../scripts/seedDemoUsers")));
        const profile = PROFILES[user.demoProfileIndex - 1];
        await clearUserData(userId);
        await seedDataForUser(userId, profile, { years });
        await takeSnapshot(userId, user.demoProfileIndex);
        return res.json({ ok: true, message: `New random dataset generated (${years} years of history). Reload to see your fresh data.` });
    }
    catch (err) {
        console.error("Demo regenerate error:", err);
        return res.status(500).json({ message: err.message || "Regenerate failed." });
    }
});
// ── POST /api/demo/reset ──────────────────────────────────────────────────────
// Restores data to the last snapshot — undoes any edits made since the last Regenerate.
router.post("/reset", async (req, res) => {
    const userId = req.user._id;
    try {
        const restored = await restoreFromSnapshot(userId);
        if (!restored) {
            return res.status(404).json({ message: "No snapshot found. Regenerate first to create one." });
        }
        return res.json({ ok: true, message: "Data restored to your last Regenerated state. Reload to see it." });
    }
    catch (err) {
        console.error("Demo reset error:", err);
        return res.status(500).json({ message: err.message || "Reset failed." });
    }
});
// ── POST /api/demo/clear ──────────────────────────────────────────────────────
// Deletes all data, removes the snapshot, and unlinks the demo profile.
router.post("/clear", async (req, res) => {
    const userId = req.user._id;
    try {
        await clearUserData(userId);
        await DemoSnapshot_1.DemoSnapshot.deleteOne({ userId });
        await User_1.User.findByIdAndUpdate(userId, { demoProfileIndex: null });
        return res.json({ ok: true, message: "All data cleared. Your account is now blank." });
    }
    catch (err) {
        console.error("Demo clear error:", err);
        return res.status(500).json({ message: err.message || "Clear failed." });
    }
});
exports.default = router;
