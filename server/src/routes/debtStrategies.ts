// Debt strategy routes: avalanche/snowball analysis, consolidation, mortgage acceleration, and lump-sum optimization

import { Router } from "express";
import { Debt } from "../models/Debt";
import { DebtStrategy } from "../models/DebtStrategy";
import { requireLogin } from "../middleware/requireLogin";
import * as debtOptimizer from "../utils/debtOptimizer";
import mongoose from "mongoose";

const router = Router();

// Require authentication for all routes
router.use(requireLogin);

// POST /analyze — run avalanche/snowball/hybrid strategy, save result, and return comparisons
router.post("/analyze", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtIds, strategyType = "hybrid", monthlyBudget = 0, weighting = 50 } = req.body;

    if (!debtIds || debtIds.length === 0) {
      return res.status(400).json({ message: "At least one debt required" });
    }

    // Fetch all debts
    const debts = await Debt.find({ _id: { $in: debtIds }, userId });

    if (debts.length === 0) {
      return res.status(404).json({ message: "No debts found" });
    }

    let plan;
    const totalMinimumPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
    const extraPayment = Math.max(0, monthlyBudget - totalMinimumPayment);

    switch (strategyType) {
      case "avalanche":
        plan = debtOptimizer.calculateAvalancheStrategy(debts, extraPayment);
        break;
      case "snowball":
        plan = debtOptimizer.calculateSnowballStrategy(debts, extraPayment);
        break;
      case "hybrid":
        plan = debtOptimizer.calculateHybridStrategy(debts, extraPayment, weighting);
        break;
      default:
        plan = debtOptimizer.calculateHybridStrategy(debts, extraPayment, weighting);
    }

    // Get comparisons
    const avalanche = debtOptimizer.calculateAvalancheStrategy(debts, extraPayment);
    const snowball = debtOptimizer.calculateSnowballStrategy(debts, extraPayment);

    const recommendations = debtOptimizer.getDebtRecommendations(debts, avalanche, snowball);

    // Save strategy
    const priorityOrder = plan.priorityOrder.map((p) => ({
      debtId: new mongoose.Types.ObjectId(p.debtId),
      debtName: p.debtName,
      currentBalance: p.currentBalance,
      interestRate: p.interestRate,
      priority: p.priority,
      recommendedPayment: p.recommendedPayment,
    }));

    const strategy = await DebtStrategy.create({
      userId,
      name: `${strategyType.toUpperCase()} Strategy`,
      strategyType,
      debtIds,
      monthlyBudget,
      priorityWeighting: weighting,
      totalDebt: plan.totalDebt,
      totalInterest: plan.totalInterest,
      payoffMonths: plan.payoffMonths,
      monthlyPayment: plan.monthlyPayment,
      priorityOrder,
      comparisonWithAvalanche: {
        interestSavings: Math.abs(avalanche.totalInterest - plan.totalInterest),
        monthsSaved: avalanche.payoffMonths - plan.payoffMonths,
      },
      comparisonWithSnowball: {
        interestSavings: Math.abs(snowball.totalInterest - plan.totalInterest),
        monthsAdded: plan.payoffMonths - snowball.payoffMonths,
      },
      recommendations,
    });

    res.status(201).json({
      strategy,
      plan: {
        ...plan,
        monthlyBreakdown: plan.monthlyBreakdown.slice(0, 12), // First 12 months only
      },
      comparisons: {
        avalanche: {
          totalInterest: avalanche.totalInterest,
          payoffMonths: avalanche.payoffMonths,
          monthlyPayment: avalanche.monthlyPayment,
        },
        snowball: {
          totalInterest: snowball.totalInterest,
          payoffMonths: snowball.payoffMonths,
          monthlyPayment: snowball.monthlyPayment,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET / — list all saved debt strategies for the user
router.get("/", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const strategies = await DebtStrategy.find({ userId })
      .populate("debtIds")
      .sort({ createdAt: -1 });

    res.json({ strategies });
  } catch (err) {
    next(err);
  }
});

// GET /:id — fetch a single saved strategy by ID
router.get("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { id } = req.params;

    const strategy = await DebtStrategy.findOne({ _id: id, userId }).populate("debtIds");

    if (!strategy) {
      return res.status(404).json({ message: "Strategy not found" });
    }

    res.json({ strategy });
  } catch (err) {
    next(err);
  }
});

