import { Router, Request, Response } from "express";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { Account } from "../models/Account";
import { requireAuth } from "../middleware/requireLogin";
import mongoose from "mongoose";

const router = Router();

function uid(req: Request): mongoose.Types.ObjectId {
  return (req.user as any)._id;
}

function advanceDate(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "daily":     d.setDate(d.getDate() + 1); break;
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "biweekly":  d.setDate(d.getDate() + 14); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// Strip store numbers, reference IDs, and domain suffixes so "Tim Hortons #1234"
// and "Tim Hortons #5678" group together.
function normalizeDesc(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.com\b/g, "")
    .replace(/[#*@]/g, " ")
    .replace(/\b\d{4,}\b/g, "")   // remove 4+ digit sequences (store/ref IDs)
    .replace(/\s+/g, " ")
    .trim();
}

interface FrequencyBand {
  name: string;
  min: number;  // days
  max: number;
  minOccurrences: number;
}

const FREQUENCY_BANDS: FrequencyBand[] = [
  { name: "daily",     min: 1,   max: 2,   minOccurrences: 5 },
  { name: "weekly",    min: 5,   max: 9,   minOccurrences: 3 },
  { name: "biweekly",  min: 12,  max: 16,  minOccurrences: 3 },
  { name: "monthly",   min: 25,  max: 36,  minOccurrences: 2 },
  { name: "quarterly", min: 80,  max: 100, minOccurrences: 2 },
  { name: "yearly",    min: 340, max: 390, minOccurrences: 2 },
];

function classifyFrequency(meanDays: number): string | null {
  for (const band of FREQUENCY_BANDS) {
    if (meanDays >= band.min && meanDays <= band.max) return band.name;
  }
  return null;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[], avg: number): number {
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length);
}

// GET /api/recurring — list all recurring items
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const items = await RecurringTransaction.find({ userId: uid(req) }).sort({ nextDueDate: 1 });
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to load recurring transactions" });
  }
});

// GET /api/recurring/detect — mine transaction history for recurring patterns
// Must be declared before /:id so Express doesn't treat "detect" as an ID.
router.get("/detect", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = uid(req);

    // Fetch all non-transfer transactions that have a description
    const transactions = await Transaction.find({
      userId,
      type: { $ne: "transfer" },
      description: { $exists: true, $ne: "" },
    }).sort({ date: 1 }).lean();

    // Load existing recurring items for duplicate detection
    const existing = await RecurringTransaction.find({ userId }).lean();
    const existingNorms = new Set(existing.map((r) => normalizeDesc(r.name)));

    // Group transactions by normalized description
    const groups = new Map<string, typeof transactions>();
    for (const t of transactions) {
      const key = normalizeDesc(t.description || "");
      if (key.length < 3) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const results: any[] = [];

    for (const [normKey, txns] of groups) {
      if (txns.length < 2) continue;

      // Already sorted by date from the query
      const dates = txns.map((t) => new Date(t.date).getTime());
      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / 86400000);
      }

      const avgInterval = mean(intervals);
      const frequency = classifyFrequency(avgInterval);
      if (!frequency) continue;

      // Enforce minimum occurrence count per frequency type
      const band = FREQUENCY_BANDS.find((b) => b.name === frequency)!;
      if (txns.length < band.minOccurrences) continue;

      // Interval regularity: coefficient of variation
      const intervalSd = stddev(intervals, avgInterval);
      const intervalCv = avgInterval > 0 ? intervalSd / avgInterval : 1;
      const regularityScore = Math.max(0, 1 - intervalCv * 2);

      // Amount consistency
      const amounts = txns.map((t) => Math.abs(t.amount));
      const avgAmount = mean(amounts);
      const amountSd = stddev(amounts, avgAmount);
      const amountCv = avgAmount > 0 ? amountSd / avgAmount : 1;
      const amountScore = Math.max(0, 1 - amountCv * 3);

      // Bonus for more occurrences (caps at 6)
      const occurrenceScore = Math.min(1, txns.length / 6);

      const confidence = regularityScore * 0.5 + amountScore * 0.3 + occurrenceScore * 0.2;
      if (confidence < 0.4) continue;

      const lastTxn = txns[txns.length - 1];
      const lastDate = new Date(lastTxn.date);
      const nextDueDate = advanceDate(lastDate, frequency);

      // Determine representative name: prefer the most common description in the group
      const descCount = new Map<string, number>();
      for (const t of txns) {
        const d = t.description || "";
        descCount.set(d, (descCount.get(d) || 0) + 1);
      }
      const representativeName = [...descCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

      // Determine dominant type (income vs expense)
      const incomeCount = txns.filter((t) => t.type === "income").length;
      const type = incomeCount > txns.length / 2 ? "income" : "expense";

      // Check if already tracked (substring match, case-insensitive)
      const normName = normalizeDesc(representativeName);
      const alreadyTracked = [...existingNorms].some(
        (e) => e.includes(normName) || normName.includes(e)
      );

      results.push({
        name: representativeName,
        amount: Math.round(avgAmount * 100) / 100,
        type,
        category: lastTxn.category || "Other",
        frequency,
        confidence: Math.round(confidence * 100) / 100,
        occurrences: txns.length,
        lastDate: lastDate.toISOString(),
        nextDueDate: nextDueDate.toISOString().slice(0, 10),
        dayOfMonth: lastDate.getDate(),
        accountId: lastTxn.accountId?.toString(),
        alreadyTracked,
      });
    }

    // Sort by confidence desc, then occurrences desc
    results.sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);

    res.json(results.slice(0, 30));
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Detection failed" });
  }
});

// POST /api/recurring
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, amount, type, category, frequency, dayOfMonth, nextDueDate, accountId, isActive } = req.body;
    const item = await RecurringTransaction.create({
      userId: uid(req),
      name, amount, type, category, frequency, dayOfMonth, nextDueDate, accountId, isActive,
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to create recurring transaction" });
  }
});

// PUT /api/recurring/:id
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, amount, type, category, frequency, dayOfMonth, nextDueDate, accountId, isActive } = req.body;
    const item = await RecurringTransaction.findOneAndUpdate(
      { _id: req.params.id, userId: uid(req) },
      { name, amount, type, category, frequency, dayOfMonth, nextDueDate, accountId, isActive },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to update recurring transaction" });
  }
});

// DELETE /api/recurring/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const item = await RecurringTransaction.findOneAndDelete({ _id: req.params.id, userId: uid(req) });
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete recurring transaction" });
  }
});

// POST /api/recurring/:id/post — post as a real transaction now
router.post("/:id/post", requireAuth, async (req: Request, res: Response) => {
  try {
    const rec = await RecurringTransaction.findOne({ _id: req.params.id, userId: uid(req) });
    if (!rec) return res.status(404).json({ message: "Not found" });

    let accountId = rec.accountId;
    if (!accountId) {
      const acct = await Account.findOne({ userId: uid(req) });
      if (!acct) return res.status(400).json({ message: "No account found to post to. Create an account first." });
      accountId = acct._id as mongoose.Types.ObjectId;
    }

    // amount is always stored positive; type encodes the sign via getBalanceDelta in accounts.ts
    await Transaction.create({
      userId: uid(req),
      accountId,
      type: rec.type,
      amount: rec.amount,
      category: rec.category,
      description: rec.name,
      date: new Date(),
    });

    const nextDueDate = advanceDate(rec.nextDueDate, rec.frequency);
    rec.nextDueDate = nextDueDate;
    rec.lastPostedDate = new Date();
    await rec.save();

    res.json({ ok: true, nextDueDate });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to post transaction" });
  }
});

export default router;
