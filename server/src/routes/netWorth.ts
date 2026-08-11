// Net worth routes: live calculation, point-in-time snapshots, and historical history

import { Router } from 'express';
import { NetWorthSnapshot } from '../models/NetWorthSnapshot';
import { Account } from '../models/Account';
import { Debt } from '../models/Debt';
import { Property } from '../models/Property';
import { requireLogin } from '../middleware/requireLogin';
import { LIABILITY_TYPES, ASSET_CASH_TYPES, ASSET_INVEST_TYPES } from '../utils/financeConstants';
import { matchesTrackedDebt, debtNameSet } from '../utils/debtMatching';

const router = Router();
router.use(requireLogin);

/**
 * Shared helper — computes totals and breakdown from the three data sources.
 * Single source of truth used by /current, /snapshot, and getLiveFinancials().
 */
export function calcNetWorth(accounts: any[], debts: any[], properties: any[]) {
  const realEstate = properties.reduce((s, p) => s + p.currentEstimatedValue, 0);

  // Assets = non-liability accounts + real estate
  const assetAccounts  = accounts.filter(a => !LIABILITY_TYPES.has(a.type));
  const allLiabAccounts = accounts.filter(a => LIABILITY_TYPES.has(a.type));

  // A liability account already tracked as a Debt (e.g. via Debts page or demo
  // seeding, which creates a Debt for every liability account) must not also be
  // counted via its raw Account.balance, or the same real-world debt gets summed
  // twice — once in debtTotal, once in acctLiabTotal.
  const trackedNames = debtNameSet(debts);
  const liabAccounts = allLiabAccounts.filter(a => !matchesTrackedDebt(a.name, trackedNames));

  const accountAssets  = assetAccounts.reduce((s, a) => s + a.balance, 0);
  const totalAssets    = accountAssets + realEstate;

  // Liabilities = Debt-model entries + liability-type account balances (CC, LOC, etc.)
  const debtTotal      = debts.reduce((s, d) => s + d.currentBalance, 0);
  const acctLiabTotal  = liabAccounts.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = debtTotal + acctLiabTotal;

  const netWorth = totalAssets - totalLiabilities;

  const breakdown = {
    assets: {
      cash: assetAccounts
        .filter(a => ASSET_CASH_TYPES.has(a.type))
        .reduce((s, a) => s + a.balance, 0),
      investments: assetAccounts
        .filter(a => ASSET_INVEST_TYPES.has(a.type))
        .reduce((s, a) => s + a.balance, 0),
      realEstate,
      otherAssets: assetAccounts
        .filter(a => !ASSET_CASH_TYPES.has(a.type) && !ASSET_INVEST_TYPES.has(a.type))
        .reduce((s, a) => s + a.balance, 0),
    },
    liabilities: {
      mortgages: debts
        .filter(d => d.type === 'mortgage')
        .reduce((s, d) => s + d.currentBalance, 0),
      creditCard: liabAccounts
        .filter(a => a.type === 'credit-card')
        .reduce((s, a) => s + a.balance, 0),
      lineOfCredit: liabAccounts
        .filter(a => a.type === 'line-of-credit')
        .reduce((s, a) => s + a.balance, 0),
      loans: debts
        .filter(d => ['personal-loan', 'auto-loan', 'student-loan'].includes(d.type))
        .reduce((s, d) => s + d.currentBalance, 0),
      otherLiabilities: liabAccounts
        .filter(a => !['credit-card', 'line-of-credit'].includes(a.type))
        .reduce((s, a) => s + a.balance, 0),
    },
  };

  return { totalAssets, totalLiabilities, netWorth, breakdown };
}

// GET /current — compute live net worth from accounts, debts, and properties
router.get('/current', async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const [accounts, debts, properties] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Property.find({ userId }),
    ]);
    res.json(calcNetWorth(accounts, debts, properties));
  } catch (err) {
    next(err);
  }
});

// POST /snapshot — persist today's net worth breakdown to the history collection
router.post('/snapshot', async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const [accounts, debts, properties] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Property.find({ userId }),
    ]);
    const { totalAssets, totalLiabilities, netWorth, breakdown } =
      calcNetWorth(accounts, debts, properties);

    const snapshot = await NetWorthSnapshot.create({
      userId,
      totalAssets,
      totalLiabilities,
      netWorth,
      breakdown,
      snapshotDate: new Date(),
    });
    res.json({ snapshot });
  } catch (err) {
    next(err);
  }
});

// GET /history — return past net worth snapshots up to N months back (default 12)
router.get('/history', async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const months = parseInt(req.query.months as string) || 12;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);
    const snapshots = await NetWorthSnapshot.find({
      userId,
      snapshotDate: { $gte: cutoffDate },
    }).sort({ snapshotDate: 1 });
    res.json({ snapshots });
  } catch (err) {
    next(err);
  }
});

export default router;
