import { Router, Request, Response as ExpressResponse } from "express";
import { Transaction } from "../models/Transaction";
import { requireAuth } from "../middleware/requireLogin";

const router = Router();
router.use(requireAuth);

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

async function proxyML(endpoint: string, body: object): Promise<any> {
  let raw: globalThis.Response;
  try {
    raw = await fetch(`${ML_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Network-level failure — uvicorn is not reachable
    const err = new Error("Cannot reach the Python ML service — make sure uvicorn is running on port 8000");
    (err as any).isNetworkError = true;
    throw err;
  }
  if (!raw.ok) {
    const text = await raw.text();
    throw new Error(`ML analysis error (${raw.status}): ${text.slice(0, 300)}`);
  }
  return raw.json();
}

// How many months of expense history a user actually has, measured from
// their earliest recorded expense to today — independent of how far back
// buildMonthlySpending happens to fetch. Drives the forecast's data-adequacy
// gate below.
async function getHistoryMonths(userId: string): Promise<number> {
  const earliest = await Transaction.findOne({ userId, type: "expense" }).sort({ date: 1 }).select("date").lean();
  if (!earliest) return 0;
  const days = (Date.now() - new Date((earliest as any).date).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days / 30.44);
}

const MIN_FORECAST_HISTORY_MONTHS = 12;
const FULL_FEATURE_HISTORY_MONTHS = 24;

// Maps the frontend's "Analysis Period" selector to a lookback window in months.
const RANGE_LOOKBACK_MONTHS: Record<string, number> = { "1y": 12, "2y": 24, "3y": 36, all: 1200 };
function rangeLookbackMonths(body: any): number {
  const r = typeof body?.range === "string" ? body.range : "1y";
  return RANGE_LOOKBACK_MONTHS[r] ?? 12;
}

async function buildMonthlySpending(userId: string, months: number) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const txns = await Transaction.find({ userId, type: "expense", date: { $gte: since } });

  const map = new Map<string, number>();
  for (const t of txns) {
    const month = t.date.toISOString().slice(0, 7);
    const cat = t.category || "Uncategorized";
    const key = `${month}|${cat}`;
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }

  return Array.from(map.entries()).map(([k, amount]) => {
    const [month, category] = k.split("|");
    return { month, category, amount: Math.round(amount * 100) / 100 };
  });
}

router.post("/forecast", async (req: Request, res: ExpressResponse) => {
  try {
    const userId = (req.user as any).id;
    const historyMonths = await getHistoryMonths(userId);

    // Block the forecast outright under a year of history — anything a
    // trend/seasonal model produces from less than that is little more than
    // a guess dressed up as a chart.
    if (historyMonths < MIN_FORECAST_HISTORY_MONTHS) {
      const wholeMonths = Math.floor(historyMonths);
      return res.json({
        forecasts: {},
        months_forecast: 0,
        insufficientHistory: true,
        monthsAvailable: Math.round(historyMonths * 10) / 10,
        message: `Cannot perform this forecast for lack of prior years' data — at least 1 year of transaction history is required (you currently have ${wholeMonths} month${wholeMonths === 1 ? "" : "s"}).`,
      });
    }

    // Lookback window is driven by the user's chosen Analysis Period — a
    // shorter period (e.g. "1y") means the model never sees 2 full yearly
    // cycles, so seasonality naturally won't apply until "2y"+ is selected.
    const lookbackMonths = rangeLookbackMonths(req.body);
    const monthly = await buildMonthlySpending(userId, lookbackMonths);
    if (monthly.length === 0) {
      return res.json({ forecasts: {}, months_forecast: 0, message: "Not enough transaction history for a forecast yet." });
    }

    // Between 1 and 2 years of history: allow the forecast, but cap the
    // horizon at 1 year — a multi-year forecast without a full seasonal
    // cycle behind it is just as unreliable as having no history at all.
    const requestedMonths = Number(req.body.months) || 3;
    const limitedHorizon = historyMonths < FULL_FEATURE_HISTORY_MONTHS && requestedMonths > 12;
    const forecastMonths = limitedHorizon ? 12 : requestedMonths;

    const result = await proxyML("/forecast", {
      monthly_spending: monthly,
      forecast_months: forecastMonths,
    });
    if (limitedHorizon) {
      result.limitedHorizon = true;
      result.message = `Forecast limited to 12 months — 2+ years of history unlocks longer, seasonal-aware multi-year forecasts.`;
    }
    res.json(result);
  } catch (err: any) {
    const status = (err as any).isNetworkError ? 502 : 422;
    res.status(status).json({ message: err.message });
  }
});

router.post("/anomalies", async (req: Request, res: ExpressResponse) => {
  try {
    const userId = (req.user as any).id;
    const lookbackMonths = rangeLookbackMonths(req.body);
    const since = new Date();
    since.setMonth(since.getMonth() - lookbackMonths);
    const txns = await Transaction.find({ userId, date: { $gte: since } });

    if (txns.length === 0) {
      return res.json({ anomalies: [], totalScanned: 0, anomalyCount: 0, message: `No transactions in the selected period to scan.` });
    }

    const transactions = txns.map(t => ({
      id: t._id.toString(),
      amount: Math.abs(t.amount),
      category: t.category || "Uncategorized",
      date: t.date.toISOString().slice(0, 10),
      description: t.description || "",
    }));

    const result = await proxyML("/anomalies", { transactions });
    res.json(result);
  } catch (err: any) {
    const status = (err as any).isNetworkError ? 502 : 422;
    res.status(status).json({ message: err.message });
  }
});

router.post("/suggest-budgets", async (req: Request, res: ExpressResponse) => {
  try {
    const userId = (req.user as any).id;
    const lookbackMonths = rangeLookbackMonths(req.body);
    const monthly = await buildMonthlySpending(userId, lookbackMonths);
    if (monthly.length === 0) {
      return res.json({ suggestions: [], monthsAnalyzed: 0, message: "Not enough transaction history for budget suggestions yet." });
    }
    const result = await proxyML("/suggest-budgets", { monthly_spending: monthly });
    res.json(result);
  } catch (err: any) {
    const status = (err as any).isNetworkError ? 502 : 422;
    res.status(status).json({ message: err.message });
  }
});

export default router;
