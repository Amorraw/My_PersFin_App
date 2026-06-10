"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVINCE_NAMES = exports.TFSA_ANNUAL_LIMITS = exports.TAX_LIMITS = void 0;
exports.calculateRRSPRoom = calculateRRSPRoom;
exports.calculateTFSALifetimeRoomSchedule = calculateTFSALifetimeRoomSchedule;
exports.calculateTFSARoom = calculateTFSARoom;
exports.calculateTFSARoomFromBirthYear = calculateTFSARoomFromBirthYear;
exports.identifyTaxLossHarvestingOpportunities = identifyTaxLossHarvestingOpportunities;
exports.calculateRRSPTaxSavings = calculateRRSPTaxSavings;
exports.getMarginalTaxRateDetailed = getMarginalTaxRateDetailed;
exports.getMarginalTaxRate = getMarginalTaxRate;
exports.calculateCapitalGainsTax = calculateCapitalGainsTax;
exports.optimizeDividendAccounts = optimizeDividendAccounts;
exports.recommendSpousalRRSP = recommendSpousalRRSP;
exports.calculateOptimalWithdrawalSequence = calculateOptimalWithdrawalSequence;
// 2024 Canadian tax limits
exports.TAX_LIMITS = {
    RRSP_ANNUAL_MAX: 31560,
    RRSP_PERCENTAGE: 0.18, // 18% of prior year income
    TFSA_ANNUAL_LIMIT: 7000,
    // June 2024 budget: 50% inclusion on first $250K of annual gains, 2/3 above that
    CAPITAL_GAINS_INCLUSION_RATE_LOW: 0.5,
    CAPITAL_GAINS_INCLUSION_RATE_HIGH: 2 / 3,
    CAPITAL_GAINS_ANNUAL_THRESHOLD: 250000,
    DIVIDEND_TAX_CREDIT: 0.38, // Approximate for Canadian dividends
};
// ── RRSP ─────────────────────────────────────────────────────────────────────
// Calculate remaining RRSP room: 18% of prior income + unused room − contributions
function calculateRRSPRoom(priorYearIncome, currentYearContributions, lifetimeUnusedRoom) {
    const annualRoom = Math.min(priorYearIncome * exports.TAX_LIMITS.RRSP_PERCENTAGE, exports.TAX_LIMITS.RRSP_ANNUAL_MAX);
    const totalAvailableRoom = lifetimeUnusedRoom + annualRoom;
    const remainingRoom = Math.max(0, totalAvailableRoom - currentYearContributions);
    return remainingRoom;
}
// Official CRA TFSA annual dollar limits by year
exports.TFSA_ANNUAL_LIMITS = {
    2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000,
    2013: 5500, 2014: 5500,
    2015: 10000, // one-time increase
    2016: 5500, 2017: 5500, 2018: 5500,
    2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
    2023: 6500,
    2024: 7000, 2025: 7000, 2026: 7000, // 2025/2026 confirmed/projected
};
// ── TFSA ─────────────────────────────────────────────────────────────────────
// Build year-by-year TFSA room schedule from birth year to asOfYear
function calculateTFSALifetimeRoomSchedule(birthYear, asOfYear = new Date().getFullYear()) {
    const schedule = [];
    let cumulative = 0;
    const firstEligibleYear = Math.max(2009, birthYear + 18);
    for (let year = 2009; year <= Math.min(asOfYear, 2026); year++) {
        const limit = exports.TFSA_ANNUAL_LIMITS[year] ?? 7000;
        const eligible = year >= firstEligibleYear;
        if (eligible)
            cumulative += limit;
        schedule.push({ year, annualLimit: limit, cumulativeRoom: cumulative, eligible });
    }
    return schedule;
}
// Quick TFSA room check given pre-computed lifetime room and current-year activity
function calculateTFSARoom(lifetimeUnusedRoom, currentYearContributions, currentYearWithdrawals = 0) {
    const totalAvailableRoom = lifetimeUnusedRoom + currentYearWithdrawals;
    return Math.max(0, totalAvailableRoom - currentYearContributions);
}
// Full TFSA room calculation including over-contribution penalty from birth year
function calculateTFSARoomFromBirthYear(birthYear, totalContributionsEver, totalWithdrawalsPriorYears = 0, asOfYear = new Date().getFullYear()) {
    const schedule = calculateTFSALifetimeRoomSchedule(birthYear, asOfYear);
    const lifetimeRoom = schedule[schedule.length - 1]?.cumulativeRoom ?? 0;
    // Withdrawals made in prior years re-add to room
    const adjustedRoom = lifetimeRoom + totalWithdrawalsPriorYears;
    const remainingRoom = adjustedRoom - totalContributionsEver;
    const overContribution = Math.max(0, -remainingRoom);
    const monthlyPenalty = overContribution * 0.01; // 1% per month
    return {
        lifetimeRoom,
        remainingRoom: Math.max(0, remainingRoom),
        overContribution,
        monthlyPenalty,
        schedule,
    };
}
// ── Investments & Capital Gains ──────────────────────────────────────────────
// Return non-registered holdings with unrealized losses > $50 eligible for harvesting
function identifyTaxLossHarvestingOpportunities(investments, accountType) {
    if (accountType !== "non-registered") {
        return []; // Only applicable to non-registered accounts
    }
    return investments.filter((inv) => inv.unrealizedGain < -50 && !inv.soldDate // Loss > $50
    );
}
// Compute tax refund now and projected tax cost at withdrawal
function calculateRRSPTaxSavings(contributionAmount, marginalTaxRate, futureWithdrawalTaxRate = marginalTaxRate) {
    const taxSavings = contributionAmount * (marginalTaxRate / 100);
    const netContribution = contributionAmount - taxSavings;
    const futureWithdrawalTax = contributionAmount * (futureWithdrawalTaxRate / 100);
    return {
        contribution: contributionAmount,
        marginalTaxRate,
        taxSavings,
        netContribution,
        futureWithdrawalTax,
    };
}
// ── Marginal Tax Rates ───────────────────────────────────────────────────────
// 2024 federal tax brackets (indexed annually)
const FEDERAL_BRACKETS_2024 = [
    { limit: 55867, rate: 15 },
    { limit: 111733, rate: 20.5 },
    { limit: 173205, rate: 26 },
    { limit: 246752, rate: 29 },
    { limit: Infinity, rate: 33 },
];
// 2024 provincial/territorial tax brackets for all 13 jurisdictions
const PROVINCIAL_BRACKETS_2024 = {
    AB: [
        { limit: 148269, rate: 10 },
        { limit: 177922, rate: 12 },
        { limit: 237230, rate: 13 },
        { limit: 355845, rate: 14 },
        { limit: Infinity, rate: 15 },
    ],
    BC: [
        { limit: 45654, rate: 5.06 },
        { limit: 91310, rate: 7.70 },
        { limit: 104835, rate: 10.50 },
        { limit: 127299, rate: 12.29 },
        { limit: 172602, rate: 14.29 },
        { limit: 240716, rate: 16.80 },
        { limit: Infinity, rate: 20.50 },
    ],
    MB: [
        { limit: 36842, rate: 10.8 },
        { limit: 79625, rate: 12.75 },
        { limit: Infinity, rate: 17.4 },
    ],
    NB: [
        { limit: 47715, rate: 9.40 },
        { limit: 95431, rate: 14.82 },
        { limit: 176756, rate: 16.52 },
        { limit: Infinity, rate: 19.50 },
    ],
    NL: [
        { limit: 43198, rate: 8.7 },
        { limit: 86395, rate: 14.5 },
        { limit: 154244, rate: 15.8 },
        { limit: 215943, rate: 17.8 },
        { limit: 275870, rate: 19.8 },
        { limit: 551739, rate: 20.8 },
        { limit: Infinity, rate: 21.3 },
    ],
    NS: [
        { limit: 29590, rate: 8.79 },
        { limit: 59180, rate: 14.95 },
        { limit: 93000, rate: 16.67 },
        { limit: 150000, rate: 17.50 },
        { limit: Infinity, rate: 21.00 },
    ],
    NT: [
        { limit: 50597, rate: 5.9 },
        { limit: 101198, rate: 8.6 },
        { limit: 164525, rate: 12.2 },
        { limit: Infinity, rate: 14.05 },
    ],
    NU: [
        { limit: 53268, rate: 4 },
        { limit: 106537, rate: 7 },
        { limit: 173205, rate: 9 },
        { limit: Infinity, rate: 11.5 },
    ],
    ON: [
        { limit: 51446, rate: 5.05 },
        { limit: 102894, rate: 9.15 },
        { limit: 150000, rate: 11.16 },
        { limit: 220000, rate: 12.16 },
        { limit: Infinity, rate: 13.16 },
    ],
    PE: [
        { limit: 32656, rate: 9.65 },
        { limit: 64313, rate: 13.63 },
        { limit: 105000, rate: 16.65 },
        { limit: 140000, rate: 18.00 },
        { limit: Infinity, rate: 18.75 },
    ],
    QC: [
        { limit: 51780, rate: 14 },
        { limit: 103545, rate: 19 },
        { limit: 126000, rate: 24 },
        { limit: Infinity, rate: 25.75 },
    ],
    SK: [
        { limit: 49720, rate: 10.5 },
        { limit: 142058, rate: 12.5 },
        { limit: Infinity, rate: 14.5 },
    ],
    YT: [
        { limit: 55867, rate: 6.4 },
        { limit: 111733, rate: 9.0 },
        { limit: 154906, rate: 10.9 },
        { limit: 500000, rate: 12.8 },
        { limit: Infinity, rate: 15.0 },
    ],
};
exports.PROVINCE_NAMES = {
    AB: "Alberta",
    BC: "British Columbia",
    MB: "Manitoba",
    NB: "New Brunswick",
    NL: "Newfoundland and Labrador",
    NS: "Nova Scotia",
    NT: "Northwest Territories",
    NU: "Nunavut",
    ON: "Ontario",
    PE: "Prince Edward Island",
    QC: "Quebec",
    SK: "Saskatchewan",
    YT: "Yukon",
};
// Look up federal and provincial bracket rates for income and province
function getMarginalTaxRateDetailed(income, province = "ON") {
    const prov = province.toUpperCase();
    const fedBracket = FEDERAL_BRACKETS_2024.find((b) => income <= b.limit) ?? FEDERAL_BRACKETS_2024[FEDERAL_BRACKETS_2024.length - 1];
    const provBrackets = PROVINCIAL_BRACKETS_2024[prov] ?? PROVINCIAL_BRACKETS_2024["ON"];
    const provBracket = provBrackets.find((b) => income <= b.limit) ?? provBrackets[provBrackets.length - 1];
    return {
        income,
        province: prov,
        provinceName: exports.PROVINCE_NAMES[prov] ?? prov,
        federalRate: fedBracket.rate,
        provincialRate: provBracket.rate,
        combinedRate: fedBracket.rate + provBracket.rate,
        federalBracket: fedBracket.limit === Infinity
            ? `Over $${(246752).toLocaleString()}`
            : `Up to $${fedBracket.limit.toLocaleString()}`,
        provincialBracket: provBracket.limit === Infinity
            ? "Top bracket"
            : `Up to $${provBracket.limit.toLocaleString()}`,
    };
}
// Return combined federal + provincial marginal rate as a single percentage
function getMarginalTaxRate(income, province = "ON") {
    return getMarginalTaxRateDetailed(income, province).combinedRate;
}
// Split gain across low/high inclusion buckets accounting for prior gains this year
function calculateCapitalGainsTax(unrealizedGain, marginalTaxRate, priorGainsThisYear = 0) {
    const threshold = exports.TAX_LIMITS.CAPITAL_GAINS_ANNUAL_THRESHOLD;
    const lowRate = exports.TAX_LIMITS.CAPITAL_GAINS_INCLUSION_RATE_LOW;
    const highRate = exports.TAX_LIMITS.CAPITAL_GAINS_INCLUSION_RATE_HIGH;
    // How much room is left in the low-rate bucket?
    const roomAtLowRate = Math.max(0, threshold - priorGainsThisYear);
    const lowRatePortion = Math.min(unrealizedGain, roomAtLowRate);
    const highRatePortion = Math.max(0, unrealizedGain - lowRatePortion);
    const taxableGain = lowRatePortion * lowRate + highRatePortion * highRate;
    const taxOwed = taxableGain * (marginalTaxRate / 100);
    const effectiveInclusionRate = unrealizedGain > 0 ? taxableGain / unrealizedGain : lowRate;
    const breakdown = highRatePortion > 0
        ? `$${lowRatePortion.toFixed(0)} at 50% inclusion + $${highRatePortion.toFixed(0)} at 66.7% inclusion (above $250K annual threshold)`
        : `$${lowRatePortion.toFixed(0)} at 50% inclusion (below $250K annual threshold)`;
    return {
        unrealizedGain,
        priorGainsThisYear,
        lowRatePortion,
        highRatePortion,
        taxableGain,
        effectiveInclusionRate,
        taxOwed,
        breakdown,
    };
}
// Return pre-built tax-efficiency guidance for TFSA, RRSP, or non-registered accounts
function optimizeDividendAccounts(taxAccountType) {
    const scenarios = {
        tfsa: {
            accountType: "TFSA",
            suitability: "Excellent for any investments",
            taxEfficiency: 100,
            recommendation: "Hold highest-growth investments here. All gains and dividends are tax-free.",
        },
        rrsp: {
            accountType: "RRSP",
            suitability: "Good for bonds and GICs",
            taxEfficiency: 90,
            recommendation: "Best for interest-bearing investments. Dividends don't benefit from dividend tax credit.",
        },
        "non-registered": {
            accountType: "Non-Registered",
            suitability: "Best for dividend stocks",
            taxEfficiency: 75,
            recommendation: "Hold Canadian dividend stocks here. Dividend tax credit saves 30-40% vs interest income.",
        },
    };
    return scenarios[taxAccountType] || scenarios["non-registered"];
}
// Size spousal RRSP contribution to close the income gap and quantify tax savings
function recommendSpousalRRSP(highEarnerIncome, lowEarnerIncome, highEarnerMarginalRate, lowEarnerMarginalRate) {
    const incomeGap = highEarnerIncome - lowEarnerIncome;
    const recommendedContribution = Math.min(incomeGap * 0.25, // Contribute 25% of gap
    (highEarnerIncome * 0.18));
    const taxSavings = recommendedContribution * (highEarnerMarginalRate / 100);
    return {
        highEarnerIncome,
        lowEarnerIncome,
        recommendedSpousalContribution: recommendedContribution,
        taxSavingsHighEarner: taxSavings,
        futureIncomeSplitting: `When retired, spouse withdraws from spousal RRSP at potentially lower rate (${lowEarnerMarginalRate}%), ` +
            `saving ${(recommendedContribution * (highEarnerMarginalRate - lowEarnerMarginalRate)) / 100} in taxes`,
    };
}
// Draw from each account in the lowest-to-highest tax cost order
function calculateOptimalWithdrawalSequence(neededAmount, nonRegisteredBalance, tfsaBalance, rrspBalance, marginalTaxRate) {
    let remaining = neededAmount;
    const withdrawalOrder = [];
    let estimatedTax = 0;
    // 1. Withdraw from non-registered first (only capital gains taxed)
    if (remaining > 0 && nonRegisteredBalance > 0) {
        const nonRegAmount = Math.min(remaining, nonRegisteredBalance);
        withdrawalOrder.push(`Non-Registered: $${nonRegAmount.toFixed(2)} (minimal tax)`);
        remaining -= nonRegAmount;
    }
    // 2. Withdraw from TFSA (no tax)
    if (remaining > 0 && tfsaBalance > 0) {
        const tfsaAmount = Math.min(remaining, tfsaBalance);
        withdrawalOrder.push(`TFSA: $${tfsaAmount.toFixed(2)} (no tax)`);
        remaining -= tfsaAmount;
    }
    // 3. Withdraw from RRSP (fully taxed)
    if (remaining > 0 && rrspBalance > 0) {
        const rrspAmount = Math.min(remaining, rrspBalance);
        estimatedTax = rrspAmount * (marginalTaxRate / 100);
        withdrawalOrder.push(`RRSP: $${rrspAmount.toFixed(2)} (estimated tax: $${estimatedTax.toFixed(2)})`);
        remaining -= rrspAmount;
    }
    return {
        amount: neededAmount,
        withdrawalOrder,
        reasoning: "Withdraw from non-registered first (lowest tax), then TFSA (no tax), then RRSP (fully taxed)",
        estimatedTax,
    };
}
