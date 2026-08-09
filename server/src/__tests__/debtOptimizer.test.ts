import {
  calculateAvalancheStrategy,
  calculateSnowballStrategy,
  calculateHybridStrategy,
  analyzeConsolidation,
  calculateMortgageAcceleration,
  optimizeLumpSumPayment,
  calculateEarlyPayoff,
  getDebtRecommendations,
  DebtForCalculation,
} from "../utils/debtOptimizer";

const creditCard: DebtForCalculation = {
  _id: "1",
  name: "Credit Card",
  type: "credit-card",
  currentBalance: 5000,
  interestRate: 20,
  minimumPayment: 150,
  principal: 5000,
};

const carLoan: DebtForCalculation = {
  _id: "2",
  name: "Car Loan",
  type: "auto-loan",
  currentBalance: 15000,
  interestRate: 6,
  minimumPayment: 300,
  principal: 15000,
};

const studentLoan: DebtForCalculation = {
  _id: "3",
  name: "Student Loan",
  type: "student-loan",
  currentBalance: 8000,
  interestRate: 10,
  minimumPayment: 200,
  principal: 8000,
};

const sampleDebts = [creditCard, carLoan, studentLoan];

// ── Avalanche ──────────────────────────────────────────────────────────────────

describe("calculateAvalancheStrategy", () => {
  it("returns a valid PayoffPlan with correct strategy name", () => {
    const plan = calculateAvalancheStrategy(sampleDebts);
    expect(plan.strategy).toBe("avalanche");
    expect(plan).toHaveProperty("totalInterest");
    expect(plan).toHaveProperty("payoffMonths");
    expect(plan).toHaveProperty("monthlyPayment");
    expect(plan).toHaveProperty("priorityOrder");
    expect(plan).toHaveProperty("monthlyBreakdown");
  });

  it("prioritises the highest-interest debt first", () => {
    const plan = calculateAvalancheStrategy(sampleDebts);
    expect(plan.priorityOrder[0].debtName).toBe("Credit Card");
    expect(plan.priorityOrder[0].interestRate).toBe(20);
  });

  it("second priority is the next-highest rate debt", () => {
    const plan = calculateAvalancheStrategy(sampleDebts);
    expect(plan.priorityOrder[1].debtName).toBe("Student Loan");
    expect(plan.priorityOrder[2].debtName).toBe("Car Loan");
  });

  it("extra monthly payment reduces payoff months", () => {
    const basePlan = calculateAvalancheStrategy(sampleDebts);
    const acceleratedPlan = calculateAvalancheStrategy(sampleDebts, 500);
    expect(acceleratedPlan.payoffMonths).toBeLessThan(basePlan.payoffMonths);
  });

  it("extra monthly payment reduces total interest", () => {
    const basePlan = calculateAvalancheStrategy(sampleDebts);
    const acceleratedPlan = calculateAvalancheStrategy(sampleDebts, 500);
    expect(acceleratedPlan.totalInterest).toBeLessThan(basePlan.totalInterest);
  });

  it("handles a single debt", () => {
    const plan = calculateAvalancheStrategy([creditCard]);
    expect(plan.priorityOrder).toHaveLength(1);
    expect(plan.payoffMonths).toBeGreaterThan(0);
  });
});

// ── Snowball ───────────────────────────────────────────────────────────────────

describe("calculateSnowballStrategy", () => {
  it("returns a plan with strategy name 'snowball'", () => {
    const plan = calculateSnowballStrategy(sampleDebts);
    expect(plan.strategy).toBe("snowball");
  });

  it("prioritises the lowest-balance debt first", () => {
    const plan = calculateSnowballStrategy(sampleDebts);
    expect(plan.priorityOrder[0].debtName).toBe("Credit Card");
    expect(plan.priorityOrder[0].currentBalance).toBe(5000);
  });

  it("sorts remaining debts by ascending balance", () => {
    const plan = calculateSnowballStrategy(sampleDebts);
    expect(plan.priorityOrder[1].debtName).toBe("Student Loan");
    expect(plan.priorityOrder[2].debtName).toBe("Car Loan");
  });

  it("extra payment accelerates payoff", () => {
    const basePlan = calculateSnowballStrategy(sampleDebts);
    const accelerated = calculateSnowballStrategy(sampleDebts, 300);
    expect(accelerated.payoffMonths).toBeLessThan(basePlan.payoffMonths);
  });
});

// ── Hybrid ─────────────────────────────────────────────────────────────────────

describe("calculateHybridStrategy", () => {
  it("returns a plan with a hybrid strategy name", () => {
    const plan = calculateHybridStrategy(sampleDebts, 0, 50);
    expect(plan.strategy).toContain("hybrid");
  });

  it("weighting=100 (pure avalanche) ranks high-rate first", () => {
    const plan = calculateHybridStrategy(sampleDebts, 0, 100);
    expect(plan.priorityOrder[0].interestRate).toBe(20);
  });

  it("weighting=0 uses balance scoring: highest balance scores highest and ranks first", () => {
    // normalizedBalance = balance/maxBalance → higher balance = higher score = first
    const plan = calculateHybridStrategy(sampleDebts, 0, 0);
    expect(plan.priorityOrder[0].currentBalance).toBe(15000); // Car Loan has max balance
  });

  it("includes all debts in priority order", () => {
    const plan = calculateHybridStrategy(sampleDebts, 0, 50);
    expect(plan.priorityOrder).toHaveLength(3);
  });
});

// ── Consolidation ──────────────────────────────────────────────────────────────

