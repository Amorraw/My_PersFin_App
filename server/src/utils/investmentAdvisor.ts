/**
 * Canadian Investment Advisor & Portfolio Recommendation Engine
 * Phase 3: Investment Recommendations
 * Provides goal-based asset allocation, ETF recommendations, and risk profiling
 */

import { EMERGENCY_FUND_MIN_TO_INVEST_MONTHS } from "./financeConstants";

export interface RiskProfile {
  profile: "conservative" | "moderate" | "aggressive";
  equities: number;
  fixedIncome: number;
  alternatives: number;
  cash: number;
}

export interface ETFRecommendation {
  symbol: string;
  name: string;
  allocation: number;
  fee: number; // MER (Management Expense Ratio)
  type: "equity" | "fixed-income" | "alternative" | "cash";
  description: string;
}

export interface PortfolioProjection {
  year: number;
  age: number;
  balance: number;
  contributions: number;
  investmentGains: number;
  monthlyInvestmentNeeded: number;
}

/**
 * Determine asset allocation based on risk profile
 * Canadian standard allocation models
 */
export function getRiskProfile(profile: "conservative" | "moderate" | "aggressive"): RiskProfile {
  const allocations: Record<string, RiskProfile> = {
    conservative: {
      profile: "conservative",
      equities: 30,
      fixedIncome: 60,
      alternatives: 5,
      cash: 5,
    },
    moderate: {
      profile: "moderate",
      equities: 60,
      fixedIncome: 30,
      alternatives: 7,
      cash: 3,
    },
    aggressive: {
      profile: "aggressive",
      equities: 80,
      fixedIncome: 10,
      alternatives: 7,
      cash: 3,
    },
  };

  return allocations[profile];
}

/**
 * Recommend appropriate risk profile based on time horizon
 */
export function recommendRiskProfile(
  yearsToGoal: number,
  currentAge: number,
  retirementAge: number
): "conservative" | "moderate" | "aggressive" {
  // Time horizon more than 15 years = aggressive possible
  if (yearsToGoal > 15) {
    return "aggressive";
  }
  // Time horizon 7-15 years = moderate
  if (yearsToGoal >= 7) {
    return "moderate";
  }
  // Time horizon less than 7 years = conservative
  return "conservative";
}

/**
 * Generate Canadian ETF recommendations based on allocation
 */
export function getETFRecommendations(
  allocation: RiskProfile,
  preferLowCost: boolean = true
): ETFRecommendation[] {
  const recommendations: ETFRecommendation[] = [];

  // Equity allocation (60% Canadian, 40% US/International for diversification)
  if (allocation.equities > 0) {
    recommendations.push({
      symbol: "VFV",
      name: "Vanguard U.S. Total Market Index ETF",
      allocation: allocation.equities * 0.4,
      fee: preferLowCost ? 0.08 : 0.12,
      type: "equity",
      description: "US market exposure with low fees",
    });
    recommendations.push({
      symbol: "VCN",
      name: "Vanguard Canadian Equity Index ETF",
      allocation: allocation.equities * 0.35,
      fee: preferLowCost ? 0.08 : 0.12,
      type: "equity",
      description: "Canadian market index exposure",
    });
    recommendations.push({
      symbol: "VEF",
      name: "Vanguard U.S. Total Market Index Ex-US ETF",
      allocation: allocation.equities * 0.25,
      fee: preferLowCost ? 0.12 : 0.16,
      type: "equity",
      description: "International market diversification",
    });
  }

  // Fixed Income allocation
  if (allocation.fixedIncome > 0) {
    recommendations.push({
      symbol: "VAB",
      name: "Vanguard Canadian Aggregate Bond Index ETF",
      allocation: allocation.fixedIncome * 0.7,
      fee: preferLowCost ? 0.07 : 0.11,
      type: "fixed-income",
      description: "Canadian bond index - interest rate sensitive",
    });
    recommendations.push({
      symbol: "VSB",
      name: "Vanguard Short-Term Bond Index ETF",
      allocation: allocation.fixedIncome * 0.3,
      fee: preferLowCost ? 0.07 : 0.10,
      type: "fixed-income",
      description: "Short-term bonds - lower interest rate risk",
    });
  }

  // Alternatives (REITs, commodities)
  if (allocation.alternatives > 0) {
    recommendations.push({
      symbol: "VRE",
      name: "Vanguard Canadian Real Estate Index ETF",
      allocation: allocation.alternatives * 0.6,
      fee: preferLowCost ? 0.16 : 0.22,
      type: "alternative",
      description: "Canadian real estate investment trusts",
    });
    recommendations.push({
      symbol: "XGB",
      name: "iShares Global Index ETF",
      allocation: allocation.alternatives * 0.4,
      fee: preferLowCost ? 0.18 : 0.25,
      type: "alternative",
      description: "Commodity and diversified alternative exposure",
    });
  }

  // Cash allocation (high-interest savings or money market)
  if (allocation.cash > 0) {
    recommendations.push({
      symbol: "VSP",
      name: "Vanguard Premium Savings ETF",
      allocation: allocation.cash,
      fee: 0.011,
      type: "cash",
      description: "High-interest cash equivalent - current rates ~4-5%",
    });
  }

  return recommendations;
}

