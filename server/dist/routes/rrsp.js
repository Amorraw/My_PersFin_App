"use strict";
// RRSP routes: CRUD for RRSP accounts with contribution room, withdrawals, and withholding tracking
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const RRSPAccount_1 = require("../models/RRSPAccount");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
const ANNUAL_LIMIT_2024 = 31560;
const ANNUAL_LIMIT_2025 = 32490;
function currentAnnualLimit() {
    const yr = new Date().getFullYear();
    if (yr >= 2025)
        return ANNUAL_LIMIT_2025;
    return ANNUAL_LIMIT_2024;
}
function computeSummary(accounts) {
    const currentYear = new Date().getFullYear();
    let totalBalance = 0;
    let deductionLimit = 0;
    let thisYearContrib = 0;
    let totalContributed = 0;
    let totalWithdrawn = 0;
    let totalWithholding = 0;
    for (const acct of accounts) {
        totalBalance += acct.balance ?? 0;
        // Use the highest deduction limit set — all RRSP accounts share the same pool
        if ((acct.deductionLimit ?? 0) > deductionLimit)
            deductionLimit = acct.deductionLimit;
        for (const c of acct.contributions) {
            totalContributed += c.amount;
            if (c.year === currentYear)
                thisYearContrib += c.amount;
        }
        for (const w of acct.withdrawals) {
            totalWithdrawn += w.amount;
            totalWithholding += w.withholding ?? 0;
        }
    }
    if (deductionLimit === 0)
        deductionLimit = currentAnnualLimit();
    const remainingRoom = Math.max(0, deductionLimit - thisYearContrib);
    const usedPct = deductionLimit > 0 ? Math.min(100, Math.round((thisYearContrib / deductionLimit) * 100)) : 0;
    return {
        totalBalance: Math.round(totalBalance * 100) / 100,
        deductionLimit,
        thisYearContrib: Math.round(thisYearContrib * 100) / 100,
        remainingRoom: Math.round(remainingRoom * 100) / 100,
        totalContributed: Math.round(totalContributed * 100) / 100,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        totalWithholding: Math.round(totalWithholding * 100) / 100,
        usedPct,
        currentYear,
        annualMax: currentAnnualLimit(),
    };
}
// GET / — list all RRSP accounts for the user
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await RRSPAccount_1.RRSPAccount.find({ userId }).sort({ createdAt: 1 });
        return res.json(accounts);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /summary — aggregate RRSP balance, deduction limit, remaining room, and used percentage
router.get("/summary", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await RRSPAccount_1.RRSPAccount.find({ userId });
        return res.json({ totalAccounts: accounts.length, ...computeSummary(accounts) });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new RRSP account with initial balance and deduction limit
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountName, institution, balance, deductionLimit, isAccountOwner, notes } = req.body;
        if (!accountName)
            return res.status(400).json({ message: "accountName is required" });
        const account = await RRSPAccount_1.RRSPAccount.create({
            userId,
            accountName,
            institution: institution || "",
            balance: Number(balance) || 0,
            deductionLimit: Number(deductionLimit) || 0,
            annualContributionLimit: currentAnnualLimit(),
            isAccountOwner: isAccountOwner !== false,
            contributions: [],
            withdrawals: [],
            notes,
        });
        return res.status(201).json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// PUT /:id — update RRSP account fields
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountName, institution, balance, deductionLimit, isAccountOwner, notes } = req.body;
        const account = await RRSPAccount_1.RRSPAccount.findOneAndUpdate({ _id: req.params.id, userId }, { accountName, institution, balance: Number(balance), deductionLimit: Number(deductionLimit), isAccountOwner: isAccountOwner !== false, notes }, { new: true });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove an RRSP account by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await RRSPAccount_1.RRSPAccount.findOneAndDelete({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /:id/contributions — record a contribution and add it to the account balance
router.post("/:id/contributions", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await RRSPAccount_1.RRSPAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const { year, amount, date } = req.body;
        if (!year || !amount || !date)
            return res.status(400).json({ message: "year, amount, date required" });
        account.contributions.push({ year: Number(year), amount: Number(amount), date: new Date(date) });
        account.balance += Number(amount);
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id/contributions/:cid — remove a contribution and deduct it from the account balance
router.delete("/:id/contributions/:cid", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await RRSPAccount_1.RRSPAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const contrib = account.contributions.find(c => c._id?.toString() === req.params.cid);
        if (contrib)
            account.balance = Math.max(0, account.balance - contrib.amount);
        account.contributions = account.contributions.filter(c => c._id?.toString() !== req.params.cid);
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /:id/withdrawals — record a withdrawal (with withholding tax) and reduce the balance
router.post("/:id/withdrawals", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await RRSPAccount_1.RRSPAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const { year, amount, date, withholding } = req.body;
        if (!year || !amount || !date)
            return res.status(400).json({ message: "year, amount, date required" });
        account.withdrawals.push({ year: Number(year), amount: Number(amount), date: new Date(date), withholding: Number(withholding) || 0 });
        account.balance = Math.max(0, account.balance - Number(amount));
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id/withdrawals/:wid — remove a withdrawal and restore the amount to the balance
router.delete("/:id/withdrawals/:wid", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await RRSPAccount_1.RRSPAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const w = account.withdrawals.find(x => x._id?.toString() === req.params.wid);
        if (w)
            account.balance += w.amount;
        account.withdrawals = account.withdrawals.filter(x => x._id?.toString() !== req.params.wid);
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
