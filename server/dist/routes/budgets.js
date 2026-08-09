"use strict";
// Budget routes: CRUD, period summaries with rollover, payday plans, and Canadian templates
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Budget_1 = require("../models/Budget");
const Transaction_1 = require("../models/Transaction");
const requireLogin_1 = require("../middleware/requireLogin");
const categoryCatalog_1 = require("../data/categoryCatalog");
const router = (0, express_1.Router)();
const CANADIAN_TEMPLATE_CATEGORIES = [
    { category: "Rent", amount: 1800 },
    { category: "Groceries", amount: 600 },
    { category: "Utilities", amount: 220 },
    { category: "Phone (Including Long Distance)", amount: 75 },
    { category: "Internet", amount: 90 },
    { category: "Bus / Taxi / Ride Share", amount: 180 },
    { category: "House / Tenant Insurance", amount: 220 },
    { category: "E-Subscriptions & Apps", amount: 60 },
    { category: "Eating Out", amount: 180 },
    { category: "Other Health Expenses", amount: 120 }
];
const NEEDS_CATEGORIES = new Set([
    "Rent",
    "First Mortgage",
    "Groceries",
    "Hydro / Power",
    "Phone (Including Long Distance)",
    "Internet",
    "Bus / Taxi / Ride Share",
    "House / Tenant Insurance",
    "Daycare",
    "Other Health Expenses"
]);
const CATEGORY_META_BY_NAME = new Map();
const CATEGORY_NAME_BY_KEY = new Map();
for (const major of categoryCatalog_1.CATEGORY_CATALOG) {
    for (const sub of major.subcategories) {
        CATEGORY_META_BY_NAME.set(sub.name.toLowerCase(), {
            majorCategoryKey: major.key,
            majorCategoryName: major.name,
            categoryKey: sub.key
        });
        CATEGORY_NAME_BY_KEY.set(sub.key, sub.name);
    }
}
function getPeriodRange(cycle, referenceDate, paydayAnchor) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    if (cycle === "monthly") {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }
    const anchor = paydayAnchor ? new Date(paydayAnchor) : new Date(date.getFullYear(), 0, 1);
    anchor.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((date.getTime() - anchor.getTime()) / msPerDay);
    const periodOffset = Math.floor(diffDays / 14);
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + periodOffset * 14);
    const end = new Date(start);
    end.setDate(start.getDate() + 13);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}
function getPreviousPeriodRange(cycle, currentStart) {
    const prevEnd = new Date(currentStart);
    prevEnd.setMilliseconds(-1);
    if (cycle === "monthly") {
        const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
        return { start: prevStart, end: prevEnd };
    }
    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 14);
    prevStart.setHours(0, 0, 0, 0);
    return { start: prevStart, end: prevEnd };
}
function getRolloverAmount(mode, budgetAmount, previousSpent) {
    const delta = budgetAmount - previousSpent;
    if (mode === "none")
        return 0;
    if (mode === "carry-unused")
        return Math.max(0, delta);
    return delta;
}
function getAlertLevel(percentUsed) {
    if (percentUsed >= 100)
        return 100;
    if (percentUsed >= 90)
        return 90;
    if (percentUsed >= 75)
        return 75;
    if (percentUsed >= 50)
        return 50;
    return 0;
}
function getMajorMeta(category, categoryKey) {
    if (categoryKey && CATEGORY_NAME_BY_KEY.has(categoryKey)) {
        const name = CATEGORY_NAME_BY_KEY.get(categoryKey);
        return CATEGORY_META_BY_NAME.get(name.toLowerCase()) || {};
    }
    return CATEGORY_META_BY_NAME.get(category.toLowerCase()) || {};
}
// All routes require authentication
router.use(requireLogin_1.requireAuth);
// GET /templates/canada — return the preset Canadian budget template categories and amounts
router.get("/templates/canada", (_req, res) => {
    return res.json({
        templates: CANADIAN_TEMPLATE_CATEGORIES
    });
});
// POST /templates/canada/apply — bulk-create Canadian template budgets skipping existing ones
router.post("/templates/canada/apply", async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = "monthly", rolloverMode = "carry-unused", startDate } = req.body || {};
        if (!["biweekly", "monthly"].includes(period)) {
            return res.status(400).json({ message: "Period must be biweekly or monthly" });
        }
        const existing = await Budget_1.Budget.find({ userId, period, isActive: true }, { category: 1 }).lean();
        const existingCategories = new Set(existing.map((b) => b.category));
        const toCreate = CANADIAN_TEMPLATE_CATEGORIES
            .filter((t) => !existingCategories.has(t.category))
            .map((t) => ({
            userId,
            category: t.category,
            amount: t.amount,
            period,
            rolloverMode,
            startDate: startDate ? new Date(startDate) : new Date(),
            isActive: true,
            ...getMajorMeta(t.category)
        }));
        if (toCreate.length > 0) {
            await Budget_1.Budget.insertMany(toCreate);
        }
        return res.json({ message: "Canadian templates applied", created: toCreate.length });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /major-plan — upsert subcategory budgets for an entire major category at once
