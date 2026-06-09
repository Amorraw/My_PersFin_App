import {
  TAX_LIMITS,
  TFSA_ANNUAL_LIMITS,
  calculateRRSPRoom,
  calculateTFSARoom,
  calculateTFSALifetimeRoomSchedule,
  calculateTFSARoomFromBirthYear,
  getMarginalTaxRate,
  getMarginalTaxRateDetailed,
  calculateCapitalGainsTax,
  calculateRRSPTaxSavings,
  calculateOptimalWithdrawalSequence,
  optimizeDividendAccounts,
  recommendSpousalRRSP,
  identifyTaxLossHarvestingOpportunities,
} from "../utils/taxPlanner";

// ── TAX_LIMITS constants ───────────────────────────────────────────────────────

describe("TAX_LIMITS constants", () => {
  it("RRSP annual max is 31560 for 2024", () => {
    expect(TAX_LIMITS.RRSP_ANNUAL_MAX).toBe(31560);
  });

  it("RRSP percentage is 18%", () => {
    expect(TAX_LIMITS.RRSP_PERCENTAGE).toBe(0.18);
  });

  it("TFSA annual limit is 7000 for 2024", () => {
    expect(TAX_LIMITS.TFSA_ANNUAL_LIMIT).toBe(7000);
  });

  it("capital gains low inclusion rate is 50%", () => {
    expect(TAX_LIMITS.CAPITAL_GAINS_INCLUSION_RATE_LOW).toBe(0.5);
  });

  it("capital gains annual threshold is $250,000", () => {
    expect(TAX_LIMITS.CAPITAL_GAINS_ANNUAL_THRESHOLD).toBe(250000);
  });
});

// ── TFSA_ANNUAL_LIMITS table ───────────────────────────────────────────────────

describe("TFSA_ANNUAL_LIMITS", () => {
  it("2009 limit is $5,000", () => expect(TFSA_ANNUAL_LIMITS[2009]).toBe(5000));
  it("2015 one-time increase is $10,000", () => expect(TFSA_ANNUAL_LIMITS[2015]).toBe(10000));
  it("2023 limit is $6,500", () => expect(TFSA_ANNUAL_LIMITS[2023]).toBe(6500));
  it("2024 limit is $7,000", () => expect(TFSA_ANNUAL_LIMITS[2024]).toBe(7000));
});

// ── calculateRRSPRoom ─────────────────────────────────────────────────────────

describe("calculateRRSPRoom", () => {
  it("returns 18% of prior income when below annual max", () => {
    // 18% of $60,000 = $10,800, which is < $31,560
    const room = calculateRRSPRoom(60000, 0, 0);
    expect(room).toBeCloseTo(10800, 2);
  });

  it("caps at RRSP annual max when income is very high", () => {
    // 18% of $250,000 = $45,000, capped at $31,560
    const room = calculateRRSPRoom(250000, 0, 0);
    expect(room).toBe(31560);
  });

  it("subtracts current-year contributions", () => {
    const room = calculateRRSPRoom(60000, 5000, 0);
    expect(room).toBeCloseTo(5800, 2);
  });

  it("adds unused lifetime room", () => {
    const room = calculateRRSPRoom(60000, 0, 20000);
    expect(room).toBeCloseTo(30800, 2);
  });

  it("never returns negative room", () => {
    const room = calculateRRSPRoom(60000, 50000, 0);
    expect(room).toBe(0);
  });
});

// ── calculateTFSARoom ─────────────────────────────────────────────────────────

describe("calculateTFSARoom", () => {
  it("subtracts contributions from available room", () => {
    const room = calculateTFSARoom(20000, 5000);
    expect(room).toBe(15000);
  });

  it("adds current-year withdrawals back to available room", () => {
    const room = calculateTFSARoom(20000, 0, 3000);
    expect(room).toBe(23000);
  });

  it("never returns negative room", () => {
    const room = calculateTFSARoom(5000, 10000);
    expect(room).toBe(0);
  });
});

// ── calculateTFSALifetimeRoomSchedule ─────────────────────────────────────────

describe("calculateTFSALifetimeRoomSchedule", () => {
  it("someone born in 1990 is eligible from 2009 (18 in 2008 but TFSA starts 2009)", () => {
    const schedule = calculateTFSALifetimeRoomSchedule(1990, 2024);
    const year2009 = schedule.find((y) => y.year === 2009);
    expect(year2009?.eligible).toBe(true);
  });

  it("someone born in 2000 is eligible from 2018 (turns 18 in 2018)", () => {
    const schedule = calculateTFSALifetimeRoomSchedule(2000, 2024);
    const year2017 = schedule.find((y) => y.year === 2017);
    const year2018 = schedule.find((y) => y.year === 2018);
    expect(year2017?.eligible).toBe(false);
    expect(year2018?.eligible).toBe(true);
  });

  it("cumulative room for 1990-born person equals ~$95,000 by 2024", () => {
    const schedule = calculateTFSALifetimeRoomSchedule(1990, 2024);
    const lastEntry = schedule[schedule.length - 1];
    expect(lastEntry.cumulativeRoom).toBe(95000);
  });

  it("returns years from 2009 up to asOfYear", () => {
    const schedule = calculateTFSALifetimeRoomSchedule(1990, 2020);
    expect(schedule[0].year).toBe(2009);
    expect(schedule[schedule.length - 1].year).toBe(2020);
  });
});

