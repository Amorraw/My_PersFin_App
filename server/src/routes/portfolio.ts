// Portfolio routes: rebalancing calculator, Canadian asset-location rules, and performance metrics

import { Router } from "express";
import { requireLogin } from "../middleware/requireLogin";

const router = Router();
router.use(requireLogin);

type AssetClass =
  | "canadian-equity"
  | "us-equity"
  | "intl-equity"
  | "canadian-bonds"
  | "cash"
  | "other";

type AccountType = "TFSA" | "RRSP" | "FHSA" | "non-registered" | "other";

interface Holding {
  name: string;
  symbol?: string;
  value: number;
  assetClass: AssetClass;
  accountType: AccountType;
}

// POST /rebalance — compute buy/sell trades needed to hit target asset-class weights
router.post("/rebalance", (req, res, next) => {
  try {
    const {
      holdings,
      target,
      driftThreshold = 5,
    } = req.body as {
      holdings: Holding[];
      target: {
        canadianEquity: number;
        usEquity: number;
        intlEquity: number;
        canadianBonds: number;
        cash: number;
      };
      driftThreshold?: number;
    };

    const totalValue = holdings.reduce((s, h) => s + h.value, 0);
    if (totalValue === 0)
      return res.status(400).json({ message: "Total portfolio value cannot be zero" });

    const currentByClass: Record<string, number> = {};
    holdings.forEach((h) => {
      currentByClass[h.assetClass] = (currentByClass[h.assetClass] || 0) + h.value;
    });

    const targetMap: Record<string, number> = {
      "canadian-equity": target.canadianEquity,
      "us-equity": target.usEquity,
      "intl-equity": target.intlEquity,
      "canadian-bonds": target.canadianBonds,
      cash: target.cash,
    };

    const trades = Object.entries(targetMap).map(([assetClass, targetPct]) => {
      const currentValue = currentByClass[assetClass] || 0;
      const currentPct = (currentValue / totalValue) * 100;
      const targetValue = (totalValue * targetPct) / 100;
      const tradeAmount = targetValue - currentValue;
      const drift = currentPct - targetPct;
      return {
        assetClass,
        currentValue,
        currentPct,
        targetPct,
        targetValue,
        tradeAmount,
        drift,
        isDrifted: Math.abs(drift) > driftThreshold,
        action: tradeAmount > 100 ? "buy" : tradeAmount < -100 ? "sell" : "hold",
      };
    });

    const taxShelteredValue = holdings
      .filter(
        (h) => h.accountType === "TFSA" || h.accountType === "RRSP" || h.accountType === "FHSA"
      )
      .reduce((s, h) => s + h.value, 0);

    const taxAdvice = trades
      .filter((t) => t.isDrifted)
      .map((t) => ({
        ...t,
        taxEfficientNote:
          t.action === "sell"
            ? "Sell overweight positions inside RRSP/TFSA first to avoid capital gains tax"
            : "Buy inside TFSA first (tax-free growth), then RRSP, then non-registered last",
      }));

    res.json({
      totalValue,
      trades,
      taxAdvice,
      taxShelteredValue,
      taxShelteredPercent: totalValue > 0 ? (taxShelteredValue / totalValue) * 100 : 0,
      driftedCount: trades.filter((t) => t.isDrifted).length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /asset-location — return Canadian tax-law rules for placing each asset type in TFSA/RRSP/non-reg
router.post("/asset-location", (req, res, next) => {
  try {
    const { tfsaValue = 0, rrspValue = 0, fhsaValue = 0, nonRegValue = 0 } = req.body;

    const rules = [
      {
        assetType: "High-growth equity ETFs (XEQT, VEQT, VGRO, XGRO)",
        bestAccount: "TFSA",
        reason:
          "Tax-free growth and tax-free withdrawals — most valuable for assets with the highest expected long-term returns",
        priority: 1,
        worstAccount: "Non-Registered",
      },
      {
        assetType: "US equity ETFs (VFV, XSP, ZSP)",
        bestAccount: "RRSP",
        reason:
          "Canada–US tax treaty eliminates the 15% US withholding tax on dividends inside an RRSP (but NOT a TFSA)",
        priority: 1,
        worstAccount: "TFSA",
      },
      {
        assetType: "Canadian bond ETFs (ZAG, VAB, XBB)",
        bestAccount: "RRSP",
        reason:
          "Interest income is 100% taxable — shielding it in an RRSP defers tax until withdrawal, which is typically at a lower rate",
        priority: 1,
        worstAccount: "Non-Registered",
      },
      {
        assetType: "Canadian equity ETFs (VCN, ZCN, XIC)",
        bestAccount: "Non-Registered or TFSA",
        reason:
          "Canadian dividends qualify for the dividend tax credit, making them relatively tax-efficient in non-registered accounts; TFSA is also great",
        priority: 2,
        worstAccount: "RRSP",
      },
      {
        assetType: "Canadian REITs (ZRE, XRE)",
        bestAccount: "RRSP or TFSA",
        reason:
          "REIT distributions are largely fully taxable (return of capital + income); shelter them in a registered account",
        priority: 1,
        worstAccount: "Non-Registered",
      },
      {
        assetType: "International equity ETFs (XEF, VIU, IEFA)",
        bestAccount: "TFSA or Non-Registered",
        reason:
          "Foreign withholding taxes apply even inside an RRSP for non-US countries (Canada–US treaty doesn't cover other countries); TFSA growth is still tax-free",
        priority: 2,
        worstAccount: "RRSP",
      },
      {
        assetType: "GICs / High-Interest Savings (EQ Bank, etc.)",
        bestAccount: "TFSA",
        reason:
          "Interest income is 100% taxable; keeping interest-bearing assets inside a TFSA converts that taxable income to tax-free income",
        priority: 1,
        worstAccount: "Non-Registered",
      },
      {
        assetType: "Dividend-paying US stocks",
        bestAccount: "RRSP",
        reason:
          "Same reason as US ETFs — the Canada–US tax treaty eliminates the 15% withholding on dividends inside an RRSP",
        priority: 1,
        worstAccount: "TFSA",
      },
    ];

    const accounts = [
      { type: "TFSA", value: tfsaValue },
      { type: "RRSP", value: rrspValue },
      { type: "FHSA", value: fhsaValue },
      { type: "Non-Registered", value: nonRegValue },
    ].filter((a) => a.value > 0);

    const total = accounts.reduce((s, a) => s + a.value, 0);

    res.json({ rules, accounts, total });
  } catch (err) {
    next(err);
  }
});

// POST /performance — compute total return, annualized return, and tax-loss harvest flags per holding
router.post("/performance", (req, res, next) => {
  try {
    const { holdings } = req.body as {
      holdings: Array<{
        name: string;
        symbol: string;
        purchaseDate: string;
        purchasePrice: number;
        currentPrice: number;
        quantity: number;
        dividendsReceived?: number;
        accountType: string;
        type: string;
      }>;
    };

    if (!holdings || holdings.length === 0) {
      return res.json({ holdings: [], summary: null });
    }

    const today = new Date();

    const results = holdings.map((h) => {
      const totalCost = h.purchasePrice * h.quantity;
      const currentValue = h.currentPrice * h.quantity;
      const dividends = h.dividendsReceived || 0;
      const totalReturn = currentValue - totalCost + dividends;
      const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

      const purchaseDate = new Date(h.purchaseDate);
      const yearsHeld =
        (today.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 3600 * 1000);

      const annualizedReturn =
        yearsHeld > 0.083 && totalCost > 0
          ? (Math.pow(currentValue / totalCost, 1 / yearsHeld) - 1) * 100
          : totalReturnPct;

      // T5 slips only apply to non-registered accounts
      const isTaxable = h.accountType === "non-registered";

      return {
        ...h,
        totalCost,
        currentValue,
        dividends,
        totalReturn,
        totalReturnPct,
        annualizedReturn,
        yearsHeld,
        taxLossHarvestable: isTaxable && totalReturn < 0,
        t5Dividends: isTaxable ? dividends : 0,
      };
    });

    const totalCost = results.reduce((s, h) => s + h.totalCost, 0);
    const totalValue = results.reduce((s, h) => s + h.currentValue, 0);
    const totalReturn = results.reduce((s, h) => s + h.totalReturn, 0);
    const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
    const totalT5Dividends = results.reduce((s, h) => s + h.t5Dividends, 0);

    res.json({
      holdings: results,
      summary: {
        totalCost,
        totalValue,
        totalReturn,
        totalReturnPct,
        totalT5Dividends,
        taxLossHarvestOpportunities: results.filter((h) => h.taxLossHarvestable).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