router.post("/major-plan", async (req, res) => {
    try {
        const userId = req.user.id;
        const { majorCategoryKey, period = "monthly", rolloverMode = "carry-unused", startDate, totalAmount, allocations, replaceExisting = true } = req.body || {};
        const major = categoryCatalog_1.CATEGORY_CATALOG.find((m) => m.key === majorCategoryKey);
        if (!major) {
            return res.status(400).json({ message: "Invalid majorCategoryKey" });
        }
        if (!Array.isArray(allocations) || allocations.length === 0) {
            return res.status(400).json({ message: "allocations are required" });
        }
        const normalizedAllocations = allocations
            .map((a) => {
            const subName = a.subcategoryName || (a.subcategoryKey ? CATEGORY_NAME_BY_KEY.get(a.subcategoryKey) : undefined);
            const amount = Number(a.amount);
            if (!subName || !isFinite(amount) || amount < 0)
                return null;
            const sub = major.subcategories.find((s) => s.name === subName || s.key === a.subcategoryKey);
            if (!sub)
                return null;
            return {
                subcategoryName: sub.name,
                subcategoryKey: sub.key,
                amount
            };
        })
            .filter(Boolean);
        if (normalizedAllocations.length === 0) {
            return res.status(400).json({ message: "No valid allocations provided" });
        }
        const sum = normalizedAllocations.reduce((s, a) => s + a.amount, 0);
        if (isFinite(Number(totalAmount)) && Math.abs(Number(totalAmount) - sum) > 0.01) {
            return res.status(400).json({
                message: `Allocation total ${sum.toFixed(2)} does not match major total ${Number(totalAmount).toFixed(2)}`
            });
        }
        const effectiveStartDate = startDate ? new Date(startDate) : new Date();
        const upserted = [];
        const includedSubcategoryNames = new Set();
        for (const allocation of normalizedAllocations) {
            includedSubcategoryNames.add(allocation.subcategoryName);
            const budget = await Budget_1.Budget.findOneAndUpdate({
                userId,
                period,
                category: allocation.subcategoryName
            }, {
                userId,
                category: allocation.subcategoryName,
                categoryKey: allocation.subcategoryKey,
                majorCategoryKey: major.key,
                majorCategoryName: major.name,
                amount: allocation.amount,
                period,
                rolloverMode,
                isActive: true,
                startDate: effectiveStartDate
            }, { new: true, upsert: true, setDefaultsOnInsert: true });
            upserted.push(budget);
        }
        if (replaceExisting) {
            await Budget_1.Budget.updateMany({
                userId,
                period,
                majorCategoryKey: major.key,
                category: { $nin: Array.from(includedSubcategoryNames) }
            }, { $set: { isActive: false } });
        }
        return res.json({
            message: `Saved major budget plan for ${major.name}`,
            majorCategoryKey: major.key,
            majorCategoryName: major.name,
            totalAmount: sum,
            budgetCount: upserted.length,
            deactivatedCount: replaceExisting ? Math.max(0, major.subcategories.length - includedSubcategoryNames.size) : 0,
            budgets: upserted
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /major-plan/:majorCategoryKey — remove all budgets for a major category and period
router.delete("/major-plan/:majorCategoryKey", async (req, res) => {
    try {
        const userId = req.user.id;
        const majorCategoryKey = req.params.majorCategoryKey;
        const period = (req.query.period || "monthly");
        if (!["biweekly", "monthly"].includes(period)) {
            return res.status(400).json({ message: "Period must be biweekly or monthly" });
        }
        const major = categoryCatalog_1.CATEGORY_CATALOG.find((m) => m.key === majorCategoryKey);
        if (!major) {
            return res.status(400).json({ message: "Invalid majorCategoryKey" });
        }
        const result = await Budget_1.Budget.deleteMany({
            userId,
            period,
            majorCategoryKey
        });
        return res.json({
            message: `Deleted ${result.deletedCount || 0} budgets for ${major.name} (${period})`,
            majorCategoryKey,
            period,
            deletedCount: result.deletedCount || 0
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /summary — spending vs budget per category for the current period, with rollover
router.get("/summary", async (req, res) => {
    try {
        const userId = req.user.id;
        const cycle = (req.query.cycle || "monthly");
        if (!["biweekly", "monthly"].includes(cycle)) {
            return res.status(400).json({ message: "cycle must be biweekly or monthly" });
        }
        const referenceDate = req.query.referenceDate ? new Date(req.query.referenceDate) : new Date();
        const paydayAnchor = req.query.paydayAnchor ? new Date(req.query.paydayAnchor) : undefined;
        const { start, end } = getPeriodRange(cycle, referenceDate, paydayAnchor);
        const previous = getPreviousPeriodRange(cycle, start);
        const budgets = await Budget_1.Budget.find({ userId, period: cycle, isActive: true }).sort({ category: 1 });
        const items = [];
        let totalBudgeted = 0;
        let totalEffectiveBudget = 0;
        let totalSpent = 0;
        for (const budget of budgets) {
            const majorMeta = getMajorMeta(budget.category, budget.categoryKey);
            const majorKey = budget.majorCategoryKey || majorMeta.majorCategoryKey;
            const flowType = majorKey === "income" ? "income" : "expense";
            const [currentTxns, previousTxns] = await Promise.all([
                Transaction_1.Transaction.find({
                    userId,
                    category: budget.category,
                    type: flowType,
                    date: { $gte: start, $lte: end }
                }, { amount: 1 }).lean(),
                Transaction_1.Transaction.find({
                    userId,
                    category: budget.category,
                    type: flowType,
                    date: { $gte: previous.start, $lte: previous.end }
                }, { amount: 1 }).lean()
            ]);
            const currentSpent = currentTxns.reduce((sum, t) => sum + t.amount, 0);
            const previousSpent = previousTxns.reduce((sum, t) => sum + t.amount, 0);
            // Prevent first-cycle double counting: only roll over if budget existed before current period.
            const budgetStartDate = new Date(budget.startDate);
            const hasPriorCycle = budgetStartDate < start;
            const rolloverAmount = hasPriorCycle
                ? getRolloverAmount((budget.rolloverMode || "carry-unused"), budget.amount, previousSpent)
                : 0;
            const effectiveBudget = Math.max(0, budget.amount + rolloverAmount);
            const remaining = effectiveBudget - currentSpent;
            const percentUsed = effectiveBudget > 0 ? (currentSpent / effectiveBudget) * 100 : 0;
            const alertLevel = getAlertLevel(percentUsed);
            totalBudgeted += budget.amount;
            totalEffectiveBudget += effectiveBudget;
            totalSpent += currentSpent;
            items.push({
                budget,
                currentSpent,
                previousSpent,
                rolloverAmount,
                effectiveBudget,
                remaining,
                percentUsed: Math.round(percentUsed * 100) / 100,
                alertLevel,
                transactionCount: currentTxns.length,
                majorCategoryKey: budget.majorCategoryKey || majorMeta.majorCategoryKey,
                majorCategoryName: budget.majorCategoryName || majorMeta.majorCategoryName
            });
        }
        const majorSummaryMap = {};
        for (const item of items) {
            const majorKey = item.majorCategoryKey || "other";
            const majorName = item.majorCategoryName || "Other";
            if (!majorSummaryMap[majorKey]) {
                majorSummaryMap[majorKey] = {
                    majorCategoryKey: majorKey,
                    majorCategoryName: majorName,
                    totalBudgeted: 0,
                    totalEffectiveBudget: 0,
                    totalSpent: 0,
                    totalRemaining: 0,
                    percentUsed: 0,
                    subcategoryCount: 0
                };
            }
            majorSummaryMap[majorKey].totalBudgeted += item.budget.amount;
            majorSummaryMap[majorKey].totalEffectiveBudget += item.effectiveBudget;
            majorSummaryMap[majorKey].totalSpent += item.currentSpent;
            majorSummaryMap[majorKey].totalRemaining += item.remaining;
            majorSummaryMap[majorKey].subcategoryCount += 1;
        }
        const majorSummaries = Object.values(majorSummaryMap).map((m) => ({
            ...m,
            percentUsed: m.totalEffectiveBudget > 0 ? Math.round((m.totalSpent / m.totalEffectiveBudget) * 10000) / 100 : 0
        }));
        const totalRemaining = totalEffectiveBudget - totalSpent;
        return res.json({
            cycle,
            periodStart: start,
            periodEnd: end,
            previousPeriodStart: previous.start,
            previousPeriodEnd: previous.end,
            totals: {
                totalBudgeted,
                totalEffectiveBudget,
                totalSpent,
                totalRemaining,
                percentUsed: totalEffectiveBudget > 0 ? Math.round((totalSpent / totalEffectiveBudget) * 10000) / 100 : 0
            },
            majorSummaries,
            items
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /payday-plan — allocate a paycheck across budget envelopes after savings and debt
router.get("/payday-plan", async (req, res) => {
    try {
        const userId = req.user.id;
        const cycle = (req.query.cycle || "biweekly");
        const netPay = Number(req.query.netPay || 0);
        const savingsPct = Number(req.query.savingsPct || 20);
        const debtPct = Number(req.query.debtPct || 20);
        if (!isFinite(netPay) || netPay <= 0) {
            return res.status(400).json({ message: "netPay must be a positive number" });
        }
        const referenceDate = req.query.referenceDate ? new Date(req.query.referenceDate) : new Date();
        const paydayAnchor = req.query.paydayAnchor ? new Date(req.query.paydayAnchor) : undefined;
        const { start, end } = getPeriodRange(cycle, referenceDate, paydayAnchor);
        const budgets = await Budget_1.Budget.find({ userId, period: cycle, isActive: true }).lean();
        const allocations = [];
        const savingsAmount = Math.max(0, (netPay * savingsPct) / 100);
        const debtAmount = Math.max(0, (netPay * debtPct) / 100);
        const envelopesPool = Math.max(0, netPay - savingsAmount - debtAmount);
        const remainingByBudget = await Promise.all(budgets.map(async (budget) => {
            const txns = await Transaction_1.Transaction.find({
                userId,
                category: budget.category,
                type: "expense",
                date: { $gte: start, $lte: end }
            }, { amount: 1 }).lean();
            const spent = txns.reduce((sum, t) => sum + t.amount, 0);
            const remaining = Math.max(0, budget.amount - spent);
            return { category: budget.category, remaining };
        }));
        const totalRemaining = remainingByBudget.reduce((sum, item) => sum + item.remaining, 0);
        for (const item of remainingByBudget) {
            const share = totalRemaining > 0 ? item.remaining / totalRemaining : 0;
            const suggested = Math.round(envelopesPool * share * 100) / 100;
            allocations.push({
                category: item.category,
                suggested,
                kind: NEEDS_CATEGORIES.has(item.category) ? "needs" : "wants"
            });
        }
        const totalAllocated = allocations.reduce((sum, a) => sum + a.suggested, 0);
        if (allocations.length > 0) {
            const delta = Math.round((envelopesPool - totalAllocated) * 100) / 100;
            allocations[0].suggested = Math.round((allocations[0].suggested + delta) * 100) / 100;
        }
        return res.json({
            cycle,
            periodStart: start,
            periodEnd: end,
            netPay,
            savingsAmount,
            debtAmount,
            envelopesAmount: envelopesPool,
            allocations
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET / — list all budgets for the logged-in user
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const budgets = await Budget_1.Budget.find({ userId }).sort({ startDate: -1 });
        return res.json(budgets);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /:id — fetch a single budget by ID
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const budget = await Budget_1.Budget.findOne({ _id: req.params.id, userId });
        if (!budget) {
            return res.status(404).json({ message: "Budget not found" });
        }
        return res.json(budget);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /:id/spending — return a budget with total spent, remaining, and percent used
router.get("/:id/spending", async (req, res) => {
    try {
        const userId = req.user.id;
        const budget = await Budget_1.Budget.findOne({ _id: req.params.id, userId });
        if (!budget) {
            return res.status(404).json({ message: "Budget not found" });
        }
        const endDate = budget.endDate || new Date();
        const transactions = await Transaction_1.Transaction.find({
            userId,
            category: budget.category,
            type: "expense",
            date: { $gte: budget.startDate, $lte: endDate }
        });
        const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
        const remaining = budget.amount - totalSpent;
        const percentUsed = (totalSpent / budget.amount) * 100;
        return res.json({
            budget,
            totalSpent,
            remaining,
            percentUsed: Math.round(percentUsed * 100) / 100
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new budget with category, amount, period, and rollover settings
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, categoryKey, amount, period, rolloverMode, isActive, startDate, endDate } = req.body;
        if (!category || amount === undefined || !startDate) {
            return res.status(400).json({ message: "Category, amount, and start date are required" });
        }
        const majorMeta = getMajorMeta(category, categoryKey);
        const budget = await Budget_1.Budget.create({
            userId,
            category,
            categoryKey: categoryKey || majorMeta.categoryKey,
            majorCategoryKey: majorMeta.majorCategoryKey,
            majorCategoryName: majorMeta.majorCategoryName,
            amount,
            period: period || "monthly",
            rolloverMode: rolloverMode || "carry-unused",
            isActive: isActive !== undefined ? Boolean(isActive) : true,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : undefined
        });
        return res.status(201).json(budget);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// PUT /:id — update budget fields and re-resolve major category metadata
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, categoryKey, amount, period, rolloverMode, isActive, startDate, endDate } = req.body;
        const majorMeta = category ? getMajorMeta(category, categoryKey) : {};
        const updateData = {
            category,
            categoryKey,
            majorCategoryKey: majorMeta.majorCategoryKey,
            majorCategoryName: majorMeta.majorCategoryName,
            amount,
            period,
            rolloverMode,
            isActive
        };
        if (startDate)
            updateData.startDate = new Date(startDate);
        if (endDate)
            updateData.endDate = new Date(endDate);
        const budget = await Budget_1.Budget.findOneAndUpdate({ _id: req.params.id, userId }, updateData, { new: true, runValidators: true });
        if (!budget) {
            return res.status(404).json({ message: "Budget not found" });
        }
        return res.json(budget);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove a budget by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const budget = await Budget_1.Budget.findOneAndDelete({ _id: req.params.id, userId });
        if (!budget) {
            return res.status(404).json({ message: "Budget not found" });
        }
        return res.json({ message: "Budget deleted" });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