// ── calculateTFSARoomFromBirthYear ────────────────────────────────────────────

describe("calculateTFSARoomFromBirthYear", () => {
  it("calculates remaining room correctly with no contributions", () => {
    const result = calculateTFSARoomFromBirthYear(1990, 0, 0, 2024);
    expect(result.lifetimeRoom).toBe(95000);
    expect(result.remainingRoom).toBe(95000);
    expect(result.overContribution).toBe(0);
    expect(result.monthlyPenalty).toBe(0);
  });

  it("reduces remaining room by total contributions", () => {
    const result = calculateTFSARoomFromBirthYear(1990, 30000, 0, 2024);
    expect(result.remainingRoom).toBe(65000);
  });

  it("detects over-contribution and calculates 1% monthly penalty", () => {
    const result = calculateTFSARoomFromBirthYear(1990, 100000, 0, 2024);
    expect(result.overContribution).toBe(5000);
    expect(result.monthlyPenalty).toBeCloseTo(50, 2);
  });

  it("prior-year withdrawals re-add to available room", () => {
    const result = calculateTFSARoomFromBirthYear(1990, 95000, 10000, 2024);
    expect(result.remainingRoom).toBe(10000);
  });
});

// ── getMarginalTaxRate ────────────────────────────────────────────────────────

describe("getMarginalTaxRate", () => {
  it("returns a combined federal + provincial rate greater than 0", () => {
    expect(getMarginalTaxRate(50000, "ON")).toBeGreaterThan(0);
  });

  it("income in lowest federal bracket is taxed at 15% federal", () => {
    const result = getMarginalTaxRateDetailed(30000, "ON");
    expect(result.federalRate).toBe(15);
  });

  it("income above $246,752 hits top federal bracket (33%)", () => {
    const result = getMarginalTaxRateDetailed(300000, "ON");
    expect(result.federalRate).toBe(33);
  });

  it("defaults to Ontario when no province provided", () => {
    const withON = getMarginalTaxRate(80000, "ON");
    const withDefault = getMarginalTaxRate(80000);
    expect(withON).toBe(withDefault);
  });

  it("returns different combined rates for different provinces", () => {
    const ab = getMarginalTaxRate(100000, "AB");
    const qc = getMarginalTaxRate(100000, "QC");
    expect(ab).not.toBe(qc);
  });

  it("combined rate is federal + provincial", () => {
    const detail = getMarginalTaxRateDetailed(80000, "ON");
    expect(detail.combinedRate).toBe(detail.federalRate + detail.provincialRate);
  });
});

// ── calculateCapitalGainsTax ──────────────────────────────────────────────────

describe("calculateCapitalGainsTax", () => {
  it("applies 50% inclusion rate below $250K threshold", () => {
    const result = calculateCapitalGainsTax(100000, 40);
    expect(result.lowRatePortion).toBe(100000);
    expect(result.highRatePortion).toBe(0);
    expect(result.taxableGain).toBeCloseTo(50000, 2);
    expect(result.taxOwed).toBeCloseTo(20000, 2);
  });

  it("splits gain above $250K threshold into two buckets", () => {
    const result = calculateCapitalGainsTax(300000, 40);
    expect(result.lowRatePortion).toBe(250000);
    expect(result.highRatePortion).toBe(50000);
  });

  it("accounts for prior gains already used in the low-rate bucket", () => {
    const result = calculateCapitalGainsTax(100000, 40, 200000);
    // Only $50K room left at 50%, so $50K at 50% and $50K at 2/3
    expect(result.lowRatePortion).toBe(50000);
    expect(result.highRatePortion).toBe(50000);
  });

  it("no room left in low-rate bucket when prior gains >= $250K", () => {
    const result = calculateCapitalGainsTax(50000, 40, 250000);
    expect(result.lowRatePortion).toBe(0);
    expect(result.highRatePortion).toBe(50000);
  });

  it("returns breakdown string", () => {
    const result = calculateCapitalGainsTax(100000, 40);
    expect(typeof result.breakdown).toBe("string");
    expect(result.breakdown.length).toBeGreaterThan(0);
  });
});

// ── calculateRRSPTaxSavings ───────────────────────────────────────────────────

describe("calculateRRSPTaxSavings", () => {
  it("calculates tax savings correctly", () => {
    const result = calculateRRSPTaxSavings(10000, 40);
    expect(result.taxSavings).toBe(4000);
  });

  it("net contribution = contribution minus tax savings", () => {
    const result = calculateRRSPTaxSavings(10000, 40);
    expect(result.netContribution).toBe(6000);
  });

  it("future withdrawal tax uses same rate when not overridden", () => {
    const result = calculateRRSPTaxSavings(10000, 40);
    expect(result.futureWithdrawalTax).toBe(4000);
  });

  it("future withdrawal tax uses lower rate in retirement", () => {
    const result = calculateRRSPTaxSavings(10000, 40, 25);
    expect(result.futureWithdrawalTax).toBe(2500);
  });
});