/**
 * Calculate required monthly investment to reach goal
 * Using future value of annuity formula with annual returns
 */
export function calculateMonthlyInvestmentNeeded(
  currentAmount: number,
  goalAmount: number,
  yearsToGoal: number,
  annualReturnRate: number
): {
  monthlyInvestment: number;
  totalContributions: number;
  totalReturns: number;
} {
  const monthlyRate = annualReturnRate / 12;
  const monthsToGoal = yearsToGoal * 12;

  // Future value of current amount
  const fvCurrent = currentAmount * Math.pow(1 + monthlyRate, monthsToGoal);

  // Remaining goal
  const remainingGoal = Math.max(0, goalAmount - fvCurrent);

  // Monthly investment needed (future value of annuity formula)
  let monthlyPayment = 0;
  if (monthlyRate > 0) {
    monthlyPayment =
      (remainingGoal * monthlyRate) / (Math.pow(1 + monthlyRate, monthsToGoal) - 1);
  } else {
    monthlyPayment = remainingGoal / monthsToGoal;
  }

  // Calculate total contributions
  const totalContributions = monthlyPayment * monthsToGoal;

  // Calculate total returns
  const totalReturns = goalAmount - currentAmount - totalContributions;

  return {
    monthlyInvestment: Math.max(0, monthlyPayment),
    totalContributions,
    totalReturns: Math.max(0, totalReturns),
  };
}

/**
 * Project portfolio growth over time
 */
export function projectPortfolioGrowth(
  currentAmount: number,
  monthlyInvestment: number,
  annualReturnRate: number,
  yearsToProject: number,
  startingAge: number
): PortfolioProjection[] {
  const projections: PortfolioProjection[] = [];
  const monthlyRate = annualReturnRate / 12;

  let balance = currentAmount;
  let totalContributions = currentAmount;

  for (let year = 0; year <= yearsToProject; year++) {
    let yearEndBalance = balance;
    let yearContributions = 0;
    let yearGains = 0;

    // Project 12 months
    for (let month = 0; month < 12 && year < yearsToProject; month++) {
      yearContributions += monthlyInvestment;
      const gains = balance * monthlyRate;
      yearGains += gains;
      balance += monthlyInvestment + gains;
    }

    // Year 0: no monthly calculations
    if (year === 0) {
      yearContributions = 0;
      yearGains = 0;
      yearEndBalance = balance;
    }

    projections.push({
      year,
      age: startingAge + year,
      balance: Math.round(yearEndBalance * 100) / 100,
      contributions: Math.round(yearContributions * 100) / 100,
      investmentGains: Math.round(yearGains * 100) / 100,
      monthlyInvestmentNeeded: monthlyInvestment,
    });

    totalContributions += yearContributions;
  }

  return projections;
}

/**
 * Calculate success probability using Monte Carlo simulation
 * Based on historical market volatility
 */
export function calculateSuccessProbability(
  currentAmount: number,
  monthlyInvestment: number,
  goalAmount: number,
  yearsToGoal: number,
  riskProfile: "conservative" | "moderate" | "aggressive"
): number {
  // Historical volatility by profile
  const volatility: Record<string, number> = {
    conservative: 0.08, // 8% std dev
    moderate: 0.12, // 12% std dev
    aggressive: 0.16, // 16% std dev
  };

  // Expected return by profile (Canadian market assumptions)
  const expectedReturn: Record<string, number> = {
    conservative: 0.04, // 4% average
    moderate: 0.065, // 6.5% average
    aggressive: 0.08, // 8% average
  };

  const stdDev = volatility[riskProfile];
  const annualReturn = expectedReturn[riskProfile];

  // Run Monte Carlo simulation (10,000 iterations)
  let successCount = 0;
  const simulations = 10000;

  for (let i = 0; i < simulations; i++) {
    let balance = currentAmount;
    const monthlyRate = annualReturn / 12;

    for (let month = 0; month < yearsToGoal * 12; month++) {
      // Random market return (normal distribution)
      const randomReturn = monthlyRate + stdDev * Math.random();
      balance = balance * (1 + randomReturn / 12) + monthlyInvestment;
    }

    if (balance >= goalAmount) {
      successCount++;
    }
  }

  return Math.round((successCount / simulations) * 100);
}

