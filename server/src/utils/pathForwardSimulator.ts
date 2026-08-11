import { HIGH_INTEREST_DEBT_APR, EMERGENCY_FUND_TARGET_MONTHS } from "./financeConstants";

export interface SimDebtInput {
  currentBalance: number;
  interestRate: number;
  minimumPayment: number;
}

export interface PathForwardInput {
  debts: SimDebtInput[];
  cash: number;
  monthlyCashFlow: number;
  otherNetWorth: number;
  /** Same trailing-3-month average basis getLiveFinancials() uses for emergencyFundMonths. */
  avgMonthlyExpense: number;
  extraAggressiveMonthly: number;
  maxMonths?: number;
}

export interface MonthPoint {
  month: string; // "YYYY-MM"
  debt: number;
  cash: number;
  netWorth: number;
}

export interface PathMilestones {
  highInterestDebtClearedMonth: number | null;
  emergencyFundFundedMonth: number | null;
  netWorthPositiveMonth: number | null;
}

export interface PathResult {
  monthly: MonthPoint[];
  milestones: PathMilestones;
}

export interface PathForwardResult {
  current: PathResult;
  recommended: PathResult;
  aggressive: PathResult;
  hasStructuralShortfall: boolean;
}

type PathKind = "current" | "recommended" | "aggressive";

type SimDebt = SimDebtInput;

function cloneDebts(debts: SimDebtInput[]): SimDebt[] {
  return debts.map((d) => ({ ...d }));
}

function futureMonthLabel(monthsAhead: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 7);
}

/**
 * Runs one month of a payoff/savings waterfall over `debts`/`cash` in place.
 * `applyWaterfall` is false for the "current trajectory" path — surplus just
 * accumulates in cash with no deliberate debt-acceleration or EF-targeting,
 * modeling "no behavior change." Returns nothing; mutates the passed state.
 */
function stepMonth(
  debts: SimDebt[],
  state: { cash: number },
  monthlyCashFlow: number,
  extraAmount: number,
  applyWaterfall: boolean
) {
  // Interest accrues on every open debt first.
  for (const d of debts) {
    if (d.currentBalance > 0) d.currentBalance *= 1 + d.interestRate / 100 / 12;
  }

  // Minimums are recomputed over still-open debts only, each month — a debt
  // cleared this month frees its minimum payment as surplus starting now,
  // same as the existing avalanche/snowball engine in debtOptimizer.ts.
  const openDebts = debts.filter((d) => d.currentBalance > 0);
  const totalMinimums = openDebts.reduce((s, d) => s + Math.min(d.minimumPayment, d.currentBalance), 0);
  for (const d of openDebts) {
    d.currentBalance = Math.max(0, d.currentBalance - Math.min(d.minimumPayment, d.currentBalance));
  }

  const surplus = monthlyCashFlow - totalMinimums + extraAmount;

  if (surplus < 0) {
    // Structural shortfall even before extras — no plan can allocate a
    // negative amount, the gap just drains cash (can go negative).
    state.cash += surplus;
    return;
  }

  if (!applyWaterfall) {
    state.cash += surplus;
    return;
  }

  let remaining = surplus;

  // (a) avalanche onto the highest-rate high-interest debt first
  const highInterest = debts
    .filter((d) => d.currentBalance > 0 && d.interestRate >= HIGH_INTEREST_DEBT_APR)
    .sort((a, b) => b.interestRate - a.interestRate);
  for (const d of highInterest) {
    if (remaining <= 0) break;
    const pay = Math.min(remaining, d.currentBalance);
    d.currentBalance -= pay;
    remaining -= pay;
  }

  // (b)/(c) once no high-interest debt remains, everything left over accumulates
  // in cash — the emergency-fund target only gates milestone detection below,
  // there's no separate "invested" bucket to route into once the EF is funded.
  state.cash += remaining;
}

function runPath(
  kind: PathKind,
  input: PathForwardInput,
  efTargetAmount: number,
  maxMonths: number
): PathResult {
  const debts = cloneDebts(input.debts);
  const state = { cash: input.cash };
  const monthly: MonthPoint[] = [];
  const milestones: PathMilestones = {
    highInterestDebtClearedMonth: null,
    emergencyFundFundedMonth: null,
    netWorthPositiveMonth: null,
  };

  const totalDebtAt = () => debts.reduce((s, d) => s + d.currentBalance, 0);
  const hasHighInterest = () => debts.some((d) => d.currentBalance > 0 && d.interestRate >= HIGH_INTEREST_DEBT_APR);
  const netWorthAt = () => input.otherNetWorth + state.cash - totalDebtAt();

  // Month 0 = today's starting point, before any simulated step.
  if (!hasHighInterest()) milestones.highInterestDebtClearedMonth = 0;
  if (state.cash >= efTargetAmount) milestones.emergencyFundFundedMonth = 0;
  if (netWorthAt() >= 0) milestones.netWorthPositiveMonth = 0;

  const extra = kind === "aggressive" ? input.extraAggressiveMonthly : 0;
  const applyWaterfall = kind !== "current";

  for (let m = 1; m <= maxMonths; m++) {
    stepMonth(debts, state, input.monthlyCashFlow, extra, applyWaterfall);

    const netWorth = netWorthAt();
    monthly.push({ month: futureMonthLabel(m), debt: Math.round(totalDebtAt() * 100) / 100, cash: Math.round(state.cash * 100) / 100, netWorth: Math.round(netWorth * 100) / 100 });

    if (milestones.highInterestDebtClearedMonth === null && !hasHighInterest()) {
      milestones.highInterestDebtClearedMonth = m;
    }
    if (milestones.emergencyFundFundedMonth === null && state.cash >= efTargetAmount) {
      milestones.emergencyFundFundedMonth = m;
    }
    if (milestones.netWorthPositiveMonth === null && netWorth >= 0) {
      milestones.netWorthPositiveMonth = m;
    }
  }

  return { monthly, milestones };
}

export function simulatePathForward(input: PathForwardInput): PathForwardResult {
  const maxMonths = input.maxMonths ?? 60;

  const efTargetAmount = EMERGENCY_FUND_TARGET_MONTHS * input.avgMonthlyExpense;

  const totalMinimums = input.debts.reduce((s, d) => s + Math.min(d.minimumPayment, d.currentBalance), 0);
  const hasStructuralShortfall = input.monthlyCashFlow - totalMinimums < 0;

  return {
    current: runPath("current", input, efTargetAmount, maxMonths),
    recommended: runPath("recommended", input, efTargetAmount, maxMonths),
    aggressive: runPath("aggressive", input, efTargetAmount, maxMonths),
    hasStructuralShortfall,
  };
}
