"use strict";
// Debt routes: CRUD, dashboard KPIs, payoff strategy calculators, and account detection
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Debt_1 = require("../models/Debt");
const Account_1 = require("../models/Account");
const Transaction_1 = require("../models/Transaction");
const requireLogin_1 = require("../middleware/requireLogin");
const router = (0, express_1.Router)();
// ── Helpers ───────────────────────────────────────────────────────────────────
function monthlyEquivalent(amount, cadence) {
    return cadence === "biweekly" ? (amount * 26) / 12 : amount;
}
function cadenceEquivalentMonthly(amountMonthly, cadence) {
    return cadence === "biweekly" ? (amountMonthly * 12) / 26 : amountMonthly;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function calculatePayoffStrategy(debts, paymentPerCadence, cadence, method, extraPerCadence = 0) {
    const debtsCopy = debts.map((d) => ({ ...d }));
    if (method === "avalanche") {
        debtsCopy.sort((a, b) => b.interestRate - a.interestRate);
    }
    else {
        debtsCopy.sort((a, b) => a.balance - b.balance);
    }
    const monthlyPaymentTotal = monthlyEquivalent(paymentPerCadence, cadence) + monthlyEquivalent(extraPerCadence, cadence);
    const totalMinimumMonthly = debtsCopy.reduce((sum, d) => sum + d.minimumPayment, 0);
    if (monthlyPaymentTotal < totalMinimumMonthly) {
        return {
            method,
            error: "Payment is less than total minimum payments",
            minimumRequiredMonthly: round2(totalMinimumMonthly)
        };
    }
    const extraMonthly = monthlyPaymentTotal - totalMinimumMonthly;
    let month = 0;
    let totalInterestPaid = 0;
    const payoffSchedule = [];
    while (debtsCopy.some((d) => d.balance > 0.01) && month < 1200) {
        month++;
        let extraRemaining = extraMonthly;
        for (const debt of debtsCopy) {
            if (debt.balance <= 0.01)
                continue;
            const monthlyRate = debt.interestRate / 100 / 12;
            const interestCharge = debt.balance * monthlyRate;
            totalInterestPaid += interestCharge;
            debt.balance += interestCharge;
            const minPay = Math.min(debt.minimumPayment, debt.balance);
            debt.balance -= minPay;
            if (debt.balance > 0.01 && extraRemaining > 0) {
                const extra = Math.min(extraRemaining, debt.balance);
                debt.balance -= extra;
                extraRemaining -= extra;
            }
            if (debt.balance <= 0.01 && !payoffSchedule.some((p) => p.debtId === debt.id)) {
                payoffSchedule.push({ debtId: debt.id, debtName: debt.name, payoffMonth: month });
            }
        }
    }
    const annualInterestEstimate = debts.reduce((sum, debt) => {
        const monthlyRate = debt.interestRate / 100 / 12;
        return sum + debt.balance * monthlyRate * 12;
    }, 0);
    return {
        method,
        cadence,
        paymentPerCadence: round2(paymentPerCadence),
        extraPerCadence: round2(extraPerCadence),
        totalMonths: month,
        totalYears: (month / 12).toFixed(1),
        totalInterestPaid: round2(totalInterestPaid),
        annualInterestEstimate: round2(annualInterestEstimate),
        payoffSchedule
    };
}
function buildPaymentOptimizer(debts, cadence, paymentPerCadence) {
    const monthlyBudget = monthlyEquivalent(paymentPerCadence, cadence);
    const totalMin = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
    const extra = Math.max(0, monthlyBudget - totalMin);
    const ranked = [...debts].sort((a, b) => b.interestRate - a.interestRate);
    const allocations = ranked.map((debt, idx) => {
        const monthlyAllocation = debt.minimumPayment + (idx === 0 ? extra : 0);
        return {
            debtId: debt.id,
            debtName: debt.name,
            interestRate: debt.interestRate,
            recommendedPerCadence: round2(cadenceEquivalentMonthly(monthlyAllocation, cadence)),
            minimumPerCadence: round2(cadenceEquivalentMonthly(debt.minimumPayment, cadence)),
            focusDebt: idx === 0
        };
    });
    return {
        cadence,
        paymentPerCadence: round2(paymentPerCadence),
        totalMinimumPerCadence: round2(cadenceEquivalentMonthly(totalMin, cadence)),
        extraPerCadence: round2(cadenceEquivalentMonthly(extra, cadence)),
        allocations
    };
}
function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
function nextBiweeklyDate(anchorDate, fromDate) {
    const anchor = startOfDay(anchorDate);
    const from = startOfDay(fromDate);
    if (anchor >= from)
        return anchor;
    const diffDays = Math.floor((from.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000));
    const cycles = Math.ceil(diffDays / 14);
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + cycles * 14);
    return startOfDay(next);
}
function nextMonthlyDate(anchorDate, fromDate) {
    const anchor = startOfDay(anchorDate);
    const from = startOfDay(fromDate);
    const desiredDay = anchor.getDate();
    const buildDate = (year, month) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(desiredDay, daysInMonth));
    };
    let candidate = buildDate(from.getFullYear(), from.getMonth());
    candidate = startOfDay(candidate);
    if (candidate < from) {
        candidate = buildDate(from.getFullYear(), from.getMonth() + 1);
        candidate = startOfDay(candidate);
    }
    return candidate;
}
function computeNextDueDate(dueScheduleType, dueDate, referenceDate) {
    if (!dueDate)
        return undefined;
    const mode = dueScheduleType || "specific";
    if (mode === "specific") {
        const specific = startOfDay(new Date(dueDate));
        return specific >= startOfDay(referenceDate) ? specific : undefined;
    }
    if (mode === "biweekly") {
        return nextBiweeklyDate(new Date(dueDate), referenceDate);
    }
    return nextMonthlyDate(new Date(dueDate), referenceDate);
}
// Canadian default rates and amortization terms per liability account type
const LIABILITY_ACCOUNT_TYPES = [
    "credit-card", "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan"
];
const DEBT_DEFAULTS = {
    "credit-card": { debtType: "credit-card", interestRate: 19.99, termMonths: 60, label: "Credit Card" },
    "line-of-credit": { debtType: "other", interestRate: 7.50, termMonths: 120, label: "Line of Credit" },
    "student-loan": { debtType: "student-loan", interestRate: 6.45, termMonths: 114, label: "Student Loan" },
    "mortgage": { debtType: "mortgage", interestRate: 5.25, termMonths: 300, label: "Mortgage" },
    "auto-loan": { debtType: "auto-loan", interestRate: 8.99, termMonths: 60, label: "Auto Loan" },
    "personal-loan": { debtType: "personal-loan", interestRate: 11.99, termMonths: 48, label: "Personal Loan" },
};
function amortizedPayment(balance, annualRate, termMonths) {
    const r = annualRate / 100 / 12;
    if (r === 0 || balance <= 0)
        return round2(balance / termMonths);
    const payment = balance * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
    return round2(payment);
}
// Build a descriptive suggested name: prefer "Institution AccountName" when institution
// isn't already embedded in the account name.
function suggestDebtName(accountName, institution) {
    if (!institution)
        return accountName;
    const norm = accountName.toLowerCase();
    const instNorm = institution.toLowerCase();
    if (norm.includes(instNorm) || instNorm.includes(norm.split(" ")[0]))
        return accountName;
    return `${institution} ${accountName}`;
}
// Human-readable one-liner describing what this debt is.
function generateDescription(accountType, institution, balance) {
    const CAD = (n) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
    const inst = institution ? `${institution} ` : "";
    switch (accountType) {
        case "credit-card": return `${inst}credit card — ${CAD(balance)} outstanding balance`;
        case "line-of-credit": return `${inst}line of credit — ${CAD(balance)} drawn`;
        case "student-loan": return `${inst}student loan — ${CAD(balance)} remaining`;
        case "mortgage": return `${inst}residential mortgage — ${CAD(balance)} principal outstanding`;
        case "auto-loan": return `${inst}vehicle loan — ${CAD(balance)} remaining`;
        case "personal-loan": return `${inst}personal loan — ${CAD(balance)} outstanding`;
        default: return `${inst}debt — ${CAD(balance)} balance`;
    }
}
// Recalculate a liability account's current balance from its transaction history,
// mirroring the logic in accounts.ts getRecalculatedAccountBalance.
async function calcLiabilityBalance(userId, accountId) {
    // Check for a statement balance snapshot first (credit-card style)
    const latestStatement = await Transaction_1.Transaction.findOne({
        userId,
        accountId,
        statementBalance: { $exists: true, $ne: null, $gt: 0 },
    })
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .lean();
    if (latestStatement && typeof latestStatement.statementBalance === "number") {
        return Math.max(0, latestStatement.statementBalance);
    }
    // Sum from individual transactions
    // For liability accounts: expense transactions increase the balance (owe more),
    // income transactions decrease it (payments reduce debt).
    const txns = await Transaction_1.Transaction.find({ userId, accountId }).lean();
    if (txns.length === 0)
        return 0;
    let balance = 0;
    for (const t of txns) {
        // baseDelta (as in accounts.ts): income → +amount, expense → -amount
        const baseDelta = t.type === "income" ? t.amount : -t.amount;
        // Liability: negate baseDelta (expense adds to balance, income reduces it)
        balance += -baseDelta;
    }
    return Math.max(0, balance);
}
// All routes require authentication
router.use(requireLogin_1.requireAuth);
// GET /dashboard — KPI totals, weighted interest rate, and upcoming due dates (30 days)
router.get("/dashboard", async (req, res) => {
    try {
        const userId = req.user.id;
        const debts = await Debt_1.Debt.find({ userId }).sort({ interestRate: -1 });
        // Include untracked liability accounts so KPI cards reflect real debt load
        // even before the user has imported anything via Detect & Import.
        const liabilityAccounts = await Account_1.Account.find({
            userId,
            type: { $in: LIABILITY_ACCOUNT_TYPES },
        }).lean();
        const existingDebtNames = new Set(debts.map((d) => d.name.toLowerCase().trim()));
        const liveAccounts = [];
        for (const acct of liabilityAccounts) {
            const aName = acct.name.toLowerCase().trim();
            const alreadyTracked = [...existingDebtNames].some((n) => n === aName || n.includes(aName) || aName.includes(n));
            if (alreadyTracked)
                continue;
            const balance = await calcLiabilityBalance(userId, acct._id.toString());
            if (balance < 1)
                continue;
            const defaults = DEBT_DEFAULTS[acct.type] ?? { debtType: "other", interestRate: 10, termMonths: 60, label: acct.type };
            liveAccounts.push({
                balance,
                interestRate: defaults.interestRate,
                minimumPayment: amortizedPayment(balance, defaults.interestRate, defaults.termMonths),
            });
        }
        // Combine tracked debts + untracked live accounts
        const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0) +
            liveAccounts.reduce((sum, a) => sum + a.balance, 0);
        const totalMinimumPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0) +
            liveAccounts.reduce((sum, a) => sum + a.minimumPayment, 0);
        const weightedInterestRate = totalDebt > 0
            ? (debts.reduce((sum, d) => sum + d.currentBalance * d.interestRate, 0) +
                liveAccounts.reduce((sum, a) => sum + a.balance * a.interestRate, 0)) / totalDebt
            : 0;
        const monthlyInterestEstimate = debts.reduce((sum, d) => sum + d.currentBalance * (d.interestRate / 100 / 12), 0) +
            liveAccounts.reduce((sum, a) => sum + a.balance * (a.interestRate / 100 / 12), 0);
        const annualInterestEstimate = monthlyInterestEstimate * 12;
        const today = startOfDay(new Date());
        const inThirtyDays = new Date(today);
        inThirtyDays.setDate(inThirtyDays.getDate() + 30);
        const upcomingDue = debts
            .map((d) => {
            const plainDebt = d.toObject();
            const scheduleType = (plainDebt.dueScheduleType || "specific");
            const nextDueDate = computeNextDueDate(scheduleType, plainDebt.dueDate ? new Date(plainDebt.dueDate) : undefined, today);
            return { ...plainDebt, dueScheduleType: scheduleType, nextDueDate };
        })
            .filter((d) => d.nextDueDate && d.nextDueDate >= today && d.nextDueDate <= inThirtyDays)
            .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
        return res.json({
            totals: {
                totalDebt: round2(totalDebt),
                totalMinimumPayment: round2(totalMinimumPayment),
                weightedInterestRate: round2(weightedInterestRate),
                monthlyInterestEstimate: round2(monthlyInterestEstimate),
                annualInterestEstimate: round2(annualInterestEstimate)
            },
            upcomingDue,
            count: debts.length,
            liveAccountCount: liveAccounts.length,
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /payoff/strategies — compare avalanche vs snowball payoff timelines and interest
router.get("/payoff/strategies", async (req, res) => {
    try {
        const userId = req.user.id;
        const paymentAmountRaw = req.query.paymentAmount || req.query.monthlyPayment;
        const cadence = (req.query.cadence || "monthly");
        const extraPayment = Number(req.query.extraPayment || 0);
        if (!paymentAmountRaw) {
            return res.status(400).json({ message: "paymentAmount is required" });
        }
        if (!["monthly", "biweekly"].includes(cadence)) {
            return res.status(400).json({ message: "cadence must be monthly or biweekly" });
        }
        const paymentAmount = Number(paymentAmountRaw);
        if (!isFinite(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).json({ message: "paymentAmount must be a positive number" });
        }
        const debts = await Debt_1.Debt.find({ userId });
        const debtCalcs = debts.map((d) => ({
            id: d._id.toString(), name: d.name, balance: d.currentBalance,
            interestRate: d.interestRate, minimumPayment: d.minimumPayment
        }));
        if (debtCalcs.length === 0) {
            return res.json({ avalanche: null, snowball: null, totalDebts: 0, totalMinimumPayment: 0 });
        }
        const avalanche = calculatePayoffStrategy(debtCalcs, paymentAmount, cadence, "avalanche", extraPayment);
        const snowball = calculatePayoffStrategy(debtCalcs, paymentAmount, cadence, "snowball", extraPayment);
        return res.json({
            avalanche, snowball, cadence, paymentAmount, extraPayment,
            totalDebts: round2(debtCalcs.reduce((sum, d) => sum + d.balance, 0)),
            totalMinimumPayment: round2(cadenceEquivalentMonthly(debtCalcs.reduce((sum, d) => sum + d.minimumPayment, 0), cadence))
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /payoff/optimizer — allocate a payment budget across debts (avalanche priority)
router.get("/payoff/optimizer", async (req, res) => {
    try {
        const userId = req.user.id;
        const cadence = (req.query.cadence || "biweekly");
        const paymentAmount = Number(req.query.paymentAmount || 0);
        if (!isFinite(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).json({ message: "paymentAmount must be positive" });
        }
        const debts = await Debt_1.Debt.find({ userId });
        const debtCalcs = debts.map((d) => ({
            id: d._id.toString(), name: d.name, balance: d.currentBalance,
            interestRate: d.interestRate, minimumPayment: d.minimumPayment
        }));
        return res.json(buildPaymentOptimizer(debtCalcs, cadence, paymentAmount));
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /payoff/what-if — show months and interest saved by adding an extra payment
router.get("/payoff/what-if", async (req, res) => {
    try {
        const userId = req.user.id;
        const cadence = (req.query.cadence || "biweekly");
        const paymentAmount = Number(req.query.paymentAmount || 0);
        const extraPayment = Number(req.query.extraPayment || 0);
        if (!isFinite(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).json({ message: "paymentAmount must be positive" });
        }
        const debts = await Debt_1.Debt.find({ userId });
        const debtCalcs = debts.map((d) => ({
            id: d._id.toString(), name: d.name, balance: d.currentBalance,
            interestRate: d.interestRate, minimumPayment: d.minimumPayment
        }));
        const baseline = calculatePayoffStrategy(debtCalcs, paymentAmount, cadence, "avalanche", 0);
        const scenario = calculatePayoffStrategy(debtCalcs, paymentAmount, cadence, "avalanche", extraPayment);
        if (baseline.error || scenario.error) {
            return res.json({ baseline, scenario, comparison: null });
        }
        const comparison = {
            monthsSaved: baseline.totalMonths - scenario.totalMonths,
            interestSaved: round2(baseline.totalInterestPaid - scenario.totalInterestPaid)
        };
        return res.json({ baseline, scenario, comparison });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /detect-from-accounts — scan liability accounts and suggest debts not yet imported
// Must be declared before /:id so Express doesn't treat "detect-from-accounts" as an ID.
router.get("/detect-from-accounts", async (req, res) => {
    try {
        const userId = req.user.id;
        // Find all liability-type accounts
        const accounts = await Account_1.Account.find({
            userId,
            type: { $in: LIABILITY_ACCOUNT_TYPES },
        }).lean();
        // Existing debts for duplicate detection
        const existingDebts = await Debt_1.Debt.find({ userId }).lean();
        const results = [];
        for (const account of accounts) {
            const defaults = DEBT_DEFAULTS[account.type] ?? {
                debtType: "other",
                interestRate: 10,
                termMonths: 60,
                label: account.type,
            };
            // Recalculate current balance from transactions
            const balance = await calcLiabilityBalance(userId, account._id.toString());
            // Skip accounts with no outstanding balance
            if (balance < 1)
                continue;
            // Calculate amortized minimum payment
            const minPayment = amortizedPayment(balance, defaults.interestRate, defaults.termMonths);
            // Already imported if any existing debt shares a matching name
            const aName = account.name.toLowerCase().trim();
            const alreadyImported = existingDebts.some((d) => {
                const dName = d.name.toLowerCase().trim();
                return dName === aName || dName.includes(aName) || aName.includes(dName);
            });
            const institution = account.institution ?? null;
            results.push({
                accountId: account._id.toString(),
                name: account.name,
                suggestedName: suggestDebtName(account.name, institution),
                description: generateDescription(account.type, institution, balance),
                accountType: account.type,
                accountTypeLabel: defaults.label,
                debtType: defaults.debtType,
                balance,
                institution,
                defaultInterestRate: defaults.interestRate,
                defaultMinPayment: minPayment,
                alreadyImported,
            });
        }
        // Sort: new items first, then by balance descending
        results.sort((a, b) => {
            if (a.alreadyImported !== b.alreadyImported)
                return a.alreadyImported ? 1 : -1;
            return b.balance - a.balance;
        });
        return res.json(results);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to detect debts from accounts" });
    }
});
// GET / — list all debts for the user, sorted by interest rate descending
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const debts = await Debt_1.Debt.find({ userId }).sort({ interestRate: -1 });
        return res.json(debts);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// GET /:id — fetch a single debt by ID
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const debt = await Debt_1.Debt.findOne({ _id: req.params.id, userId });
        if (!debt)
            return res.status(404).json({ message: "Debt not found" });
        return res.json(debt);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST / — create a new tracked debt
router.post("/", async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type, principal, currentBalance, interestRate, minimumPayment, dueDate, dueScheduleType, accountNumber, lender } = req.body;
        if (!name || !type || principal === undefined || currentBalance === undefined ||
            interestRate === undefined || minimumPayment === undefined) {
            return res.status(400).json({
                message: "Name, type, principal, current balance, interest rate, and minimum payment are required"
            });
        }
        const debt = await Debt_1.Debt.create({
            userId, name, type, principal, currentBalance, interestRate, minimumPayment,
            dueScheduleType: (["specific", "monthly", "biweekly"].includes(dueScheduleType) ? dueScheduleType : "specific"),
            dueDate: dueDate ? new Date(dueDate) : undefined,
            accountNumber, lender
        });
        return res.status(201).json(debt);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// PUT /:id — update debt fields including optional due date and schedule type
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type, principal, currentBalance, interestRate, minimumPayment, dueDate, dueScheduleType, accountNumber, lender } = req.body;
        const updateData = { name, type, principal, currentBalance, interestRate, minimumPayment, accountNumber, lender };
        if (["specific", "monthly", "biweekly"].includes(dueScheduleType)) {
            updateData.dueScheduleType = dueScheduleType;
        }
        if (dueDate) {
            updateData.dueDate = new Date(dueDate);
        }
        else if (dueDate === null || dueDate === "") {
            updateData.dueDate = undefined;
        }
        const debt = await Debt_1.Debt.findOneAndUpdate({ _id: req.params.id, userId }, updateData, { new: true, runValidators: true });
        if (!debt)
            return res.status(404).json({ message: "Debt not found" });
        return res.json(debt);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// POST /:id/payment — apply a payment amount to reduce a debt's current balance
router.post("/:id/payment", async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Valid payment amount is required" });
        }
        const debt = await Debt_1.Debt.findOne({ _id: req.params.id, userId });
        if (!debt)
            return res.status(404).json({ message: "Debt not found" });
        debt.currentBalance = Math.max(0, debt.currentBalance - amount);
        await debt.save();
        return res.json(debt);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
// DELETE /:id — remove a tracked debt by ID
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const debt = await Debt_1.Debt.findOneAndDelete({ _id: req.params.id, userId });
        if (!debt)
            return res.status(404).json({ message: "Debt not found" });
        return res.json({ message: "Debt deleted" });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});
exports.default = router;
