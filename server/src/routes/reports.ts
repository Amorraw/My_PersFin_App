import { Router, Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Investment } from "../models/Investment";
import { TaxAccount } from "../models/TaxAccount";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import mongoose from "mongoose";

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  next();
}

function uid(req: Request): mongoose.Types.ObjectId {
  return (req.user as any)._id;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Annual Spending Summary ────────────────────────────────────────────────────
router.get("/annual-spending", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const txns = await Transaction.find({ userId: uid(req), date: { $gte: start, $lt: end } }).lean();

  const byCategory: Record<string, { income: number; expense: number; count: number }> = {};
  const byMonth: Record<number, { income: number; expense: number }> = {};
  let totalIncome = 0;
  let totalExpense = 0;

  for (const t of txns) {
    const cat = (t as any).category || "Uncategorized";
    const mo = new Date((t as any).date).getMonth();
    const amt: number = (t as any).amount;

    if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0, count: 0 };
    if (!byMonth[mo]) byMonth[mo] = { income: 0, expense: 0 };

    if (amt >= 0) {
      byCategory[cat].income += amt;
      byMonth[mo].income += amt;
      totalIncome += amt;
    } else {
      byCategory[cat].expense += Math.abs(amt);
      byMonth[mo].expense += Math.abs(amt);
      totalExpense += Math.abs(amt);
    }
    byCategory[cat].count++;
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    income: byMonth[i]?.income ?? 0,
    expense: byMonth[i]?.expense ?? 0,
  }));

  res.json({ year, totalIncome, totalExpense, net: totalIncome - totalExpense, byCategory, months });
});

// ── RRSP Contribution Summary ─────────────────────────────────────────────────
router.get("/rrsp-summary", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  // RRSP deduction year = contributions Jan 1 – Feb 28/29 of the NEXT year
  const periodStart = new Date(year, 0, 1);

  const accounts = await TaxAccount.find({ userId: uid(req), accountType: "rrsp" }).lean();

  const summary = accounts.map((a: any) => ({
    accountName: a.accountName,
    contributionLimit: a.rrspContributionLimit ?? 0,
    lifetimeRoom: a.rrspLifetimeRoom ?? 0,
    contributed: a.rrspContributions ?? 0,
    remainingRoom: (a.rrspContributionLimit ?? 0) - (a.rrspContributions ?? 0),
    priorYearIncome: a.priorYearIncome ?? 0,
  }));

  const totals = summary.reduce(
    (acc, a) => ({
      limit: acc.limit + a.contributionLimit,
      contributed: acc.contributed + a.contributed,
      remaining: acc.remaining + a.remainingRoom,
    }),
    { limit: 0, contributed: 0, remaining: 0 }
  );

  res.json({
    taxYear: year,
    deadline: `March 1, ${year + 1}`,
    periodStart: fmt(periodStart),
    periodEnd: fmt(new Date(year + 1, 1, 28)), // Feb 28 of following year
    accounts: summary,
    totals,
  });
});

// ── Capital Gains / T5008 Report ──────────────────────────────────────────────
router.get("/capital-gains", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const investments = await Investment.find({
    userId: uid(req),
    soldDate: { $gte: start, $lt: end },
  }).lean();

  const dispositions = investments.map((inv: any) => {
    const proceeds = (inv.soldPrice ?? 0) * (inv.quantity ?? 0);
    const acb = inv.totalCost ?? 0;
    const gain = proceeds - acb;
    const taxableGain = inv.taxable ? gain * 0.5 : 0;
    return {
      name: inv.name,
      symbol: inv.symbol,
      type: inv.type,
      purchaseDate: fmt(new Date(inv.purchaseDate)),
      soldDate: fmt(new Date(inv.soldDate)),
      quantity: inv.quantity,
      acb,
      proceeds,
      gain,
      taxableGain,
      taxable: inv.taxable,
      currency: inv.currency,
    };
  });

  const totalProceeds = dispositions.reduce((s, d) => s + d.proceeds, 0);
  const totalAcb = dispositions.reduce((s, d) => s + d.acb, 0);
  const totalGain = dispositions.reduce((s, d) => s + d.gain, 0);
  const totalTaxableGain = dispositions.reduce((s, d) => s + d.taxableGain, 0);
  const totalGains = dispositions.filter((d) => d.gain > 0).reduce((s, d) => s + d.gain, 0);
  const totalLosses = dispositions.filter((d) => d.gain < 0).reduce((s, d) => s + d.gain, 0);

  res.json({
    taxYear: year,
    dispositions,
    summary: { totalProceeds, totalAcb, totalGain, totalTaxableGain, totalGains, totalLosses },
    note: "Capital gains inclusion rate 50% (2024). Consult CRA Schedule 3.",
  });
});