// ── calculateOptimalWithdrawalSequence ────────────────────────────────────────

describe("calculateOptimalWithdrawalSequence", () => {
  it("draws from non-registered first", () => {
    const result = calculateOptimalWithdrawalSequence(5000, 10000, 10000, 20000, 30);
    expect(result.withdrawalOrder[0]).toContain("Non-Registered");
  });

  it("draws from TFSA second (after non-registered is exhausted)", () => {
    const result = calculateOptimalWithdrawalSequence(15000, 10000, 10000, 20000, 30);
    expect(result.withdrawalOrder.some((w) => w.includes("TFSA"))).toBe(true);
    const tfsaIndex = result.withdrawalOrder.findIndex((w) => w.includes("TFSA"));
    const nonRegIndex = result.withdrawalOrder.findIndex((w) => w.includes("Non-Registered"));
    expect(tfsaIndex).toBeGreaterThan(nonRegIndex);
  });

  it("draws from RRSP last", () => {
    const result = calculateOptimalWithdrawalSequence(30000, 5000, 5000, 50000, 30);
    const rrspEntry = result.withdrawalOrder.find((w) => w.includes("RRSP"));
    expect(rrspEntry).toBeDefined();
    expect(rrspEntry).toContain("estimated tax");
  });

  it("calculates estimated tax only on RRSP portion", () => {
    // All from RRSP: need 20000, no non-reg, no tfsa
    const result = calculateOptimalWithdrawalSequence(20000, 0, 0, 50000, 30);
    expect(result.estimatedTax).toBeCloseTo(20000 * 0.30, 2);
  });
});

// ── optimizeDividendAccounts ──────────────────────────────────────────────────

describe("optimizeDividendAccounts", () => {
  it("TFSA has 100% tax efficiency", () => {
    const result = optimizeDividendAccounts("tfsa");
    expect(result.taxEfficiency).toBe(100);
    expect(result.accountType).toBe("TFSA");
  });

  it("RRSP has 90% tax efficiency", () => {
    const result = optimizeDividendAccounts("rrsp");
    expect(result.taxEfficiency).toBe(90);
  });

  it("non-registered has 75% tax efficiency", () => {
    const result = optimizeDividendAccounts("non-registered");
    expect(result.taxEfficiency).toBe(75);
  });

  it("unknown account type defaults to non-registered", () => {
    const result = optimizeDividendAccounts("unknown");
    expect(result.taxEfficiency).toBe(75);
  });
});

// ── recommendSpousalRRSP ──────────────────────────────────────────────────────

describe("recommendSpousalRRSP", () => {
  it("recommends a positive contribution", () => {
    const result = recommendSpousalRRSP(120000, 40000, 40, 25);
    expect(result.recommendedSpousalContribution).toBeGreaterThan(0);
  });

  it("tax savings = contribution × high-earner marginal rate", () => {
    const result = recommendSpousalRRSP(120000, 40000, 40, 25);
    const expectedSavings = result.recommendedSpousalContribution * 0.40;
    expect(result.taxSavingsHighEarner).toBeCloseTo(expectedSavings, 5);
  });

  it("recommended contribution does not exceed 18% of high earner income", () => {
    const result = recommendSpousalRRSP(120000, 40000, 40, 25);
    expect(result.recommendedSpousalContribution).toBeLessThanOrEqual(120000 * 0.18);
  });

  it("returns income-splitting rationale as a string", () => {
    const result = recommendSpousalRRSP(120000, 40000, 40, 25);
    expect(typeof result.futureIncomeSplitting).toBe("string");
  });
});

// ── identifyTaxLossHarvestingOpportunities ────────────────────────────────────

describe("identifyTaxLossHarvestingOpportunities", () => {
  const investments = [
    { unrealizedGain: -200, soldDate: null } as any,
    { unrealizedGain: -30, soldDate: null } as any,
    { unrealizedGain: 500, soldDate: null } as any,
    { unrealizedGain: -100, soldDate: "2024-01-01" } as any,
  ];

  it("returns only non-registered account losses", () => {
    const result = identifyTaxLossHarvestingOpportunities(investments, "non-registered");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty array for RRSP accounts", () => {
    const result = identifyTaxLossHarvestingOpportunities(investments, "rrsp");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for TFSA accounts", () => {
    const result = identifyTaxLossHarvestingOpportunities(investments, "tfsa");
    expect(result).toHaveLength(0);
  });

  it("excludes losses below $50 and already-sold positions", () => {
    const result = identifyTaxLossHarvestingOpportunities(investments, "non-registered");
    result.forEach((inv) => {
      expect(inv.unrealizedGain).toBeLessThan(-50);
      expect(inv.soldDate).toBeNull();
    });
  });
});