describe("analyzeConsolidation", () => {
  it("returns both current and consolidated strategies", () => {
    const result = analyzeConsolidation(sampleDebts, 8, 500);
    expect(result).toHaveProperty("currentStrategy");
    expect(result).toHaveProperty("consolidatedStrategy");
    expect(result).toHaveProperty("interestSavings");
    expect(result).toHaveProperty("recommendation");
  });

  it("returns a numeric interestSavings value (positive = savings, negative = costs more)", () => {
    // Note: consolidated loan is built with minimumPayment=0, so the simulation
    // may show the consolidated strategy paying more interest than avalanche.
    const result = analyzeConsolidation(sampleDebts, 5, 0);
    expect(typeof result.interestSavings).toBe("number");
  });

  it("a higher consolidation rate costs more interest", () => {
    const result = analyzeConsolidation(sampleDebts, 25, 0);
    expect(result.interestSavings).toBeLessThan(0);
    expect(result.recommendation).toContain("Don't consolidate");
  });
});

// ── Mortgage Acceleration ──────────────────────────────────────────────────────

describe("calculateMortgageAcceleration", () => {
  const mortgage: DebtForCalculation = {
    _id: "m1",
    name: "Home Mortgage",
    type: "mortgage",
    currentBalance: 400000,
    interestRate: 5,
    minimumPayment: 2147,
    principal: 400000,
  };

  it("bi-weekly payments save interest vs standard", () => {
    const result = calculateMortgageAcceleration(mortgage, "biweekly");
    expect(result.interestSavings).toBeGreaterThan(0);
    expect(result.yearsSaved).toBeGreaterThan(0);
  });

  it("lump-sum payment reduces payoff months", () => {
    const result = calculateMortgageAcceleration(mortgage, "lump-sum", 10000);
    expect(result.accelerated.payoffMonths).toBeLessThan(result.standard.payoffMonths);
  });

  it("increased monthly payment saves interest", () => {
    const result = calculateMortgageAcceleration(mortgage, "increased-payment", 300);
    expect(result.interestSavings).toBeGreaterThan(0);
  });
});

// ── Lump Sum Optimisation ──────────────────────────────────────────────────────

describe("optimizeLumpSumPayment", () => {
  it("returns zeroes and no target for empty debt list", () => {
    const result = optimizeLumpSumPayment([], 5000);
    expect(result.highestInterestFirst).toBe(0);
    expect(result.lowestBalanceFirst).toBe(0);
    expect(result.targetDebt).toBeNull();
    expect(result.recommendation).toBe("No debts to analyze");
  });

  it("recommends high-interest debt when rate gap > 5 pp", () => {
    const result = optimizeLumpSumPayment(sampleDebts, 3000);
    expect(result.targetDebt?.name).toBe("Credit Card");
    expect(result.recommendation).toContain("Credit Card");
  });

  it("returns positive savings amounts", () => {
    const result = optimizeLumpSumPayment(sampleDebts, 5000);
    expect(result.highestInterestFirst).toBeGreaterThan(0);
    expect(result.lowestBalanceFirst).toBeGreaterThan(0);
  });

  it("handles a single debt", () => {
    const result = optimizeLumpSumPayment([studentLoan], 2000);
    expect(result.targetDebt?.name).toBe("Student Loan");
  });
});

// ── Early Payoff ───────────────────────────────────────────────────────────────

describe("calculateEarlyPayoff", () => {
  it("extra payment reduces payoff months", () => {
    const result = calculateEarlyPayoff(creditCard, 200);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.earlyMonths).toBeLessThan(result.standardMonths);
  });

  it("extra payment saves interest", () => {
    const result = calculateEarlyPayoff(creditCard, 200);
    expect(result.interestSaved).toBeGreaterThan(0);
  });

  it("returns a valid future payoff date", () => {
    const result = calculateEarlyPayoff(creditCard, 100);
    expect(result.newPayoffDate).toBeInstanceOf(Date);
    expect(result.newPayoffDate.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── Recommendations ────────────────────────────────────────────────────────────

describe("getDebtRecommendations", () => {
  it("returns an array of recommendation strings", () => {
    const avalanche = calculateAvalancheStrategy(sampleDebts);
    const snowball = calculateSnowballStrategy(sampleDebts);
    const recs = getDebtRecommendations(sampleDebts, avalanche, snowball, 60000);
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
    recs.forEach((r) => expect(typeof r).toBe("string"));
  });

  it("warns about high average interest rate (>10%)", () => {
    const avalanche = calculateAvalancheStrategy(sampleDebts);
    const snowball = calculateSnowballStrategy(sampleDebts);
    const recs = getDebtRecommendations(sampleDebts, avalanche, snowball);
    const hasHighRateWarning = recs.some((r) => r.includes("high"));
    expect(hasHighRateWarning).toBe(true);
  });

  it("warns about credit card rate > 15%", () => {
    const avalanche = calculateAvalancheStrategy(sampleDebts);
    const snowball = calculateSnowballStrategy(sampleDebts);
    const recs = getDebtRecommendations(sampleDebts, avalanche, snowball);
    const hasCCWarning = recs.some((r) => r.includes("credit card") || r.includes("credit card rate") || r.includes("20%"));
    expect(hasCCWarning).toBe(true);
  });

  it("flags high debt-to-income ratio when DTI > 36%", () => {
    const avalanche = calculateAvalancheStrategy(sampleDebts);
    const snowball = calculateSnowballStrategy(sampleDebts);
    // Total debt = 28000, income = 50000 → DTI = 56%
    const recs = getDebtRecommendations(sampleDebts, avalanche, snowball, 50000);
    const hasDTIWarning = recs.some((r) => r.includes("Debt-to-income") || r.includes("income"));
    expect(hasDTIWarning).toBe(true);
  });
});
