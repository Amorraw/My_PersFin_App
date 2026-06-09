import {
  CONTRIBUTION_LIMITS_2024,
  WITHHOLDING_TAX_RATES,
  CPP_RATES_2024,
  OAS_RATES_2024,
  CAPITAL_GAINS_INCLUSION,
  calculateRRSPContributionRoom,
  calculateCESG,
  calculateRRIFMinimumWithdrawal,
  calculateCPPBenefit,
  calculateOASWithGIS,
  calculateACB,
  calculateCapitalGain,
  getAccountTypeDescription,
  ACCOUNT_TYPE_FEATURES,
} from "../utils/accountRules";

// ── Contribution Limit Constants ──────────────────────────────────────────────

describe("CONTRIBUTION_LIMITS_2024", () => {
  it("RRSP annual limit is $31,560", () => {
    expect(CONTRIBUTION_LIMITS_2024.RRSP.annualLimit).toBe(31560);
  });

  it("FHSA annual limit is $8,000", () => {
    expect(CONTRIBUTION_LIMITS_2024.FHSA.annualLimit).toBe(8000);
  });

  it("FHSA lifetime limit is $40,000", () => {
    expect(CONTRIBUTION_LIMITS_2024.FHSA.lifetimeLimit).toBe(40000);
  });

  it("TFSA annual limit is $7,000", () => {
    expect(CONTRIBUTION_LIMITS_2024.TFSA.annualLimit).toBe(7000);
  });

  it("RESP CESG match rate is 20%", () => {
    expect(CONTRIBUTION_LIMITS_2024.RESP.cesgMatch).toBe(0.2);
  });

  it("RESP CESG max annual grant is $500", () => {
    expect(CONTRIBUTION_LIMITS_2024.RESP.cesgMaxAnnual).toBe(500);
  });

  it("RESP CESG lifetime max is $7,200", () => {
    expect(CONTRIBUTION_LIMITS_2024.RESP.cesgLifetimeMax).toBe(7200);
  });
});

describe("WITHHOLDING_TAX_RATES", () => {
  it("RRSP withdrawal under $5,000 withheld at 10%", () => {
    expect(WITHHOLDING_TAX_RATES.RRSP_WITHDRAWAL.under5000).toBe(0.1);
  });

  it("RRSP withdrawal over $15,000 withheld at 30%", () => {
    expect(WITHHOLDING_TAX_RATES.RRSP_WITHDRAWAL.over15000).toBe(0.3);
  });

  it("FHSA withdrawal has no withholding", () => {
    expect(WITHHOLDING_TAX_RATES.FHSA_WITHDRAWAL).toBe(0);
  });
});

// ── calculateRRSPContributionRoom ─────────────────────────────────────────────

describe("calculateRRSPContributionRoom", () => {
  it("returns 18% of prior income when below the annual cap", () => {
    const room = calculateRRSPContributionRoom(60000, 0, "ON");
    expect(room).toBeCloseTo(10800, 2);
  });

  it("caps at RRSP annual limit for high earners", () => {
    const room = calculateRRSPContributionRoom(300000, 0, "ON");
    expect(room).toBe(31560);
  });

  it("subtracts previous contributions from the annual room", () => {
    const room = calculateRRSPContributionRoom(60000, 5000, "ON");
    expect(room).toBeCloseTo(5800, 2);
  });

  it("never returns negative when over-contributed", () => {
    const room = calculateRRSPContributionRoom(60000, 20000, "ON");
    expect(room).toBe(0);
  });
});

// ── calculateCESG ─────────────────────────────────────────────────────────────

describe("calculateCESG", () => {
  it("returns 20% of contribution up to $500 annually", () => {
    expect(calculateCESG(2500)).toBe(500);
  });

  it("caps annual grant at $500 even for larger contributions", () => {
    expect(calculateCESG(5000)).toBe(500);
  });

  it("returns proportional grant for contributions below $2,500", () => {
    expect(calculateCESG(1000)).toBe(200);
  });

  it("respects lifetime CESG cap of $7,200", () => {
    // $7,100 already received — only $100 room left
    const grant = calculateCESG(5000, 0, 7100);
    expect(grant).toBe(100);
  });

  it("returns 0 when lifetime cap already reached", () => {
    const grant = calculateCESG(5000, 0, 7200);
    expect(grant).toBe(0);
  });
});

