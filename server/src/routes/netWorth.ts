// Net worth routes: live calculation, point-in-time snapshots, and historical history

import { Router } from 'express';
import { NetWorthSnapshot } from '../models/NetWorthSnapshot';
import { Account } from '../models/Account';
import { Debt } from '../models/Debt';
import { Property } from '../models/Property';
import { requireLogin } from '../middleware/requireLogin';

const router = Router();
router.use(requireLogin);

// Account types that represent liabilities, not assets.
// Must stay in sync with the same constant in analytics.ts and Accounts.tsx.
const LIABILITY_TYPES = new Set([
  'credit-card', 'line-of-credit', 'mortgage',
  'auto-loan', 'personal-loan', 'student-loan',
]);

const ASSET_CASH_TYPES       = new Set(['chequing', 'checking', 'savings']);
const ASSET_INVEST_TYPES     = new Set(['investment', 'tfsa', 'rrsp', 'gic']);

/**
 * Shared helper — computes totals and breakdown from the three data sources.
 * Single source of truth used by both /current and /snapshot.
 */
function calcNetWorth(accounts: any[], debts: any[], properties: any[]) {
  const realEstate = properties.reduce((s, p) => s + p.currentEstimatedValue, 0);

  // Assets = non-liability accounts + real estate
  const assetAccounts  = accounts.filter(a => !LIABILITY_TYPES.has(a.type));
  const liabAccounts   = accounts.filter(a =>  LIABILITY_TYPES.has(a.type));

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
