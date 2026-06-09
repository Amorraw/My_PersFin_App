// Transaction routes: CRUD with automatic account balance updates after each change

import { Router, Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { Account } from "../models/Account";
import { requireAuth } from "../middleware/requireLogin";

const router = Router();
const LIABILITY_TYPES = new Set([
  "credit-card",
  "line-of-credit",
  "student-loan",
  "mortgage",
  "auto-loan",
  "personal-loan"
]);

function getBalanceDelta(
  accountType: string,
  transactionType: "income" | "expense" | "transfer",
  amount: number
): number {
  if (transactionType === "transfer") return 0;
  const baseDelta = transactionType === "income" ? amount : -amount;
  return LIABILITY_TYPES.has(accountType) ? -baseDelta : baseDelta;
}

async function recalculateAccountBalance(userId: string, accountId: string): Promise<void> {
  const account = await Account.findOne({ _id: accountId, userId });
  if (!account) return;

  const txns = await Transaction.find({ userId, accountId });
  if (txns.length === 0) {
    account.balance = 0;
    await account.save();
    return;
  }

  if (LIABILITY_TYPES.has(account.type)) {
    const latestStatementTxn = await Transaction.findOne({
      userId,
      accountId,
      statementBalance: { $ne: null }
    }).sort({ date: -1, createdAt: -1, _id: -1 });

    if (latestStatementTxn && typeof (latestStatementTxn as any).statementBalance === "number") {
      account.balance = Math.max(0, (latestStatementTxn as any).statementBalance as number);
      await account.save();
      return;
    }
  }

  const recalculated = txns.reduce((sum, txn) => {
    return sum + getBalanceDelta(account.type, txn.type, txn.amount);
  }, 0);

  account.balance = recalculated;
  await account.save();
}

// All routes require authentication
router.use(requireAuth);

// GET / — list transactions for the user, filterable by accountId and date range
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { accountId, startDate, endDate } = req.query;

    const filter: any = { userId };
    if (accountId) filter.accountId = accountId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    }

    const transactions = await Transaction.find(filter).sort({ date: -1 });
    return res.json(transactions);
  } catch (err: any) {
    console.error("Error getting transactions:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /:id — fetch a single transaction by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const transaction = await Transaction.findOne({ _id: req.params.id, userId });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.json(transaction);
  } catch (err: any) {
    console.error("Error getting transaction:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// POST / — create a transaction and immediately update the linked account balance
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { accountId, type, amount, category, description, date } = req.body;

    if (!accountId || !type || amount === undefined) {
      return res.status(400).json({ message: "Account ID, type, and amount are required" });
    }

    const account = await Account.findOne({ _id: accountId, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const numericAmount = Number(amount);

    const transaction = await Transaction.create({
      userId,
      accountId,
      type,
      amount: numericAmount,
      category,
      description,
      date: date ? new Date(date) : new Date()
    });

    account.balance += getBalanceDelta(account.type, type, numericAmount);
    await account.save();

    return res.status(201).json(transaction);
  } catch (err: any) {
    console.error("Error creating transaction:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PUT /:id — update a transaction; reverses old balance delta and applies new one
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { accountId, type, amount, category, description, date } = req.body;

    const oldTransaction = await Transaction.findOne({ _id: req.params.id, userId });
    if (!oldTransaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const newAccountId = accountId || oldTransaction.accountId;

    if (accountId && accountId !== oldTransaction.accountId.toString()) {
      const checkAccount = await Account.findOne({ _id: accountId, userId });
      if (!checkAccount) {
        return res.status(404).json({ message: "New account not found" });
      }
    }

    const oldAccount = await Account.findById(oldTransaction.accountId);
    if (oldAccount) {
      oldAccount.balance -= getBalanceDelta(oldAccount.type, oldTransaction.type, oldTransaction.amount);
      await oldAccount.save();
    }

    const newAccount = await Account.findById(newAccountId);
    if (newAccount) {
      const numericAmount = Number(amount);
      newAccount.balance += getBalanceDelta(newAccount.type, type, numericAmount);
      await newAccount.save();
    }

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId },
      {
        accountId: newAccountId,
        type,
        amount: Number(amount),
        category,
        description,
        date
      },
      { new: true, runValidators: true }
    );

    return res.json(updatedTransaction);
  } catch (err: any) {
    console.error("Error updating transaction:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// DELETE /:id — delete one transaction and recalculate the affected account balance
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const transaction = await Transaction.findOne({ _id: req.params.id, userId });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const affectedAccountId = transaction.accountId.toString();
    await Transaction.findByIdAndDelete(transaction._id);
    await recalculateAccountBalance(userId, affectedAccountId);

    return res.json({ message: "Transaction deleted" });
  } catch (err: any) {
    console.error("Error deleting transaction:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// DELETE / — bulk-delete transactions by ID array (or all), then recalculate balances
router.delete("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { ids } = req.body;

    const transactionIds = ids && Array.isArray(ids) && ids.length > 0 ? ids : undefined;
    const query: any = { userId };
    if (transactionIds) {
      query._id = { $in: transactionIds };
    }

    const transactions = await Transaction.find(query, { accountId: 1 });
    const affectedAccountIds = new Set(transactions.map((txn) => txn.accountId.toString()));

    const deleteResult = await Transaction.deleteMany(query);

    if (transactionIds) {
      for (const accountId of affectedAccountIds) {
        await recalculateAccountBalance(userId, accountId);
      }
    } else {
      const allAccounts = await Account.find({ userId }, { _id: 1 });
      for (const account of allAccounts) {
        await recalculateAccountBalance(userId, account._id.toString());
      }
    }

    return res.json({
      message: `${deleteResult.deletedCount} transaction(s) deleted`,
      deletedCount: deleteResult.deletedCount
    });
  } catch (err: any) {
    console.error("Error deleting transactions:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;