// ── Net Worth Trend ────────────────────────────────────────────────────────────
router.get("/net-worth-trend", requireAuth, async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 12;
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const snapshots = await NetWorthSnapshot.find({
    userId: uid(req).toString(),
    snapshotDate: { $gte: since },
  })
    .sort({ snapshotDate: 1 })
    .lean();

  const points = snapshots.map((s: any) => ({
    date: fmt(new Date(s.snapshotDate)),
    totalAssets: s.totalAssets,
    totalLiabilities: s.totalLiabilities,
    netWorth: s.netWorth,
  }));

  const first = points[0]?.netWorth ?? 0;
  const last = points[points.length - 1]?.netWorth ?? 0;
  const change = last - first;
  const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : 0;

  res.json({ months, points, summary: { first, last, change, changePct } });
});

// ── Budget Performance YTD ────────────────────────────────────────────────────
router.get("/budget-performance", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const now = new Date();
  const end = now.getFullYear() === year ? now : new Date(year + 1, 0, 1);

  const budgets = await Budget.find({ userId: uid(req), isActive: true }).lean();

  const rows = await Promise.all(
    budgets.map(async (b: any) => {
      const monthlyBudget =
        b.period === "yearly" ? b.amount / 12 : b.period === "biweekly" ? b.amount * 26 / 12 : b.amount;

      const monthsElapsed = end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12 + 1;
      const budgetYtd = monthlyBudget * monthsElapsed;

      const result = await Transaction.aggregate([
        {
          $match: {
            userId: uid(req),
            category: b.category,
            date: { $gte: start, $lte: end },
            amount: { $lt: 0 },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const spent = Math.abs(result[0]?.total ?? 0);
      const variance = budgetYtd - spent;
      const pct = budgetYtd > 0 ? (spent / budgetYtd) * 100 : 0;

      return {
        category: b.category,
        period: b.period,
        monthlyBudget,
        budgetYtd,
        spent,
        variance,
        pct,
        status: pct > 100 ? "over" : pct > 80 ? "warning" : "on-track",
      };
    })
  );

  const totalBudget = rows.reduce((s, r) => s + r.budgetYtd, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  res.json({
    year,
    monthsElapsed: end.getMonth() + 1,
    rows,
    totals: { budgetYtd: totalBudget, spent: totalSpent, variance: totalBudget - totalSpent },
  });
});

// ── Export: Transactions CSV ───────────────────────────────────────────────────
router.get("/export/transactions-csv", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const txns = await Transaction.find({ userId: uid(req), date: { $gte: start, $lt: end } })
    .sort({ date: 1 })
    .lean();

  const header = "Date,Description,Category,Type,Amount,Currency\r\n";
  const rows = txns
    .map((t: any) => {
      const date = fmt(new Date(t.date));
      const desc = `"${(t.description || "").replace(/"/g, '""')}"`;
      const cat = `"${(t.category || "").replace(/"/g, '""')}"`;
      const type = t.amount >= 0 ? "income" : "expense";
      const amount = Math.abs(t.amount).toFixed(2);
      return `${date},${desc},${cat},${type},${amount},CAD`;
    })
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transactions_${year}.csv"`);
  res.send(header + rows);
});

// ── Export: Transactions OFX (Quicken-compatible) ─────────────────────────────
router.get("/export/transactions-ofx", requireAuth, async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const txns = await Transaction.find({ userId: uid(req), date: { $gte: start, $lt: end } })
    .sort({ date: 1 })
    .lean();

  const ofxDate = (d: Date) => d.toISOString().replace(/[-:T]/g, "").slice(0, 14) + "[0:GMT]";

  const stmtTrns = txns
    .map((t: any) => {
      const amt = (t.amount as number).toFixed(2);
      const type = (t.amount as number) >= 0 ? "CREDIT" : "DEBIT";
      const dtPosted = ofxDate(new Date(t.date));
      const memo = (t.description || t.category || "").replace(/[<>&]/g, " ").slice(0, 32);
      const fitid = (t._id as any).toString();
      return [
        "<STMTTRN>",
        `<TRNTYPE>${type}`,
        `<DTPOSTED>${dtPosted}`,
        `<TRNAMT>${amt}`,
        `<FITID>${fitid}`,
        `<MEMO>${memo}`,
        "</STMTTRN>",
      ].join("\r\n");
    })
    .join("\r\n");

  const ofx = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:151",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRSV1>",
    "<SONRS>",
    "<STATUS><CODE>0<SEVERITY>INFO</STATUS>",
    `<DTSERVER>${ofxDate(new Date())}`,
    "<LANGUAGE>ENG",
    "</SONRS>",
    "</SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1>",
    "<STMTTRNRS>",
    "<TRNUID>1001",
    "<STATUS><CODE>0<SEVERITY>INFO</STATUS>",
    "<STMTRS>",
    "<CURDEF>CAD",
    "<BANKACCTFROM>",
    "<BANKID>000000000",
    "<ACCTID>PERSFIN-EXPORT",
    "<ACCTTYPE>CHECKING",
    "</BANKACCTFROM>",
    "<BANKTRANLIST>",
    `<DTSTART>${ofxDate(start)}`,
    `<DTEND>${ofxDate(new Date(end.getTime() - 1))}`,
    stmtTrns,
    "</BANKTRANLIST>",
    "</STMTRS>",
    "</STMTTRNRS>",
    "</BANKMSGSRSV1>",
    "</OFX>",
  ].join("\r\n");

  res.setHeader("Content-Type", "application/x-ofx");
  res.setHeader("Content-Disposition", `attachment; filename="transactions_${year}.qfx"`);
  res.send(ofx);
});

// ── Export: Investment Holdings CSV ───────────────────────────────────────────
router.get("/export/holdings-csv", requireAuth, async (req: Request, res: Response) => {
  const holdings = await Investment.find({ userId: uid(req) }).sort({ symbol: 1 }).lean();

  const header =
    "Symbol,Name,Type,Purchase Date,Quantity,ACB/Unit,Total ACB,Current Price,Current Value,Unrealized Gain,Unrealized %,Dividends,Sold Date,Proceeds,Realized Gain,Taxable,Currency\r\n";

  const rows = holdings
    .map((h: any) => {
      const col = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [
        col(h.symbol),
        col(h.name),
        col(h.type),
        col(h.purchaseDate ? fmt(new Date(h.purchaseDate)) : ""),
        h.quantity ?? 0,
        (h.purchasePrice ?? 0).toFixed(4),
        (h.totalCost ?? 0).toFixed(2),
        (h.currentPrice ?? 0).toFixed(4),
        (h.currentValue ?? 0).toFixed(2),
        (h.unrealizedGain ?? 0).toFixed(2),
        (h.unrealizedGainPercent ?? 0).toFixed(2) + "%",
        (h.dividendsReceived ?? 0).toFixed(2),
        col(h.soldDate ? fmt(new Date(h.soldDate)) : ""),
        h.soldDate ? ((h.soldPrice ?? 0) * (h.quantity ?? 0)).toFixed(2) : "",
        h.soldDate ? (h.realizedGain ?? 0).toFixed(2) : "",
        h.taxable ? "Yes" : "No",
        col(h.currency ?? "CAD"),
      ].join(",");
    })
    .join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="holdings_${new Date().getFullYear()}.csv"`);
  res.send(header + rows);
});

export default router;
