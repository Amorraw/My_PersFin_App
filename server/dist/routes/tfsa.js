"use strict";
// TFSA routes: CRUD for TFSA accounts with CRA annual limits, contribution room, and withdrawal tracking
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const TFSAAccount_1 = require("../models/TFSAAccount");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
// CRA TFSA annual limits since program inception
const ANNUAL_LIMITS = {
    2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000,
    2013: 5500, 2014: 5500, 2015: 10000,
    2016: 5500, 2017: 5500, 2018: 5500,
    2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
    2023: 6500, 2024: 7000, 2025: 7000,
};
const DEFAULT_LIMIT = 7000;
function currentYearLimit(year) {
    return ANNUAL_LIMITS[year] ?? DEFAULT_LIMIT;
}
function computeSummary(accounts) {
    const currentYear = new Date().getFullYear();
    const contribByYear = {};
    const withdrawByYear = {};
    let totalBalance = 0;
    for (const acct of accounts) {
        totalBalance += acct.balance ?? 0;
        for (const c of acct.contributions) {
            contribByYear[c.year] = (contribByYear[c.year] || 0) + c.amount;
        }
        for (const w of acct.withdrawals) {
            withdrawByYear[w.year] = (withdrawByYear[w.year] || 0) + w.amount;
        }
    }
    const thisYearLimit = currentYearLimit(currentYear);
    // Withdrawals made before this year add back to this year's room
    const priorYearWithdrawals = Object.entries(withdrawByYear)
        .filter(([yr]) => Number(yr) < currentYear)
        .reduce((s, [, amt]) => s + amt, 0);
    const thisYearAvailable = thisYearLimit + priorYearWithdrawals;
    const thisYearContributed = contribByYear[currentYear] || 0;
    const thisYearRemaining = Math.max(0, thisYearAvailable - thisYearContributed);
    const totalContributed = Object.values(contribByYear).reduce((s, v) => s + v, 0);
    const totalWithdrawn = Object.values(withdrawByYear).reduce((s, v) => s + v, 0);
    return {
        totalBalance: Math.round(totalBalance * 100) / 100,
        totalContributed: Math.round(totalContributed * 100) / 100,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        thisYearLimit,
        priorYearWithdrawals: Math.round(priorYearWithdrawals * 100) / 100,
        thisYearAvailable: Math.round(thisYearAvailable * 100) / 100,
        thisYearContributed: Math.round(thisYearContributed * 100) / 100,
        thisYearRemaining: Math.round(thisYearRemaining * 100) / 100,
        currentYear,
    };
}
// GET / — list all TFSA accounts for the user
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await TFSAAccount_1.TFSAAccount.find({ userId }).sort({ createdAt: 1 });
        return res.json(accounts);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /summary — aggregate balance, this-year limit, prior-year withdrawals, and remaining room
router.get("/summary", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await TFSAAccount_1.TFSAAccount.find({ userId });
        return res.json({ totalAccounts: accounts.length, ...computeSummary(accounts) });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new TFSA account
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountName, institution, balance, notes } = req.body;
        if (!accountName)
            return res.status(400).json({ message: "accountName is required" });
        const account = await TFSAAccount_1.TFSAAccount.create({
            userId,
            accountName,
            institution: institution || "",
            balance: Number(balance) || 0,
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
// PUT /:id — update TFSA account fields
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountName, institution, balance, notes } = req.body;
        const account = await TFSAAccount_1.TFSAAccount.findOneAndUpdate({ _id: req.params.id, userId }, { accountName, institution, balance: Number(balance), notes }, { new: true });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove a TFSA account by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await TFSAAccount_1.TFSAAccount.findOneAndDelete({ _id: req.params.id, userId });
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
        const account = await TFSAAccount_1.TFSAAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const { year, amount, date, note } = req.body;
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
// DELETE /:id/contributions/:cid — remove a contribution and deduct it from the balance
router.delete("/:id/contributions/:cid", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await TFSAAccount_1.TFSAAccount.findOne({ _id: req.params.id, userId });
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
// POST /:id/withdrawals — record a withdrawal and reduce the account balance
router.post("/:id/withdrawals", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await TFSAAccount_1.TFSAAccount.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const { year, amount, date } = req.body;
        if (!year || !amount || !date)
            return res.status(400).json({ message: "year, amount, date required" });
        account.withdrawals.push({ year: Number(year), amount: Number(amount), date: new Date(date) });
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
        const account = await TFSAAccount_1.TFSAAccount.findOne({ _id: req.params.id, userId });
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
