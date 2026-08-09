"use strict";
// Tax routes: RRSP/TFSA account management, contribution room, RRSP vs TFSA comparison, and capital gains
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
const TaxAccount_1 = require("../models/TaxAccount");
const Investment_1 = require("../models/Investment");
const requireLogin_1 = require("../middleware/requireLogin");
const taxPlanner = __importStar(require("../utils/taxPlanner"));
const router = (0, express_1.Router)();
// Require authentication for all routes
router.use(requireLogin_1.requireLogin);
// GET / — list all tax accounts for the user
router.get("/", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const taxAccounts = await TaxAccount_1.TaxAccount.find({ userId }).populate("linkedAccountId");
        res.json({ taxAccounts });
    }
    catch (err) {
        next(err);
    }
});
// POST / — create a tax account and seed initial RRSP/TFSA contribution room
router.post("/", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { accountType, accountName, linkedAccountId, priorYearIncome, maritalStatus } = req.body;
        if (!accountType || !accountName) {
            return res.status(400).json({ message: "accountType and accountName required" });
        }
        // Initialize contribution room based on account type
        let rrspLifetimeRoom = 0;
        let tfsaLifetimeRoom = 0;
        if (accountType === "rrsp" && priorYearIncome) {
            rrspLifetimeRoom = Math.min(priorYearIncome * 0.18, taxPlanner.TAX_LIMITS.RRSP_ANNUAL_MAX);
        }
        if (accountType === "tfsa") {
            // Canadian gets $7,000 per year (simplified - should track actual limit by year)
            tfsaLifetimeRoom = taxPlanner.TAX_LIMITS.TFSA_ANNUAL_LIMIT;
        }
        const taxAccount = await TaxAccount_1.TaxAccount.create({
            userId,
            accountType,
            accountName,
            linkedAccountId,
            priorYearIncome,
            maritalStatus,
            rrspLifetimeRoom,
            tfsaLifetimeRoom,
            currency: "CAD",
        });
        res.status(201).json({ taxAccount });
    }
    catch (err) {
        next(err);
    }
});
// GET /tfsa-room/calculator — compute lifetime TFSA room and penalty from birth year and contributions
// Must be declared before /:id to avoid Express treating "tfsa-room" as an ID.
router.get("/tfsa-room/calculator", async (req, res, next) => {
    try {
        const { birthYear, totalContributions = "0", totalWithdrawalsPriorYears = "0", } = req.query;
        if (!birthYear) {
            return res.status(400).json({ message: "birthYear is required" });
        }
        const by = Number(birthYear);
        const tc = Number(totalContributions);
        const twpy = Number(totalWithdrawalsPriorYears);
        const currentYear = new Date().getFullYear();
        if (by < 1900 || by > currentYear - 17) {
            return res.status(400).json({ message: "Invalid birth year" });
        }
        const result = taxPlanner.calculateTFSARoomFromBirthYear(by, tc, twpy);
        // Next-year room: what can they contribute starting Jan 1 of next year?
        const nextYearSchedule = taxPlanner.calculateTFSALifetimeRoomSchedule(by, currentYear + 1);
        const nextYearRoom = nextYearSchedule[nextYearSchedule.length - 1]?.cumulativeRoom ?? 0;
        const nextYearNewLimit = taxPlanner.TFSA_ANNUAL_LIMITS[currentYear + 1] ?? 7000;
        res.json({
            birthYear: by,
            firstEligibleYear: Math.max(2009, by + 18),
            currentYear,
            lifetimeRoom: result.lifetimeRoom,
            totalContributions: tc,
            totalWithdrawalsPriorYears: twpy,
            remainingRoom: result.remainingRoom,
            overContribution: result.overContribution,
            monthlyPenalty: result.monthlyPenalty,
            isOverContributed: result.overContribution > 0,
            nextYearTotalRoom: nextYearRoom,
            nextYearNewLimit,
            schedule: result.schedule,
            notes: [
                "Withdrawals made in prior calendar years re-add to your room on January 1 of the following year.",
                "Withdrawals made in the current calendar year add back on January 1 next year.",
                "Over-contributions are penalised at 1% per month on the excess amount.",
                "Room accumulates even if you have no TFSA open, as long as you are 18+ and a Canadian resident.",
            ],
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /:id — fetch a tax account and its linked investment positions
router.get("/:id", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId }).populate("linkedAccountId");
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const investments = await Investment_1.Investment.find({ taxAccountId: id });
        res.json({ taxAccount, investments });
    }
    catch (err) {
        next(err);
    }
});
// GET /:id/rrsp-room — calculate remaining RRSP deduction room for this year
router.get("/:id/rrsp-room", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const remainingRoom = taxPlanner.calculateRRSPRoom(taxAccount.priorYearIncome || 0, taxAccount.rrspContributions || 0, taxAccount.rrspLifetimeRoom || 0);
        res.json({
            rrspLifetimeRoom: taxAccount.rrspLifetimeRoom,
            rrspContributions: taxAccount.rrspContributions,
            remainingRoom,
            recommendation: remainingRoom > 0
                ? `You can contribute up to $${remainingRoom.toFixed(2)} to your RRSP this year`
                : "You have no remaining RRSP contribution room",
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /:id/tfsa-room — calculate remaining TFSA contribution room
router.get("/:id/tfsa-room", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const remainingRoom = taxPlanner.calculateTFSARoom(taxAccount.tfsaLifetimeRoom || 0, taxAccount.tfsaContributions || 0);
        res.json({
            tfsaLifetimeRoom: taxAccount.tfsaLifetimeRoom,
            tfsaContributions: taxAccount.tfsaContributions,
            remainingRoom,
            recommendation: remainingRoom > 0
                ? `You can contribute up to $${remainingRoom.toFixed(2)} to your TFSA this year`
                : "You have no remaining TFSA contribution room",
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /:id/tax-loss-harvesting — find unrealized-loss positions available for harvesting
router.get("/:id/tax-loss-harvesting", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const investments = await Investment_1.Investment.find({ taxAccountId: id, soldDate: null });
        const opportunities = taxPlanner.identifyTaxLossHarvestingOpportunities(investments, taxAccount.accountType);
        const totalHarvestableLoss = opportunities.reduce((sum, inv) => sum + Math.abs(inv.unrealizedGain), 0);
        res.json({
            opportunities,
            totalHarvestableLoss,
            recommendation: opportunities.length > 0
                ? `Selling these positions would realize $${totalHarvestableLoss.toFixed(2)} in losses to offset gains`
                : "No tax-loss harvesting opportunities found",
        });
    }
    catch (err) {
        next(err);
    }
});
// POST /:id/rrsp-tax-savings — estimate tax refund from an RRSP contribution at a marginal rate
router.post("/:id/rrsp-tax-savings", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { contributionAmount, marginalTaxRate } = req.body;
        if (!contributionAmount) {
            return res.status(400).json({ message: "contributionAmount required" });
        }
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const taxSavings = taxPlanner.calculateRRSPTaxSavings(contributionAmount, marginalTaxRate || 30);
        res.json(taxSavings);
    }
    catch (err) {
        next(err);
    }
});
// POST /:id/capital-gains-tax — estimate tax owing on unrealized gains in non-registered accounts
router.post("/:id/capital-gains-tax", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { unrealizedGain, marginalTaxRate, priorGainsThisYear = 0 } = req.body;
        if (unrealizedGain === undefined) {
            return res.status(400).json({ message: "unrealizedGain required" });
        }
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        // Only taxable in non-registered accounts
        if (taxAccount.accountType !== "non-registered") {
            return res.json({
                accountType: taxAccount.accountType,
                message: "No capital gains tax in TFSA or RRSP accounts",
                taxOwed: 0,
            });
        }
        const taxInfo = taxPlanner.calculateCapitalGainsTax(unrealizedGain, marginalTaxRate || 30, priorGainsThisYear);
        res.json(taxInfo);
    }
    catch (err) {
        next(err);
    }
});
// GET /:id/dividend-optimization — recommend best account type for dividend income
router.get("/:id/dividend-optimization", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const taxAccount = await TaxAccount_1.TaxAccount.findOne({ _id: id, userId });
        if (!taxAccount) {
            return res.status(404).json({ message: "Tax account not found" });
        }
        const optimization = taxPlanner.optimizeDividendAccounts(taxAccount.accountType);
        res.json(optimization);
    }
    catch (err) {
        next(err);
    }
});
// POST /spousal-rrsp/recommendation — advise on spousal RRSP contributions for income splitting
router.post("/spousal-rrsp/recommendation", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { highEarnerIncome, lowEarnerIncome, highEarnerMarginalRate, lowEarnerMarginalRate } = req.body;
        if (!highEarnerIncome || !lowEarnerIncome) {
            return res
                .status(400)
                .json({ message: "highEarnerIncome and lowEarnerIncome required" });
        }
        const recommendation = taxPlanner.recommendSpousalRRSP(highEarnerIncome, lowEarnerIncome, highEarnerMarginalRate || 40, lowEarnerMarginalRate || 20);
        res.json(recommendation);
    }
    catch (err) {
        next(err);
    }
});
// POST /:id/optimal-withdrawal-sequence — order withdrawals across accounts to minimize tax
router.post("/:id/optimal-withdrawal-sequence", async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { neededAmount, nonRegisteredBalance, tfsaBalance, rrspBalance, marginalTaxRate } = req.body;
        if (!neededAmount) {
            return res.status(400).json({ message: "neededAmount required" });
        }
        const sequence = taxPlanner.calculateOptimalWithdrawalSequence(neededAmount, nonRegisteredBalance || 0, tfsaBalance || 0, rrspBalance || 0, marginalTaxRate || 30);
        res.json(sequence);
    }
    catch (err) {
        next(err);
    }
});
// GET /marginal-rate/calculator — return federal + provincial marginal rates for an income/province
router.get("/marginal-rate/calculator", async (req, res, next) => {
    try {
        const { income = 50000, province = "ON" } = req.query;
        const detail = taxPlanner.getMarginalTaxRateDetailed(Number(income), String(province));
        res.json(detail);
    }
    catch (err) {
        next(err);
    }
});
// POST /rrsp-vs-tfsa — compare RRSP vs TFSA retirement value on a same-pre-tax-cost basis
// RRSP wins when the current marginal rate exceeds the expected retirement rate.
router.post("/rrsp-vs-tfsa", async (req, res, next) => {
    try {
        const { currentIncome, expectedRetirementIncome, province = "ON", contributionAmount, yearsToRetirement, assumedAnnualReturn = 6, } = req.body;
        if (!currentIncome || !expectedRetirementIncome || !contributionAmount || !yearsToRetirement) {
            return res.status(400).json({
                message: "currentIncome, expectedRetirementIncome, contributionAmount, and yearsToRetirement are required",
            });
        }
        const current = taxPlanner.getMarginalTaxRateDetailed(Number(currentIncome), String(province));
        const retirement = taxPlanner.getMarginalTaxRateDetailed(Number(expectedRetirementIncome), String(province));
        const currentRate = current.combinedRate / 100;
        const retirementRate = retirement.combinedRate / 100;
        const C = Number(contributionAmount);
        const n = Number(yearsToRetirement);
        const r = Number(assumedAnnualReturn) / 100;
        const fvF = Math.pow(1 + r, n); // future value factor
        // RRSP path: contribute C, refund = C*currentRate reinvested in TFSA
        const rrspRefund = C * currentRate;
        const rrspFutureGross = C * fvF;
        const rrspFutureAfterTax = rrspFutureGross * (1 - retirementRate);
        const refundTFSAFuture = rrspRefund * fvF; // grows tax-free
        const rrspPathTotal = rrspFutureAfterTax + refundTFSAFuture;
        const rrspNetCost = C * (1 - currentRate); // after refund
        // TFSA path: contribute same after-tax dollars (rrspNetCost) → grows tax-free
        const tfsaContribution = rrspNetCost;
        const tfsaPathTotal = tfsaContribution * fvF;
        const advantage = rrspPathTotal - tfsaPathTotal;
        const rateDiff = current.combinedRate - retirement.combinedRate;
        // Recommendation logic
        let recommendation;
        let recommendationStrength;
        let reasoning;
        if (rateDiff > 5) {
            recommendation = "rrsp";
            recommendationStrength = rateDiff > 15 ? "strong" : "moderate";
            reasoning = `Your current marginal rate (${current.combinedRate.toFixed(1)}%) is ${rateDiff.toFixed(1)} percentage points higher than your expected retirement rate (${retirement.combinedRate.toFixed(1)}%). The RRSP deduction saves you tax now at a higher rate than you will pay on withdrawal.`;
        }
        else if (rateDiff < -5) {
            recommendation = "tfsa";
            recommendationStrength = rateDiff < -15 ? "strong" : "moderate";
            reasoning = `Your expected retirement rate (${retirement.combinedRate.toFixed(1)}%) is higher than your current rate (${current.combinedRate.toFixed(1)}%). TFSA contributions using today's lower-taxed dollars will be worth more than an RRSP that is taxed heavily at withdrawal.`;
        }
        else {
            recommendation = "split";
            recommendationStrength = "marginal";
            reasoning = `Your current (${current.combinedRate.toFixed(1)}%) and expected retirement (${retirement.combinedRate.toFixed(1)}%) marginal rates are similar. Both accounts produce nearly equal results — consider splitting contributions or prioritising TFSA for flexibility.`;
        }
        // OAS clawback warning: project RRSP balance and estimate annual RRIF at 71
        // Rough estimate: if rrspFutureGross / 20 (avg drawdown period) exceeds ~$91K, flag it
        const estimatedAnnualRRIFWithdrawal = rrspFutureGross / 20;
        const oasClawbackThreshold = 91757; // 2024 figure
        const oasClawbackRisk = estimatedAnnualRRIFWithdrawal > oasClawbackThreshold;
        // Year-by-year growth table (5-year increments)
        const growthTable = [];
        const intervals = Math.min(n, 30);
        for (let y = 5; y <= intervals; y += 5) {
            const f = Math.pow(1 + r, y);
            growthTable.push({
                year: y,
                rrspValue: Math.round(C * f * (1 - retirementRate) + C * currentRate * f),
                tfsaValue: Math.round(tfsaContribution * f),
            });
        }
        // always include final year
        if (n % 5 !== 0 && n > 0) {
            growthTable.push({
                year: n,
                rrspValue: Math.round(rrspPathTotal),
                tfsaValue: Math.round(tfsaPathTotal),
            });
        }
        res.json({
            inputs: { currentIncome, expectedRetirementIncome, province, contributionAmount: C, yearsToRetirement: n, assumedAnnualReturn },
            currentRates: { combined: current.combinedRate, federal: current.federalRate, provincial: current.provincialRate, provinceName: current.provinceName },
            retirementRates: { combined: retirement.combinedRate, federal: retirement.federalRate, provincial: retirement.provincialRate },
            rateDifference: rateDiff,
            rrsp: {
                grossContribution: C,
                immediateRefund: Math.round(rrspRefund),
                netCost: Math.round(rrspNetCost),
                futureGrossValue: Math.round(rrspFutureGross),
                futureTaxOnWithdrawal: Math.round(rrspFutureGross * retirementRate),
                futureAfterTaxValue: Math.round(rrspFutureAfterTax),
                refundReinvestedTFSA: Math.round(refundTFSAFuture),
                totalRetirementValue: Math.round(rrspPathTotal),
            },
            tfsa: {
                contribution: Math.round(tfsaContribution),
                futureValue: Math.round(tfsaPathTotal),
                totalRetirementValue: Math.round(tfsaPathTotal),
            },
            advantage: {
                winner: advantage >= 0 ? "rrsp" : "tfsa",
                amount: Math.round(Math.abs(advantage)),
                percent: tfsaPathTotal > 0 ? Math.abs(advantage / tfsaPathTotal * 100) : 0,
            },
            recommendation,
            recommendationStrength,
            reasoning,
            oasClawbackRisk,
            estimatedAnnualRRIFWithdrawal: Math.round(estimatedAnnualRRIFWithdrawal),
            growthTable,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
