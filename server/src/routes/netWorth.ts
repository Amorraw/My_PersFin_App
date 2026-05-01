import { Router } from 'express';
import { NetWorthSnapshot } from '../models/NetWorthSnapshot';
import { Account } from '../models/Account';
import { Debt } from '../models/Debt';
import { Property } from '../models/Property';
import { requireLogin } from '../middleware/requireLogin';

const router = Router();
router.use(requireLogin);

/**
 * GET /net-worth/current
 * Get current net worth with breakdown
 */
router.get('/current', async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;

    const [accounts, debts, properties] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Property.find({ userId }),
    ]);

    const realEstateTotal = properties.reduce((sum, p) => sum + p.currentEstimatedValue, 0);
    const accountAssets   = accounts.reduce((sum, acc) => sum + Math.max(0, acc.balance), 0);
    const totalAssets     = accountAssets + realEstateTotal;
    const totalLiabilities = debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;

    const breakdown = {
      assets: {
        cash: accounts.filter(a => a.type === 'chequing' || a.type === 'savings').reduce((sum, a) => sum + a.balance, 0),
        investments: accounts.filter(a => a.type === 'investment' || a.type === 'tfsa' || a.type === 'rrsp').reduce((sum, a) => sum + a.balance, 0),
        realEstate: realEstateTotal,
        otherAssets: accounts.filter(a => !['chequing', 'savings', 'investment', 'tfsa', 'rrsp'].includes(a.type)).reduce((sum, a) => sum + Math.max(0, a.balance), 0),
      },
      liabilities: {
        mortgages: debts.filter(d => d.type === 'mortgage').reduce((sum, d) => sum + d.currentBalance, 0),
        creditCard: accounts.filter(a => a.type === 'credit-card').reduce((sum, a) => sum + Math.abs(Math.min(0, a.balance)), 0),
        loans: debts.filter(d => ['personal-loan', 'auto-loan', 'student-loan'].includes(d.type)).reduce((sum, d) => sum + d.currentBalance, 0),
        otherLiabilities: 0,
      },
    };

    res.json({ totalAssets, totalLiabilities, netWorth, breakdown });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /net-worth/snapshot
 * Create a net worth snapshot
 */
router.post('/snapshot', async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;

    const [accounts, debts, properties] = await Promise.all([
      Account.find({ userId }),
      Debt.find({ userId }),
      Property.find({ userId }),
    ]);

    const realEstateTotal  = properties.reduce((sum, p) => sum + p.currentEstimatedValue, 0);
    const accountAssets    = accounts.reduce((sum, acc) => sum + Math.max(0, acc.balance), 0);
    const totalAssets      = accountAssets + realEstateTotal;
    const totalLiabilities = debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;

    const breakdown = {
      assets: {
        cash: accounts.filter(a => a.type === 'chequing' || a.type === 'savings').reduce((sum, a) => sum + a.balance, 0),
        investments: accounts.filter(a => a.type === 'investment' || a.type === 'tfsa' || a.type === 'rrsp').reduce((sum, a) => sum + a.balance, 0),
        realEstate: realEstateTotal,
        otherAssets: accounts.filter(a => !['chequing', 'savings', 'investment', 'tfsa', 'rrsp'].includes(a.type)).reduce((sum, a) => sum + Math.max(0, a.balance), 0),
      },
      liabilities: {
        mortgages: debts.filter(d => d.type === 'mortgage').reduce((sum, d) => sum + d.currentBalance, 0),
        creditCard: accounts.filter(a => a.type === 'credit-card').reduce((sum, a) => sum + Math.abs(Math.min(0, a.balance)), 0),
        loans: debts.filter(d => ['personal-loan', 'auto-loan', 'student-loan'].includes(d.type)).reduce((sum, d) => sum + d.currentBalance, 0),
        otherLiabilities: 0,
      },
    };

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

/**
 * GET /net-worth/history
 * Get net worth history
 */
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
