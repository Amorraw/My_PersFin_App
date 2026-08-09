"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Transaction_1 = require("../models/Transaction");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
const ML_URL = (process.env.ML_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");
async function proxyML(endpoint, body) {
    let raw;
    try {
        raw = await fetch(`${ML_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }
    catch {
        // Network-level failure — uvicorn is not reachable
        const err = new Error("Cannot reach the Python ML service — make sure uvicorn is running on port 8000");
        err.isNetworkError = true;
        throw err;
    }
    if (!raw.ok) {
        const text = await raw.text();
        throw new Error(`ML analysis error (${raw.status}): ${text.slice(0, 300)}`);
    }
    return raw.json();
}
// Maps an "analysis period" selection to a lookback start date — null means "All Time" (no lower bound)
function rangeToSince(range) {
    const years = range === "1y" ? 1 : range === "2y" ? 2 : range === "3y" ? 3 : range === "all" ? null : 1;
    if (years === null)
        return null;
    const since = new Date();
    since.setFullYear(since.getFullYear() - years);
    return since;
}
async function buildMonthlySpending(userId, since) {
    const filter = { userId, type: "expense" };
    if (since)
        filter.date = { $gte: since };
    const txns = await Transaction_1.Transaction.find(filter);
    const map = new Map();
    for (const t of txns) {
        const month = t.date.toISOString().slice(0, 7);
        const cat = t.category || "Uncategorized";
        const key = `${month}|${cat}`;
        map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    return Array.from(map.entries()).map(([k, amount]) => {
        const [month, category] = k.split("|");
        return { month, category, amount: Math.round(amount * 100) / 100 };
    });
}
router.post("/forecast", async (req, res) => {
    try {
        const userId = req.user.id;
        const monthly = await buildMonthlySpending(userId, rangeToSince(req.body.range));
        if (monthly.length === 0) {
            return res.json({ forecasts: {}, months_forecast: 0, message: "Not enough transaction history for a forecast yet." });
        }
        const result = await proxyML("/forecast", {
            monthly_spending: monthly,
            forecast_months: Number(req.body.months) || 3,
        });
        res.json(result);
    }
    catch (err) {
        const status = err.isNetworkError ? 502 : 422;
        res.status(status).json({ message: err.message });
    }
});
router.post("/anomalies", async (req, res) => {
    try {
        const userId = req.user.id;
        const since = rangeToSince(req.body.range);
        const filter = { userId };
        if (since)
            filter.date = { $gte: since };
        const txns = await Transaction_1.Transaction.find(filter);
        if (txns.length === 0) {
            return res.json({ anomalies: [], totalScanned: 0, anomalyCount: 0, message: "No transactions in the selected period to scan." });
        }
        const transactions = txns.map(t => ({
            id: t._id.toString(),
            amount: Math.abs(t.amount),
            category: t.category || "Uncategorized",
            date: t.date.toISOString().slice(0, 10),
            description: t.description || "",
        }));
        const result = await proxyML("/anomalies", { transactions });
        res.json(result);
    }
    catch (err) {
        const status = err.isNetworkError ? 502 : 422;
        res.status(status).json({ message: err.message });
    }
});
router.post("/suggest-budgets", async (req, res) => {
    try {
        const userId = req.user.id;
        const monthly = await buildMonthlySpending(userId, rangeToSince(req.body.range));
        if (monthly.length === 0) {
            return res.json({ suggestions: [], monthsAnalyzed: 0, message: "Not enough transaction history for budget suggestions yet." });
        }
        const result = await proxyML("/suggest-budgets", { monthly_spending: monthly });
        res.json(result);
    }
    catch (err) {
        const status = err.isNetworkError ? 502 : 422;
        res.status(status).json({ message: err.message });
    }
});
exports.default = router;
