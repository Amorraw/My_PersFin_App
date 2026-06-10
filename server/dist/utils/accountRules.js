"use strict";
// Canadian registered account rules: contribution limits, withholding rates, CPP/OAS, and capital gains
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCOUNT_TYPE_FEATURES = exports.MARGINAL_TAX_RATES_2024 = exports.CAPITAL_GAINS_INCLUSION = exports.OAS_RATES_2024 = exports.CPP_RATES_2024 = exports.LIF_MAXIMUM_WITHDRAWAL_PERCENTAGES = exports.RRIF_MINIMUM_WITHDRAWAL_PERCENTAGES = exports.WITHHOLDING_TAX_RATES = exports.CONTRIBUTION_LIMITS_2024 = void 0;
exports.calculateRRSPContributionRoom = calculateRRSPContributionRoom;
exports.calculateTFSAContributionRoom = calculateTFSAContributionRoom;
exports.calculateCESG = calculateCESG;
exports.calculateRRIFMinimumWithdrawal = calculateRRIFMinimumWithdrawal;
exports.calculateCPPBenefit = calculateCPPBenefit;
exports.calculateOASWithGIS = calculateOASWithGIS;
exports.calculateACB = calculateACB;
exports.calculateCapitalGain = calculateCapitalGain;
exports.getAccountTypeDescription = getAccountTypeDescription;
exports.CONTRIBUTION_LIMITS_2024 = {
    RRSP: {
        annualLimit: 31560,
        contributionPercentage: 0.18, // 18% of previous year income
        maxIncome: 175245,
        description: "Registered Retirement Savings Plan"
    },
    FHSA: {
        annualLimit: 8000,
        lifetimeLimit: 40000,
        description: "First Home Savings Account"
    },
    TFSA: {
        annualLimit: 7000,
        cumulativeLimit: 95000, // As of 2024
        description: "Tax-Free Savings Account"
    },
    RESP: {
        annualLimit: 50000, // Per beneficiary
        lifetimeLimit: 50000,
        cesgMatch: 0.2, // 20% grant up to $500/year
        cesgMaxAnnual: 500,
        cesgLifetimeMax: 7200,
        description: "Registered Education Savings Plan"
    }
};
exports.WITHHOLDING_TAX_RATES = {
    RRSP_WITHDRAWAL: {
        under5000: 0.1, // 10%
        between5000_15000: 0.2, // 20%
        over15000: 0.3 // 30%
    },
    RRIF: {
        under5000: 0.1,
        between5000_15000: 0.2,
        over15000: 0.3
    },
    FHSA_WITHDRAWAL: 0 // No withholding for first-time home buyer withdrawals
};
exports.RRIF_MINIMUM_WITHDRAWAL_PERCENTAGES = {
    55: 0.0274,
    56: 0.0285,
    57: 0.0297,
    58: 0.0310,
    59: 0.0324,
    60: 0.0339,
    61: 0.0355,
    62: 0.0372,
    63: 0.0390,
    64: 0.0410,
    65: 0.0427,
    66: 0.0446,
    67: 0.0468,
    68: 0.0491,
    69: 0.0516,
    70: 0.0540,
    71: 0.0567,
    72: 0.0595,
    73: 0.0625,
    74: 0.0658,
    75: 0.0693,
    76: 0.0731,
    77: 0.0771,
    78: 0.0815,
    79: 0.0862,
    80: 0.0913,
    81: 0.0968,
    82: 0.1027,
    83: 0.1091,
    84: 0.1159,
    85: 0.1232,
    86: 0.1310,
    87: 0.1393,
    88: 0.1481,
    89: 0.1575,
    90: 0.1675,
    91: 0.1780,
    92: 0.1890,
    93: 0.2005,
    94: 0.2125
};
exports.LIF_MAXIMUM_WITHDRAWAL_PERCENTAGES = {
    BC: { age55: 0.05, agePercentages: {} },
    AB: { age55: 0.05, agePercentages: {} },
    ON: { age55: 0.05, agePercentages: {} },
    QC: { age55: 0.10, agePercentages: {} }
};
exports.CPP_RATES_2024 = {
    employee: 0.0595, // 5.95% employee contribution
    employer: 0.0595, // 5.95% employer contribution
    maxInsurable: 68500, // Maximum insurable earnings
    basicExemption: 3500,
    maxMonthly: 1408.33 // Approximate 2024 max CPP at age 65
};
exports.OAS_RATES_2024 = {
    baseMonthly: 691.83,
    gisBasic: 1000.87,
    incomeThreshold: 81255, // Clawback begins
    clawbackRate: 0.15, // 15% over threshold
    description: "Old Age Security"
};
// June 2024 budget: tiered inclusion rates
exports.CAPITAL_GAINS_INCLUSION = {
    LOW_RATE: 0.5, // 50% on first $250K of annual gains
    HIGH_RATE: 2 / 3, // 66.67% on gains above $250K per year
    ANNUAL_THRESHOLD: 250000,
    capitalGainsTax: function (gain, marginalTaxRate, priorGainsThisYear = 0) {
        const roomAtLowRate = Math.max(0, this.ANNUAL_THRESHOLD - priorGainsThisYear);
        const lowPortion = Math.min(gain, roomAtLowRate);
        const highPortion = Math.max(0, gain - lowPortion);
        return (lowPortion * this.LOW_RATE + highPortion * this.HIGH_RATE) * marginalTaxRate;
    }
};
exports.MARGINAL_TAX_RATES_2024 = {
    BC: {
        15: 0.1506,
        20: 0.2047,
        26.79: 0.2614,
        29: 0.2900,
        32.79: 0.3279,
        35.29: 0.3529,
        37.29: 0.3729,
        43.7: 0.437,
        48.29: 0.4829,
        53.5: 0.535
    },
    ON: {
        5.05: 0.0505,
        9.15: 0.0915,
        11.16: 0.1116,
        12.16: 0.1216,
        13.16: 0.1316,
        14.16: 0.1416,
        15.16: 0.1516,
        19.16: 0.1916,
        24.15: 0.2415,
        28.15: 0.2815,
        29.65: 0.2965,
        33.66: 0.3366,
        37.41: 0.3741,
        43.41: 0.4341,
        45.41: 0.4541,
        53.53: 0.5353
    },
    AB: {
        10: 0.10,
        12: 0.12,
        13: 0.13,
        14: 0.14,
        15: 0.15,
        20: 0.20,
        24: 0.24,
        27: 0.27,
        29: 0.29,
        35: 0.35,
        39: 0.39,
        48: 0.48,
        53: 0.53
    },
    QC: {
        15: 0.1500,
        20: 0.2000,
        24: 0.2400,
        26: 0.2600,
        29.575: 0.29575,
        31.575: 0.31575,
        33.575: 0.33575,
        37.575: 0.37575,
        42.575: 0.42575,
        48.625: 0.48625,
        53.5: 0.535,
        57.625: 0.57625,
        60.575: 0.60575
    }
};
// ── Contribution Room Calculators ────────────────────────────────────────────
// Compute new RRSP room earned this year minus contributions already made
function calculateRRSPContributionRoom(previousYearIncome, previousYearContribution, provinceOfResidence) {
    const maxContribution = Math.min(previousYearIncome * 0.18, exports.CONTRIBUTION_LIMITS_2024.RRSP.annualLimit);
    return Math.max(0, maxContribution - previousYearContribution);
}
// Delegate to taxPlanner's authoritative annual-limits table for TFSA room
function calculateTFSAContributionRoom(yearOfBirth, totalContributionsEver, totalWithdrawalsPriorYears = 0) {
    // Delegate to taxPlanner which has the authoritative annual limits table
    const { remainingRoom } = require("./taxPlanner").calculateTFSARoomFromBirthYear(yearOfBirth, totalContributionsEver, totalWithdrawalsPriorYears);
    return remainingRoom;
}
// Compute CESG grant (20% of contribution) capped by annual and lifetime maximums
function calculateCESG(contribution, previousGrantAmount = 0, cumulativeGrants = 0) {
    const annualMax = exports.CONTRIBUTION_LIMITS_2024.RESP.cesgMaxAnnual;
    const lifetimeMax = exports.CONTRIBUTION_LIMITS_2024.RESP.cesgLifetimeMax;
    const matchRate = exports.CONTRIBUTION_LIMITS_2024.RESP.cesgMatch;
    const currentGrant = contribution * matchRate;
    const annualGrant = Math.min(currentGrant, annualMax);
    const limitedByLifetime = Math.min(annualGrant, lifetimeMax - cumulativeGrants);
    return Math.max(0, limitedByLifetime);
}
// ── Government Benefit Calculators ───────────────────────────────────────────
// Look up CRA's age-based RRIF percentage and apply it to the current balance
function calculateRRIFMinimumWithdrawal(age, balance) {
    const percentage = exports.RRIF_MINIMUM_WITHDRAWAL_PERCENTAGES[age] || 0;
    return balance * percentage;
}
// Estimate monthly CPP adjusted for early (−0.36%/mo) or deferred (+0.42%/mo) claiming age
function calculateCPPBenefit(yearsOfContribution, averageInsurableEarnings, claimAge) {
    // Simplified CPP calculation
    const baseAge = 65;
    let percentage = 1.0;
    if (claimAge < baseAge) {
        percentage = 1.0 - (baseAge - claimAge) * 0.0036; // 0.36% per month before 65
    }
    else if (claimAge > baseAge) {
        percentage = 1.0 + (claimAge - baseAge) * 0.0042; // 0.42% per month after 65
    }
    // Deferral gain is capped at age 70 (42% above the age-65 amount)
    percentage = Math.min(percentage, 1.42);
    const monthlyBenefit = (averageInsurableEarnings * exports.CPP_RATES_2024.maxMonthly) / 68500;
    return monthlyBenefit * percentage;
}
// Calculate OAS with 15% clawback above income threshold, plus GIS for low-income seniors
function calculateOASWithGIS(income, age, maritalStatus = "single") {
    let oasMonthly = exports.OAS_RATES_2024.baseMonthly;
    // Apply clawback if income exceeds threshold
    const clawback = Math.max(0, (income - exports.OAS_RATES_2024.incomeThreshold) * exports.OAS_RATES_2024.clawbackRate);
    oasMonthly = Math.max(0, oasMonthly - clawback / 12);
    let gisMonthly = 0;
    if (income <= 20000) {
        gisMonthly = exports.OAS_RATES_2024.gisBasic;
    }
    else if (income <= 25921) {
        gisMonthly = exports.OAS_RATES_2024.gisBasic * (1 - (income - 20000) / 30000);
    }
    return {
        oasMonthly,
        gisMonthly,
        totalMonthly: oasMonthly + gisMonthly,
        clawback
    };
}
// ── Investment Calculations ──────────────────────────────────────────────────
// Compute average adjusted cost base across all purchase lots
function calculateACB(holdings) {
    const totalCost = holdings.reduce((sum, h) => sum + h.quantity * h.price, 0);
    const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0);
    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
}
// Apply tiered inclusion rates to a sale, respecting prior realised gains this year
function calculateCapitalGain(purchasePrice, sellingPrice, quantity, priorGainsThisYear = 0) {
    const capitalGain = (sellingPrice - purchasePrice) * quantity;
    const roomAtLowRate = Math.max(0, exports.CAPITAL_GAINS_INCLUSION.ANNUAL_THRESHOLD - priorGainsThisYear);
    const lowPortion = Math.min(capitalGain, roomAtLowRate);
    const highPortion = Math.max(0, capitalGain - lowPortion);
    const taxableGain = lowPortion * exports.CAPITAL_GAINS_INCLUSION.LOW_RATE +
        highPortion * exports.CAPITAL_GAINS_INCLUSION.HIGH_RATE;
    const inclusionRate = capitalGain > 0 ? taxableGain / capitalGain : exports.CAPITAL_GAINS_INCLUSION.LOW_RATE;
    return { capitalGain, taxableGain, inclusionRate };
}
// ── Account Metadata ─────────────────────────────────────────────────────────
// Return a plain-English description for a given registered account type code
function getAccountTypeDescription(accountType) {
    const descriptions = {
        RRSP: "Registered Retirement Savings Plan - Tax-deferred savings, contributions are tax-deductible",
        SPOUSAL_RRSP: "Spousal RRSP - Tax-deferred savings for spouse, provides income splitting in retirement",
        TFSA: "Tax-Free Savings Account - Tax-free growth and withdrawals, no deduction for contributions",
        FHSA: "First Home Savings Account - Tax-deferred savings for first-time home buyers",
        RESP: "Registered Education Savings Plan - Tax-deferred savings for education, eligible for government grants (CESG)",
        RRIF: "Registered Retirement Income Fund - Income stream from RRSP conversion, mandatory minimums at 65+",
        LIF: "Life Income Fund - Income stream from locked-in pensions, maximum withdrawal limits apply",
        LIRA: "Locked-in Retirement Account - Locked-in pension funds, limited withdrawals",
        RDSP: "Registered Disability Savings Plan - Tax-sheltered savings for disabled persons, eligible for CCESG grants and CDBS bonds",
        NON_REGISTERED: "Non-Registered Account - Investment account without tax sheltering, subject to capital gains tax",
        CRYPTO: "Cryptocurrency Account - Digital assets subject to capital gains tax on disposal",
        CORPORATE: "Corporate/Business Account - Business account for self-employed and incorporated businesses"
    };
    return descriptions[accountType] || "Account";
}
exports.ACCOUNT_TYPE_FEATURES = {
    RRSP: {
        taxDeferred: true,
        taxDeductible: true,
        withdrawalRestrictions: true,
        minimumWithdrawal: false,
        ageRestriction: false,
        rmdAge: 71
    },
    TFSA: {
        taxDeferred: true,
        taxDeductible: false,
        withdrawalRestrictions: false,
        minimumWithdrawal: false,
        ageRestriction: true,
        minAge: 18
    },
    RESP: {
        taxDeferred: true,
        taxDeductible: false,
        withdrawalRestrictions: true,
        minimumWithdrawal: false,
        govtGrants: true,
        maxAge: 36
    },
    FHSA: {
        taxDeferred: true,
        taxDeductible: true,
        withdrawalRestrictions: true,
        minimumWithdrawal: false,
        firstTimeOnly: true
    },
    RRIF: {
        taxDeferred: false,
        taxDeductible: false,
        withdrawalRestrictions: false,
        minimumWithdrawal: true,
        ageRestriction: true,
        minAge: 55
    },
    LIF: {
        taxDeferred: false,
        taxDeductible: false,
        withdrawalRestrictions: true,
        maximumWithdrawal: true,
        minimumWithdrawal: true,
        locked: true
    },
    LIRA: {
        taxDeferred: true,
        taxDeductible: false,
        withdrawalRestrictions: true,
        locked: true
    }
};
