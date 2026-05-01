import { Router, Request, Response } from "express";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { Account } from "../models/Account";
import mongoose from "mongoose";

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  next();
}

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

// GET /api/recurring
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const items = await RecurringTransaction.find({ userId: uid(req) }).sort({ nextDueDate: 1 });
  res.json(items);
});

// POST /api/recurring
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const item = await RecurringTransaction.create({ ...req.body, userId: uid(req) });
  res.status(201).json(item);
});

// PUT /api/recurring/:id
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  const item = await RecurringTransaction.findOneAndUpdate(
    { _id: req.params.id, userId: uid(req) },
    req.body,
    { new: true }
  );
  if (!item) return res.status(404).json({ message: "Not found" });
  res.json(item);
});

// DELETE /api/recurring/:id
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  await RecurringTransaction.findOneAndDelete({ _id: req.params.id, userId: uid(req) });
  res.json({ ok: true });
});

// POST /api/recurring/:id/post — post as a real transaction now
router.post("/:id/post", requireAuth, async (req: Request, res: Response) => {
  const rec = await RecurringTransaction.findOne({ _id: req.params.id, userId: uid(req) });
  if (!rec) return res.status(404).json({ message: "Not found" });

  // Find first account for this user if no accountId set
  let accountId = rec.accountId;
  if (!accountId) {
    const acct = await Account.findOne({ userId: uid(req) });
    if (!acct) return res.status(400).json({ message: "No account found to post to. Create an account first." });
    accountId = acct._id as mongoose.Types.ObjectId;
  }

  const amount = rec.type === "income" ? rec.amount : -rec.amount;
  await Transaction.create({
    userId: uid(req),
    accountId,
    type: rec.type,
    amount,
    category: rec.category,
    description: rec.name,
    date: new Date(),
  });

  // Advance the next due date
  const nextDueDate = advanceDate(rec.nextDueDate, rec.frequency);
  rec.nextDueDate = nextDueDate;
  rec.lastPostedDate = new Date();
  await rec.save();

  res.json({ ok: true, nextDueDate });
});

export default router;
