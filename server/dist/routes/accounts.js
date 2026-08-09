"use strict";
// Account routes: CRUD for user financial accounts with auto-balance recalculation
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Account_1 = require("../models/Account");
const Transaction_1 = require("../models/Transaction");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
const LIABILITY_TYPES = new Set([
    "credit-card",
    "line-of-credit",
    "student-loan",
    "mortgage",
    "auto-loan",
    "personal-loan"
]);
function getBalanceDelta(accountType, transactionType, amount) {
    if (transactionType === "transfer")
        return 0;
    const baseDelta = transactionType === "income" ? amount : -amount;
    return LIABILITY_TYPES.has(accountType) ? -baseDelta : baseDelta;
}
async function getRecalculatedAccountBalance(userId, accountId, accountType) {
    const txns = await Transaction_1.Transaction.find({ userId, accountId });
    if (txns.length === 0)
        return 0;
    if (LIABILITY_TYPES.has(accountType)) {
        const latestStatementTxn = await Transaction_1.Transaction.findOne({
            userId,
            accountId,
            statementBalance: { $ne: null }
        }).sort({ date: -1, createdAt: -1, _id: -1 });
        if (latestStatementTxn && typeof latestStatementTxn.statementBalance === "number") {
            return Math.max(0, latestStatementTxn.statementBalance);
        }
    }
    return txns.reduce((sum, txn) => sum + getBalanceDelta(accountType, txn.type, txn.amount), 0);
}
// All routes require authentication
router.use(requireLogin_1.requireAuth);
// GET / — list all accounts; auto-corrects each balance from transaction history
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const accounts = await Account_1.Account.find({ userId });
        // Recalculate each account strictly from its own transactions.
        for (const account of accounts) {
            const recalculatedBalance = await getRecalculatedAccountBalance(userId, account._id.toString(), account.type);
            if (account.balance !== recalculatedBalance) {
                account.balance = recalculatedBalance;
                await account.save();
            }
        }
        return res.json(accounts);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /:id — fetch a single account by ID
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await Account_1.Account.findOne({ _id: req.params.id, userId });
        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new account for the logged-in user
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type, balance, currency, institution } = req.body;
        if (!name || !type) {
            return res.status(400).json({ message: "Name and type are required" });
        }
        const account = await Account_1.Account.create({
            userId,
            name,
            type,
            institution: institution || undefined,
            balance: balance || 0,
            currency: currency || "CAD"
        });
        return res.status(201).json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// PUT /:id — update account fields (name, type, balance, etc.)
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type, balance, currency, institution } = req.body;
        const account = await Account_1.Account.findOneAndUpdate({ _id: req.params.id, userId }, { name, type, balance, currency, institution }, { new: true, runValidators: true });
        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }
        return res.json(account);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove an account by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const account = await Account_1.Account.findOneAndDelete({ _id: req.params.id, userId });
        if (!account) {
            return res.status(404).json({ message: "Account not found" });
        }
        return res.json({ message: "Account deleted" });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /recalculate-credit-card-balances — recompute all credit card balances from transactions
router.post("/recalculate-credit-card-balances", async (req, res) => {
    try {
        const userId = req.user.id;
        const creditCardAccounts = await Account_1.Account.find({ userId, type: "credit-card" });
        const results = [];
        for (const account of creditCardAccounts) {
            const transactions = await Transaction_1.Transaction.find({ userId, accountId: account._id });
            const balance = await getRecalculatedAccountBalance(userId, account._id.toString(), account.type);
            account.balance = balance;
            await account.save();
            results.push({
                accountId: account._id,
                accountName: account.name,
                transactionCount: transactions.length,
                newBalance: balance
            });
            console.log(`[RECALC] Credit card "${account.name}": ${transactions.length} transactions, new balance: $${balance}`);
        }
        return res.json({
            message: "Credit card balances recalculated",
            accountsUpdated: results.length,
            results
        });
    }
    catch (err) {
        console.error("Error recalculating credit card balances:", err);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