// POST /consolidation-analysis — compare keeping individual debts vs consolidating at a new rate
router.post("/consolidation-analysis", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtIds, consolidationRate = 8, consolidationFee = 0, monthlyBudget = 0 } = req.body;

    if (!debtIds || debtIds.length === 0) {
      return res.status(400).json({ message: "At least one debt required" });
    }

    const debts = await Debt.find({ _id: { $in: debtIds }, userId });

    if (debts.length === 0) {
      return res.status(404).json({ message: "No debts found" });
    }

    const totalMinimumPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
    const extraPayment = Math.max(0, monthlyBudget - totalMinimumPayment);

    const analysis = debtOptimizer.analyzeConsolidation(
      debts,
      consolidationRate,
      consolidationFee,
      extraPayment
    );

    res.json({
      currentPlan: {
        strategy: "Avalanche (Keep Individual Debts)",
        totalInterest: analysis.currentStrategy.totalInterest,
        payoffMonths: analysis.currentStrategy.payoffMonths,
        monthlyPayment: analysis.currentStrategy.monthlyPayment,
        priorityOrder: analysis.currentStrategy.priorityOrder,
      },
      consolidatedPlan: {
        strategy: "Consolidation",
        consolidationRate,
        consolidationFee,
        totalInterest: analysis.consolidatedStrategy.totalInterest,
        payoffMonths: analysis.consolidatedStrategy.payoffMonths,
        monthlyPayment: analysis.consolidatedStrategy.monthlyPayment,
      },
      analysis: {
        interestSavings: analysis.interestSavings,
        timeSavings: analysis.timeSavings,
        recommendation: analysis.recommendation,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /mortgage-acceleration — calculate years and interest saved by accelerating a mortgage
router.post("/mortgage-acceleration", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtId, accelerationMethod = "increased-payment", accelerationAmount = 0 } = req.body;

    if (!debtId) {
      return res.status(400).json({ message: "debtId required" });
    }

    const debt = await Debt.findOne({ _id: debtId, userId });

    if (!debt) {
      return res.status(404).json({ message: "Mortgage not found" });
    }

    const result = debtOptimizer.calculateMortgageAcceleration(
      debt,
      accelerationMethod as any,
      accelerationAmount
    );

    res.json({
      mortgageName: debt.name,
      standardPayoff: {
        monthlyPayment: result.standard.monthlyPayment,
        payoffMonths: result.standard.payoffMonths,
        totalInterest: result.standard.totalInterest,
        payoffDate: result.standard.payoffDate,
      },
      acceleratedPayoff: {
        method: accelerationMethod,
        accelerationAmount,
        monthlyPayment: result.accelerated.monthlyPayment,
        payoffMonths: result.accelerated.payoffMonths,
        totalInterest: result.accelerated.totalInterest,
        payoffDate: result.accelerated.payoffDate,
      },
      savings: {
        interestSavings: result.interestSavings,
        yearsSaved: result.yearsSaved,
      },
      recommendation:
        result.yearsSaved > 2
          ? `🎉 This strategy saves $${result.interestSavings.toFixed(
              2
            )} and ${result.yearsSaved.toFixed(1)} years! Highly recommended.`
          : `⚠️ Savings of $${result.interestSavings.toFixed(
              2
            )} over ${result.yearsSaved.toFixed(
              1
            )} years. May not be worth the extra payments.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /lump-sum-optimization — find which debt to pay down for maximum interest savings
router.post("/lump-sum-optimization", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtIds, lumpSumAmount } = req.body;

    if (!debtIds || debtIds.length === 0) {
      return res.status(400).json({ message: "At least one debt required" });
    }

    if (!lumpSumAmount || lumpSumAmount <= 0) {
      return res.status(400).json({ message: "lumpSumAmount required and must be > 0" });
    }

    const debts = await Debt.find({ _id: { $in: debtIds }, userId });

    if (debts.length === 0) {
      return res.status(404).json({ message: "No debts found" });
    }

    const optimization = debtOptimizer.optimizeLumpSumPayment(debts, lumpSumAmount);

    res.json({
      lumpSumAmount,
      recommendation: optimization.recommendation,
      targetDebt: optimization.targetDebt
        ? {
            name: optimization.targetDebt.name,
            interestRate: optimization.targetDebt.interestRate,
            currentBalance: optimization.targetDebt.currentBalance,
          }
        : null,
      annualInterestSavings: {
        ifAppliedToHighestInterest: optimization.highestInterestFirst,
        ifAppliedToLowestBalance: optimization.lowestBalanceFirst,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /early-payoff — show how extra monthly payments shorten a single debt's timeline
router.post("/early-payoff", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtId, extraMonthlyPayment } = req.body;

    if (!debtId) {
      return res.status(400).json({ message: "debtId required" });
    }

    if (extraMonthlyPayment === undefined || extraMonthlyPayment < 0) {
      return res.status(400).json({ message: "extraMonthlyPayment required" });
    }

    const debt = await Debt.findOne({ _id: debtId, userId });

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    const result = debtOptimizer.calculateEarlyPayoff(debt, extraMonthlyPayment);

    res.json({
      debtName: debt.name,
      currentBalance: debt.currentBalance,
      minimumPayment: debt.minimumPayment,
      extraMonthlyPayment,
      standardPayoff: {
        months: result.standardMonths,
        years: (result.standardMonths / 12).toFixed(1),
        totalInterest: result.interestSaved + (debt.interestRate * debt.currentBalance / 100), // Approximate
      },
      earlyPayoff: {
        months: result.earlyMonths,
        years: (result.earlyMonths / 12).toFixed(1),
        payoffDate: result.newPayoffDate,
      },
      savings: {
        monthsSaved: result.monthsSaved,
        yearsSaved: (result.monthsSaved / 12).toFixed(1),
        interestSaved: result.interestSaved,
        recommendation: `If you pay an extra $${extraMonthlyPayment}/month, you'll be debt-free ${result.monthsSaved} months earlier and save $${result.interestSaved.toFixed(
          2
        )} in interest!`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /recommendations/analysis — generate tailored payoff recommendations for selected debts
router.get("/recommendations/analysis", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const { debtIds, income = 0 } = req.query;

    if (!debtIds) {
      return res.status(400).json({ message: "debtIds query param required" });
    }

    const debtIdArray = (debtIds as string).split(",");
    const debts = await Debt.find({ _id: { $in: debtIdArray }, userId });

    if (debts.length === 0) {
      return res.status(404).json({ message: "No debts found" });
    }

    const totalMinimumPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);

    const avalanche = debtOptimizer.calculateAvalancheStrategy(debts, 0);
    const snowball = debtOptimizer.calculateSnowballStrategy(debts, 0);

    const recommendations = debtOptimizer.getDebtRecommendations(
      debts,
      avalanche,
      snowball,
      Number(income) || 0
    );

    res.json({
      debts: debts.map((d) => ({
        name: d.name,
        type: d.type,
        balance: d.currentBalance,
        rate: d.interestRate,
        minimum: d.minimumPayment,
      })),
      summary: {
        totalDebt: debts.reduce((sum, d) => sum + d.currentBalance, 0),
        totalMinimumPayment,
        averageRate: (
          debts.reduce((sum, d) => sum + d.interestRate, 0) / debts.length
        ).toFixed(1),
      },
      strategies: {
        avalanche: {
          payoffMonths: avalanche.payoffMonths,
          totalInterest: avalanche.totalInterest,
          monthlyPayment: avalanche.monthlyPayment,
        },
        snowball: {
          payoffMonths: snowball.payoffMonths,
          totalInterest: snowball.totalInterest,
          monthlyPayment: snowball.monthlyPayment,
        },
      },
      recommendations,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