/**
 * Assesses whether the framework's pre-investing conditions are met:
 * a minimum emergency reserve and no outstanding high-interest debt. Either
 * gap means a recommendation should shift one risk tier more conservative
 * rather than silently suggesting an aggressive allocation.
 */
export function assessInvestmentReadiness(
  emergencyFundMonths: number,
  hasHighInterestDebt: boolean
): { downgrade: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (emergencyFundMonths < EMERGENCY_FUND_MIN_TO_INVEST_MONTHS) {
    warnings.push(
      `⚠️ Your emergency fund is ${emergencyFundMonths.toFixed(1)} months of expenses — below the recommended ${EMERGENCY_FUND_MIN_TO_INVEST_MONTHS} months before taking on investment risk. This recommendation has been shifted to a more conservative allocation.`
    );
  }

  if (hasHighInterestDebt) {
    warnings.push(
      `⚠️ You have high-interest debt outstanding. Paying that down typically beats a diversified portfolio's expected return, so this recommendation has been shifted to a more conservative allocation until it's cleared.`
    );
  }

  return { downgrade: warnings.length > 0, warnings };
}

function downgradeRiskProfile(
  profile: "conservative" | "moderate" | "aggressive"
): "conservative" | "moderate" | "aggressive" {
  if (profile === "aggressive") return "moderate";
  return "conservative";
}

/**
 * Generate comprehensive investment recommendations
 */
export function generateInvestmentRecommendation(
  currentNetWorth: number,
  goalAmount: number,
  goalYear: number,
  currentAge: number,
  retirementAge: number,
  emergencyFundMonths?: number,
  hasHighInterestDebt?: boolean
): {
  riskProfile: "conservative" | "moderate" | "aggressive";
  allocation: RiskProfile;
  etfs: ETFRecommendation[];
  monthlyInvestment: number;
  successProbability: number;
  projections: PortfolioProjection[];
  recommendations: string[];
} {
  const currentYear = new Date().getFullYear();
  const yearsToGoal = goalYear - currentYear;
  const yearsToRetirement = retirementAge - currentAge;

  // Recommend risk profile
  let riskProfile = recommendRiskProfile(yearsToGoal, currentAge, retirementAge);

  // Downgrade if the framework's pre-investing conditions aren't met
  let readinessWarnings: string[] = [];
  if (emergencyFundMonths !== undefined && hasHighInterestDebt !== undefined) {
    const readiness = assessInvestmentReadiness(emergencyFundMonths, hasHighInterestDebt);
    if (readiness.downgrade) riskProfile = downgradeRiskProfile(riskProfile);
    readinessWarnings = readiness.warnings;
  }

  // Get asset allocation
  const allocation = getRiskProfile(riskProfile);

  // Get ETF recommendations
  const etfs = getETFRecommendations(allocation);

  // Calculate monthly investment needed (assume 6.5% returns for calculation)
  const avgReturn = riskProfile === "conservative" ? 0.04 : riskProfile === "moderate" ? 0.065 : 0.08;
  const investmentCalc = calculateMonthlyInvestmentNeeded(
    currentNetWorth,
    goalAmount,
    yearsToGoal,
    avgReturn
  );

  // Project growth
  const projections = projectPortfolioGrowth(
    currentNetWorth,
    investmentCalc.monthlyInvestment,
    avgReturn,
    yearsToGoal,
    currentAge
  );

  // Calculate success probability
  const successProbability = calculateSuccessProbability(
    currentNetWorth,
    investmentCalc.monthlyInvestment,
    goalAmount,
    yearsToGoal,
    riskProfile
  );

  // Generate recommendations
  const recommendations: string[] = [...readinessWarnings];

  if (successProbability < 50) {
    recommendations.push(
      `⚠️ Current plan has only ${successProbability}% success probability. Consider: (1) increasing monthly contributions, (2) extending timeline, or (3) reassessing goal amount.`
    );
  } else if (successProbability >= 75) {
    recommendations.push(`✅ Strong plan with ${successProbability}% success probability!`);
  }

  if (riskProfile === "aggressive" && yearsToGoal < 5) {
    recommendations.push(
      `📊 Consider gradually shifting to a more conservative allocation as you approach your goal (${goalYear}).`
    );
  }

  recommendations.push(`💡 Average Canadian ETF MER is 0.20%. These recommendations use 0.08-0.16%.`);
  
  recommendations.push(
    `📈 Rebalance portfolio annually to maintain target allocation and stay discipline during market volatility.`
  );

  recommendations.push(
    `🏦 Consider maxing out TFSA ($7,000/year) before RRSP for tax-free growth on investments.`
  );

  return {
    riskProfile,
    allocation,
    etfs,
    monthlyInvestment: investmentCalc.monthlyInvestment,
    successProbability,
    projections,
    recommendations,
  };
}
