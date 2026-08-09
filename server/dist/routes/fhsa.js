"use strict";
// FHSA routes: CRUD for First Home Savings Accounts with CRA contribution room tracking
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const FHSA_1 = require("../models/FHSA");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
const ANNUAL_LIMIT = 8000;
const LIFETIME_LIMIT = 40000;
/**
 * Compute FHSA room across all of a user's FHSA accounts.
 * CRA rules:
 *   - $8,000 new room each year the account is open (from openedYear onward)
 *   - Unused room carries forward up to one year's worth ($8,000 max carry)
 *   - Lifetime cap: $40,000
 */
function computeRoomSummary(accounts) {
    if (accounts.length === 0) {
        return {
            openedYear: null,
            totalContributed: 0,
            lifetimeRemaining: LIFETIME_LIMIT,
            currentYearAvailable: 0,
            currentYearContributed: 0,
            currentYearRemaining: 0,
            carryForward: 0,
        };
    }
    const currentYear = new Date().getFullYear();
    const openedYear = Math.min(...accounts.map(a => a.openedYear));
    // Aggregate contributions by year across all accounts
    const byYear = {};
    let totalContributed = 0;
    for (const acct of accounts) {
        for (const c of acct.contributions) {
            byYear[c.year] = (byYear[c.year] || 0) + c.amount;
            totalContributed += c.amount;
        }
    }
    // Simulate carry-forward year by year up to (but not including) current year
    let carryForward = 0;
    for (let yr = openedYear; yr < currentYear; yr++) {
        const available = ANNUAL_LIMIT + carryForward;
        const contributed = byYear[yr] || 0;
        const unused = Math.max(0, available - contributed);
        carryForward = Math.min(unused, ANNUAL_LIMIT);
    }
    const currentYearAvailable = ANNUAL_LIMIT + carryForward;
    const currentYearContributed = byYear[currentYear] || 0;
    const currentYearRemaining = Math.max(0, currentYearAvailable - currentYearContributed);
    const lifetimeRemaining = Math.max(0, LIFETIME_LIMIT - totalContributed);
    return {
        openedYear,
        totalContributed: Math.round(totalContributed * 100) / 100,
        lifetimeRemaining: Math.round(lifetimeRemaining * 100) / 100,
        currentYearAvailable,
        currentYearContributed: Math.round(currentYearContributed * 100) / 100,
        currentYearRemaining: Math.round(Math.min(currentYearRemaining, lifetimeRemaining) * 100) / 100,
        carryForward: Math.round(carryForward * 100) / 100,
    };
}
// GET / — list all FHSA accounts for the user
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await FHSA_1.FHSA.find({ userId }).sort({ openedYear: 1 });
        return res.json(accounts);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /summary — aggregate balances and CRA contribution room across all FHSA accounts
router.get("/summary", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await FHSA_1.FHSA.find({ userId });
        const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
        const room = computeRoomSummary(accounts);
        return res.json({
            totalAccounts: accounts.length,
            totalBalance: Math.round(totalBalance * 100) / 100,
            annualLimit: ANNUAL_LIMIT,
            lifetimeLimit: LIFETIME_LIMIT,
            ...room,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new FHSA account (FHSA program started 2023)
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { institution, accountName, openedYear, currentBalance, notes } = req.body;
        if (!institution || !accountName || !openedYear) {
            return res.status(400).json({ message: "institution, accountName, and openedYear are required" });
        }
        if (openedYear < 2023) {
            return res.status(400).json({ message: "FHSA was introduced in 2023" });
        }
        const account = await FHSA_1.FHSA.create({
            userId,
            institution,
            accountName,
            openedYear: Number(openedYear),
            currentBalance: Number(currentBalance) || 0,
            contributions: [],
            notes,
        });
        return res.status(201).json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// PUT /:id — update FHSA account details
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { institution, accountName, openedYear, currentBalance, notes } = req.body;
        const account = await FHSA_1.FHSA.findOneAndUpdate({ _id: req.params.id, userId }, { institution, accountName, openedYear: Number(openedYear), currentBalance: Number(currentBalance), notes }, { new: true });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove a FHSA account by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await FHSA_1.FHSA.findOneAndDelete({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /:id/contributions — record a contribution against this FHSA account
router.post("/:id/contributions", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await FHSA_1.FHSA.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        const { year, amount, date, note } = req.body;
        if (!year || !amount || !date) {
            return res.status(400).json({ message: "year, amount, and date are required" });
        }
        account.contributions.push({ year: Number(year), amount: Number(amount), date: new Date(date), note });
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id/contributions/:cid — remove a specific contribution from a FHSA account
router.delete("/:id/contributions/:cid", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await FHSA_1.FHSA.findOne({ _id: req.params.id, userId });
        if (!account)
            return res.status(404).json({ message: "Not found" });
        account.contributions = account.contributions.filter(c => c._id?.toString() !== req.params.cid);
        await account.save();
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
