"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateAvalancheStrategy = calculateAvalancheStrategy;
exports.calculateSnowballStrategy = calculateSnowballStrategy;
exports.calculateHybridStrategy = calculateHybridStrategy;
exports.analyzeConsolidation = analyzeConsolidation;
exports.calculateMortgageAcceleration = calculateMortgageAcceleration;
exports.optimizeLumpSumPayment = optimizeLumpSumPayment;
exports.calculateEarlyPayoff = calculateEarlyPayoff;
exports.getDebtRecommendations = getDebtRecommendations;
// ── Payoff Strategies ────────────────────────────────────────────────────────
// Sort by highest interest rate and run payoff simulation
function calculateAvalancheStrategy(debts, monthlyExtraPayment = 0, months = 360 // 30 years
) {
    // Sort by interest rate (highest first)
    const sorted = [...debts].sort((a, b) => b.interestRate - a.interestRate);
    return calculatePayoffPlan(sorted, monthlyExtraPayment, "avalanche", months);
}
// Sort by lowest balance first for quicker psychological wins
function calculateSnowballStrategy(debts, monthlyExtraPayment = 0, months = 360) {
    // Sort by balance (lowest first)
    const sorted = [...debts].sort((a, b) => a.currentBalance - b.currentBalance);
    return calculatePayoffPlan(sorted, monthlyExtraPayment, "snowball", months);
}
// Blend avalanche and snowball via a 0–100 weighting (50 = balanced)
function calculateHybridStrategy(debts, monthlyExtraPayment = 0, weighting = 50, // 0-100
months = 360) {
    // Calculate weighted score for each debt
    const withScores = debts.map((debt) => {
        // Normalize interest rate (0-5% → 0-1)
        const normalizedRate = Math.min(debt.interestRate / 5, 1);
        // Normalize balance (relative to max)
        const maxBalance = Math.max(...debts.map((d) => d.currentBalance));
        const normalizedBalance = debt.currentBalance / maxBalance;
        // Combine normalized interest and balance scores with user-supplied weighting
        const avalancheWeight = (weighting / 100) * normalizedRate;
        const snowballWeight = ((100 - weighting) / 100) * normalizedBalance;
        return {
            ...debt,
            hybridScore: avalancheWeight + snowballWeight,
        };
    });
    // Sort by hybrid score (highest first = pay first)
    const sorted = withScores.sort((a, b) => b.hybridScore - a.hybridScore);
    return calculatePayoffPlan(sorted, monthlyExtraPayment, `hybrid-${weighting}`, months);
}
// ── Consolidation & Mortgage ─────────────────────────────────────────────────
// Compare total interest of keeping individual debts vs a single consolidated loan
function analyzeConsolidation(debts, consolidationRate, // Interest rate if consolidated
consolidationFee = 0, // One-time fee
monthlyExtraPayment = 0) {
    // Current strategy (avalanche)
    const current = calculateAvalancheStrategy(debts, monthlyExtraPayment);
    // Create a single consolidated "debt"
    const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    const consolidatedDebt = {
        name: "Consolidated Debt",
        type: "personal-loan",
        principal: totalDebt,
        currentBalance: totalDebt + consolidationFee,
        interestRate: consolidationRate,
        minimumPayment: 0,
        createdAt: new Date(),
    };
    const consolidated = calculatePayoffPlan([consolidatedDebt], monthlyExtraPayment, "consolidation", 360);
    const interestSavings = current.totalInterest - consolidated.totalInterest;
    const timeSavings = current.payoffMonths - consolidated.payoffMonths;
    let recommendation = "";
    if (interestSavings > 5000) {
        recommendation = `✅ Consolidate! You'll save $${interestSavings.toFixed(2)} and pay off ${timeSavings} months faster.`;
    }
    else if (interestSavings > 0) {
        recommendation = `⚠️ Consolidation saves $${interestSavings.toFixed(2)}, but may not be worth the hassle. Keep current strategy.`;
    }
    else {
        recommendation = `❌ Don't consolidate. You'll pay MORE interest. Keep individual debts.`;
    }
    return {
        currentStrategy: current,
        consolidatedStrategy: consolidated,
        interestSavings,
        timeSavings,
        recommendation,
        consolidatedMonthlyPayment: consolidated.monthlyPayment,
    };
}
// Model bi-weekly, lump-sum, or increased payment mortgage acceleration
function calculateMortgageAcceleration(mortgage, accelerationMethod, accelerationAmount = 0 // Extra monthly payment or annual lump sum
) {
    // Standard mortgage payment plan
    const standard = calculatePayoffPlan([mortgage], 0, "standard", 360);
    let accelerated;
    if (accelerationMethod === "biweekly") {
        // 26 bi-weekly payments equal 13 monthly payments, adding one extra per year
        accelerated = calculatePayoffPlan([mortgage], mortgage.minimumPayment / 2, "mortgage-acceleration-biweekly", 360);
    }
    else if (accelerationMethod === "lump-sum") {
        // Annual lump sum payment (bonus, tax refund, etc)
        accelerated = calculateLumpSumPayoff(mortgage, accelerationAmount // Annual lump sum
        );
    }
    else {
        // Increased monthly payment
        accelerated = calculatePayoffPlan([mortgage], accelerationAmount, "mortgage-acceleration-increased", 360);
    }
    const interestSavings = standard.totalInterest - accelerated.totalInterest;
    const yearsSaved = (standard.payoffMonths - accelerated.payoffMonths) / 12;
    return {
        standard,
        accelerated,
        interestSavings,
        yearsSaved,
    };
}
// Recommend which debt to hit with a lump sum for maximum interest savings
function optimizeLumpSumPayment(debts, lumpSumAmount) {
    if (debts.length === 0) {
        return {
            highestInterestFirst: 0,
            lowestBalanceFirst: 0,
            recommendation: "No debts to analyze",
            targetDebt: null,
        };
    }
    // Apply to highest interest
    const highestInterestDebt = debts.reduce((prev, current) => prev.interestRate > current.interestRate ? prev : current);
    const savingsHighestInterest = ((highestInterestDebt.interestRate / 100) * lumpSumAmount) / 12; // Monthly interest saved
    // Apply to lowest balance
    const lowestBalanceDebt = debts.reduce((prev, current) => prev.currentBalance < current.currentBalance ? prev : current);
    const savingsLowestBalance = ((lowestBalanceDebt.interestRate / 100) * lumpSumAmount) / 12;
    let recommendation = "";
    let targetDebt = null;
    if (highestInterestDebt.interestRate >
        lowestBalanceDebt.interestRate + 5) {
        // Gap > 5 pp means interest savings outweigh psychological benefit of clearing a balance
        recommendation = `Apply lump sum to "${highestInterestDebt.name}" (${highestInterestDebt.interestRate}%). Saves $${(savingsHighestInterest * 12).toFixed(2)}/year in interest.`;
        targetDebt = highestInterestDebt;
    }
    else {
        // Otherwise balance wins
        recommendation = `Apply lump sum to "${lowestBalanceDebt.name}". Psychological win + eliminates debt faster.`;
        targetDebt = lowestBalanceDebt;
    }
    return {
        highestInterestFirst: savingsHighestInterest * 12,
        lowestBalanceFirst: savingsLowestBalance * 12,
        recommendation,
        targetDebt,
    };
}
// ── Utilities ────────────────────────────────────────────────────────────────
// Show months and interest saved by adding an extra monthly payment
function calculateEarlyPayoff(debt, extraMonthlyPayment) {
    const standardPlan = calculatePayoffPlan([debt], 0, "standard", 360);
    const earlyPlan = calculatePayoffPlan([debt], extraMonthlyPayment, "early", 360);
    const monthsSaved = standardPlan.payoffMonths - earlyPlan.payoffMonths;
    const interestSaved = standardPlan.totalInterest - earlyPlan.totalInterest;
    const newPayoffDate = new Date();
    newPayoffDate.setMonth(newPayoffDate.getMonth() + earlyPlan.payoffMonths);
    return {
        standardMonths: standardPlan.payoffMonths,
        earlyMonths: earlyPlan.payoffMonths,
        monthsSaved,
        interestSaved,
        newPayoffDate,
    };
}
// Month-by-month payoff simulation used by all strategy functions
function calculatePayoffPlan(debts, monthlyExtraPayment, strategyName, maxMonths) {
    const debtsState = debts.map((d) => ({
        ...d,
        currentBalance: d.currentBalance,
    }));
    const priorityOrder = debts.map((d, idx) => ({
        debtId: d._id?.toString() || `debt-${idx}`,
        debtName: d.name,
        currentBalance: d.currentBalance,
        interestRate: d.interestRate,
        priority: idx + 1,
        recommendedPayment: d.minimumPayment,
    }));
    let totalInterest = 0;
    let month = 0;
    const monthlyBreakdown = [];
    while (month < maxMonths) {
        month++;
        const monthDate = new Date();
        monthDate.setMonth(monthDate.getMonth() + month);
        // Calculate interest for this month
        const monthInterestByDebt = debtsState.map((d) => ({
            ...d,
            monthlyInterest: (d.currentBalance * d.interestRate) / 100 / 12,
        }));
        const totalMonthlyInterest = monthInterestByDebt.reduce((sum, d) => sum + d.monthlyInterest, 0);
        // Total minimum payments
        const totalMinimumPayment = debtsState.reduce((sum, d) => sum + d.minimumPayment, 0);
        // Available for extra payments
        const availableExtra = Math.max(monthlyExtraPayment, totalMonthlyInterest * 0.1); // At least cover interest
        const monthPayments = [];
        let remainingExtra = totalMinimumPayment + availableExtra;
        // Apply payments to debts in priority order
        for (let i = 0; i < debtsState.length; i++) {
            const debt = debtsState[i];
            if (debt.currentBalance <= 0)
                continue;
            // Interest accrued this month
            const monthlyInterest = (debt.currentBalance * debt.interestRate) / 100 / 12;
            // Payment: minimum + portion of extra
            let payment = Math.min(debt.minimumPayment, remainingExtra);
            if (i === 0) {
                // Focus all surplus on the priority debt; others receive only their minimum
                payment = Math.min(debt.currentBalance + monthlyInterest, remainingExtra);
            }
            const principal = payment - monthlyInterest;
            debt.currentBalance = Math.max(0, debt.currentBalance - principal);
            remainingExtra -= payment;
            totalInterest += monthlyInterest;
            monthPayments.push({
                debtId: debt._id?.toString() || `debt-${i}`,
                debtName: debt.name,
                principalPayment: Math.max(0, principal),
                interestPayment: monthlyInterest,
                balance: Math.max(0, debt.currentBalance),
            });
        }
        // Check if all debts paid off
        if (debtsState.every((d) => d.currentBalance <= 0)) {
            break;
        }
        monthlyBreakdown.push({
            month,
            date: monthDate,
            payments: monthPayments,
            totalPayment: totalMinimumPayment + availableExtra,
            totalInterest,
            remainingDebt: debtsState.reduce((sum, d) => sum + d.currentBalance, 0),
        });
    }
    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + month);
    return {
        strategy: strategyName,
        totalDebt: debts.reduce((sum, d) => sum + d.principal, 0),
        totalInterest: Math.round(totalInterest * 100) / 100,
        payoffMonths: month,
        monthlyPayment: Math.round((debts.reduce((sum, d) => sum + d.minimumPayment, 0) +
            monthlyExtraPayment) * 100) / 100,
        payoffDate,
        priorityOrder,
        monthlyBreakdown,
    };
}
// Simulate mortgage payoff with an annual lump-sum applied each December
function calculateLumpSumPayoff(mortgage, annualLumpSum) {
    let balance = mortgage.currentBalance;
    let totalInterest = 0;
    let month = 0;
    const maxMonths = 360;
    while (balance > 0 && month < maxMonths) {
        month++;
        const monthlyInterest = (balance * mortgage.interestRate) / 100 / 12;
        const monthlyPayment = mortgage.minimumPayment;
        // Apply annual lump sum
        const lumpSumThisMonth = month % 12 === 0 ? annualLumpSum : 0;
        const totalPayment = monthlyPayment + lumpSumThisMonth;
        const principal = totalPayment - monthlyInterest;
        balance -= principal;
        totalInterest += monthlyInterest;
    }
    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + month);
    return {
        strategy: "mortgage-acceleration-lump-sum",
        totalDebt: mortgage.currentBalance,
        totalInterest: Math.round(totalInterest * 100) / 100,
        payoffMonths: month,
        monthlyPayment: mortgage.minimumPayment,
        payoffDate,
        priorityOrder: [
            {
                debtId: mortgage._id?.toString() || "mortgage",
                debtName: mortgage.name,
                currentBalance: mortgage.currentBalance,
                interestRate: mortgage.interestRate,
                priority: 1,
                recommendedPayment: mortgage.minimumPayment,
            },
        ],
        monthlyBreakdown: [],
    };
}
// Generate human-readable payoff recommendations based on debt profile and income
function getDebtRecommendations(debts, avalanchePlan, snowballPlan, userIncome = 0) {
    const recommendations = [];
    // Interest analysis
    const avgInterestRate = debts.reduce((sum, d) => sum + d.interestRate, 0) / debts.length;
    if (avgInterestRate > 10) {
        recommendations.push(`⚠️ Average interest rate is ${avgInterestRate.toFixed(1)}% - very high! Prioritize paying down high-interest debt first.`);
    }
    // High-interest credit cards
    const creditCards = debts.filter((d) => ["credit-card"].includes(d.type));
    if (creditCards.length > 0) {
        const maxCCRate = Math.max(...creditCards.map((cc) => cc.interestRate));
        if (maxCCRate > 15) {
            recommendations.push(`💳 Your credit card rate (${maxCCRate}%) is very high. Consider: (1) Balance transfer, (2) Negotiating lower rate, or (3) Paying it off ASAP with Avalanche strategy.`);
        }
    }
    // Avalanche vs Snowball savings
    const savings = avalanchePlan.totalInterest - snowballPlan.totalInterest;
    if (Math.abs(savings) > 1000) {
        if (savings > 0) {
            recommendations.push(`💰 Avalanche saves $${savings.toFixed(2)} vs Snowball! Small sacrifice of psychology for ${(savings / avalanchePlan.totalInterest * 100).toFixed(1)}% less interest.`);
        }
    }
    // Total debt to income ratio
    const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    if (userIncome > 0) {
        const debtToIncomeRatio = totalDebt / userIncome;
        if (debtToIncomeRatio > 0.36) {
            recommendations.push(`📊 Debt-to-income ratio is ${(debtToIncomeRatio * 100).toFixed(1)}% (ideal: <36%). Focus on increasing income or accelerating payoff.`);
        }
    }
    // Payoff timeline
    if (avalanchePlan.payoffMonths > 120) {
        recommendations.push(`⏰ At current pace, you'll be debt-free in ${Math.ceil(avalanchePlan.payoffMonths / 12)} years. Consider increasing monthly payments to accelerate.`);
    }
    recommendations.push(`✅ Use Avalanche strategy for maximum savings, or Hybrid (60/40) if you need psychological wins with most savings.`);
    return recommendations;
}
