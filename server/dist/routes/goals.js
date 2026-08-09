"use strict";
// Goal routes: CRUD for savings goals with progress tracking and monthly contribution calc
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Goal_1 = require("../models/Goal");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireLogin);
// GET / — list all goals with progress %, months remaining, and recommended monthly
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const goals = await Goal_1.Goal.find({ userId }).sort({ priority: -1, targetDate: 1 });
        const goalsWithProgress = goals.map(goal => ({
            ...goal.toObject(),
            progressPercentage: Math.min(100, (goal.currentAmount / goal.targetAmount) * 100),
            monthsRemaining: Math.ceil((goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)),
            recommendedMonthlyContribution: calculateRecommendedMonthly(goal),
        }));
        res.json({ goals: goalsWithProgress });
    }
    catch (err) {
        next(err);
    }
});
// POST / — create a new savings goal
router.post('/', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { name, description, category, targetAmount, currentAmount = 0, targetDate, priority = 'medium', monthlyContribution, notes } = req.body;
        if (!name || !targetAmount || !targetDate) {
            return res.status(400).json({ message: 'Name, targetAmount, and targetDate are required' });
        }
        const goal = await Goal_1.Goal.create({
            userId,
            name,
            description,
            category,
            targetAmount,
            currentAmount,
            targetDate: new Date(targetDate),
            priority,
            monthlyContribution,
            notes,
        });
        res.json({ goal });
    }
    catch (err) {
        next(err);
    }
});
// GET /:id — fetch a single goal with computed progress fields
router.get('/:id', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const goal = await Goal_1.Goal.findOne({ _id: req.params.id, userId });
        if (!goal) {
            return res.status(404).json({ message: 'Goal not found' });
        }
        const goalWithProgress = {
            ...goal.toObject(),
            progressPercentage: Math.min(100, (goal.currentAmount / goal.targetAmount) * 100),
            monthsRemaining: Math.ceil((goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)),
            recommendedMonthlyContribution: calculateRecommendedMonthly(goal),
        };
        res.json({ goal: goalWithProgress });
    }
    catch (err) {
        next(err);
    }
});
// PUT /:id — update goal fields
router.put('/:id', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { name, description, category, targetAmount, currentAmount, targetDate, priority, status, monthlyContribution, notes } = req.body;
        const goal = await Goal_1.Goal.findOneAndUpdate({ _id: req.params.id, userId }, {
            name,
            description,
            category,
            targetAmount,
            currentAmount,
            targetDate: targetDate ? new Date(targetDate) : undefined,
            priority,
            status,
            monthlyContribution,
            notes,
        }, { new: true });
        if (!goal) {
            return res.status(404).json({ message: 'Goal not found' });
        }
        res.json({ goal });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /:id — remove a goal by ID
router.delete('/:id', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const goal = await Goal_1.Goal.findOneAndDelete({ _id: req.params.id, userId });
        if (!goal) {
            return res.status(404).json({ message: 'Goal not found' });
        }
        res.json({ message: 'Goal deleted' });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /:id/progress — add an amount to currentAmount and auto-complete when target is reached
router.patch('/:id/progress', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { amount } = req.body;
        if (amount == null) {
            return res.status(400).json({ message: 'Amount is required' });
        }
        const goal = await Goal_1.Goal.findOne({ _id: req.params.id, userId });
        if (!goal) {
            return res.status(404).json({ message: 'Goal not found' });
        }
        goal.currentAmount += amount;
        if (goal.currentAmount > goal.targetAmount) {
            goal.currentAmount = goal.targetAmount;
            goal.status = 'completed';
        }
        await goal.save();
        res.json({ goal });
    }
    catch (err) {
        next(err);
    }
});
function calculateRecommendedMonthly(goal) {
    const monthsRemaining = Math.ceil((goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
    if (monthsRemaining <= 0)
        return 0;
    const amountRemaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    return Math.ceil(amountRemaining / monthsRemaining);
}
exports.default = router;