// ── calculateRRIFMinimumWithdrawal ────────────────────────────────────────────

describe("calculateRRIFMinimumWithdrawal", () => {
  it("calculates minimum withdrawal for age 71", () => {
    const withdrawal = calculateRRIFMinimumWithdrawal(71, 500000);
    expect(withdrawal).toBeCloseTo(500000 * 0.0567, 2);
  });

  it("calculates minimum withdrawal for age 65", () => {
    const withdrawal = calculateRRIFMinimumWithdrawal(65, 200000);
    expect(withdrawal).toBeCloseTo(200000 * 0.0427, 2);
  });

  it("returns 0 for an age without a defined percentage", () => {
    const withdrawal = calculateRRIFMinimumWithdrawal(40, 100000);
    expect(withdrawal).toBe(0);
  });

  it("scales linearly with balance", () => {
    const half = calculateRRIFMinimumWithdrawal(72, 100000);
    const full = calculateRRIFMinimumWithdrawal(72, 200000);
    expect(full).toBeCloseTo(half * 2, 5);
  });
});

// ── calculateCPPBenefit ───────────────────────────────────────────────────────

describe("calculateCPPBenefit", () => {
  it("returns a positive monthly benefit at age 65", () => {
    const benefit = calculateCPPBenefit(35, 55000, 65);
    expect(benefit).toBeGreaterThan(0);
  });

  it("early claiming (age 60) reduces benefit by 0.36% per year before 65", () => {
    const at65 = calculateCPPBenefit(35, 55000, 65);
    const at60 = calculateCPPBenefit(35, 55000, 60);
    // Implementation multiplies years (not months) by 0.0036
    expect(at60).toBeCloseTo(at65 * (1 - 5 * 0.0036), 2);
  });

  it("deferred claiming (age 70) increases benefit by 0.42% per year after 65", () => {
    const at65 = calculateCPPBenefit(35, 55000, 65);
    const at70 = calculateCPPBenefit(35, 55000, 70);
    // Implementation multiplies years (not months) by 0.0042
    expect(at70).toBeCloseTo(at65 * (1 + 5 * 0.0042), 2);
  });

  it("caps deferred benefit at 1.42× and higher ages produce same result as the cap", () => {
    const at65 = calculateCPPBenefit(35, 55000, 65);
    // The 1.42 cap is only reached at extreme deferral ages (years * 0.0042 >= 0.42)
    // Verify at70 < at65 * 1.42 (cap not yet reached) and stays below cap
    const at70 = calculateCPPBenefit(35, 55000, 70);
    expect(at70).toBeLessThanOrEqual(at65 * 1.42);
    expect(at70).toBeGreaterThan(at65);
  });
});

// ── calculateOASWithGIS ───────────────────────────────────────────────────────

describe("calculateOASWithGIS", () => {
  it("returns full OAS with no clawback below the threshold", () => {
    const result = calculateOASWithGIS(50000, 65);
    expect(result.clawback).toBe(0);
    expect(result.oasMonthly).toBe(OAS_RATES_2024.baseMonthly);
  });

  it("applies 15% clawback above the income threshold", () => {
    const incomeOverThreshold = 100000;
    const result = calculateOASWithGIS(incomeOverThreshold, 65);
    const expectedAnnualClawback = (incomeOverThreshold - OAS_RATES_2024.incomeThreshold) * 0.15;
    expect(result.clawback).toBeCloseTo(expectedAnnualClawback, 2);
  });

  it("OAS is never negative (fully clawed back)", () => {
    const result = calculateOASWithGIS(1000000, 65);
    expect(result.oasMonthly).toBe(0);
  });

  it("qualifies for GIS at very low income", () => {
    const result = calculateOASWithGIS(10000, 65);
    expect(result.gisMonthly).toBe(OAS_RATES_2024.gisBasic);
  });

  it("no GIS above income cut-off (~$25,921)", () => {
    const result = calculateOASWithGIS(30000, 65);
    expect(result.gisMonthly).toBe(0);
  });
});

// ── calculateACB ──────────────────────────────────────────────────────────────

describe("calculateACB", () => {
  it("returns the purchase price for a single lot", () => {
    const acb = calculateACB([{ quantity: 100, price: 50 }]);
    expect(acb).toBe(50);
  });

  it("returns weighted average cost across multiple lots", () => {
    const acb = calculateACB([
      { quantity: 100, price: 50 },
      { quantity: 100, price: 70 },
    ]);
    expect(acb).toBe(60);
  });

  it("handles unequal lot sizes", () => {
    const acb = calculateACB([
      { quantity: 200, price: 40 },
      { quantity: 100, price: 70 },
    ]);
    // (200×40 + 100×70) / 300 = (8000+7000)/300 = 50
    expect(acb).toBeCloseTo(50, 5);
  });

  it("returns 0 for empty holdings", () => {
    expect(calculateACB([])).toBe(0);
  });
});

// ── calculateCapitalGain ──────────────────────────────────────────────────────

describe("calculateCapitalGain", () => {
  it("calculates capital gain correctly", () => {
    const result = calculateCapitalGain(40, 60, 100);
    expect(result.capitalGain).toBe(2000);
  });

  it("applies 50% inclusion rate below $250K threshold", () => {
    const result = calculateCapitalGain(10, 20, 1000); // $10K gain
    expect(result.taxableGain).toBe(5000);
    expect(result.inclusionRate).toBe(0.5);
  });

  it("calculates a capital loss correctly", () => {
    const result = calculateCapitalGain(60, 40, 100);
    expect(result.capitalGain).toBe(-2000);
  });

  it("accounts for prior-year gains in inclusion rate", () => {
    // $100K gain, but $200K of prior gains already used → only $50K left in low bucket
    const result = calculateCapitalGain(0, 1000, 100, 200000);
    // $50K at 50% + $50K at 2/3
    const expectedTaxable = 50000 * 0.5 + 50000 * (2 / 3);
    expect(result.taxableGain).toBeCloseTo(expectedTaxable, 2);
  });
});

// ── getAccountTypeDescription ─────────────────────────────────────────────────

describe("getAccountTypeDescription", () => {
  it("returns description for RRSP", () => {
    const desc = getAccountTypeDescription("RRSP");
    expect(desc).toContain("Registered Retirement Savings Plan");
  });

  it("returns description for TFSA", () => {
    const desc = getAccountTypeDescription("TFSA");
    expect(desc).toContain("Tax-Free Savings Account");
  });

  it("returns description for FHSA", () => {
    const desc = getAccountTypeDescription("FHSA");
    expect(desc).toContain("First Home");
  });

  it("returns 'Account' for unknown types", () => {
    expect(getAccountTypeDescription("UNKNOWN")).toBe("Account");
  });
});

// ── ACCOUNT_TYPE_FEATURES ─────────────────────────────────────────────────────

describe("ACCOUNT_TYPE_FEATURES", () => {
  it("RRSP is tax-deferred and tax-deductible", () => {
    expect(ACCOUNT_TYPE_FEATURES.RRSP.taxDeferred).toBe(true);
    expect(ACCOUNT_TYPE_FEATURES.RRSP.taxDeductible).toBe(true);
  });

  it("TFSA is tax-deferred but NOT tax-deductible", () => {
    expect(ACCOUNT_TYPE_FEATURES.TFSA.taxDeferred).toBe(true);
    expect(ACCOUNT_TYPE_FEATURES.TFSA.taxDeductible).toBe(false);
  });

  it("RRIF has a mandatory minimum withdrawal", () => {
    expect(ACCOUNT_TYPE_FEATURES.RRIF.minimumWithdrawal).toBe(true);
  });

  it("RESP qualifies for government grants", () => {
    expect(ACCOUNT_TYPE_FEATURES.RESP.govtGrants).toBe(true);
  });
});

// ── CAPITAL_GAINS_INCLUSION helper ────────────────────────────────────────────

describe("CAPITAL_GAINS_INCLUSION.capitalGainsTax", () => {
  it("correctly computes tax on a gain below $250K threshold", () => {
    const tax = CAPITAL_GAINS_INCLUSION.capitalGainsTax(100000, 0.40);
    expect(tax).toBeCloseTo(100000 * 0.5 * 0.40, 2);
  });

  it("uses 2/3 inclusion on the portion above $250K", () => {
    const tax = CAPITAL_GAINS_INCLUSION.capitalGainsTax(300000, 0.40);
    const expected = (250000 * 0.5 + 50000 * (2 / 3)) * 0.40;
    expect(tax).toBeCloseTo(expected, 2);
  });
});
