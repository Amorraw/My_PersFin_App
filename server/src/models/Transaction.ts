// Mongoose schema for income, expense, and transfer transactions with category tagging
import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  type: "income" | "expense" | "transfer";
  amount: number;
  category?: string;
  description?: string;
  date: Date;
  statementBalance?: number | null;
  plaidTransactionId?: string;
  plaidAccountId?: string;
  source?: "manual" | "csv" | "pdf" | "plaid";
  createdAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  type: {
    type: String,
    enum: ["income", "expense", "transfer"],
    required: true
  },
  amount: { type: Number, required: true },
  category: String,
  description: String,
  date: { type: Date, default: Date.now },
  statementBalance:    { type: Number, required: false, default: null },
  plaidTransactionId:  { type: String, sparse: true },
  plaidAccountId:      { type: String },
  source:              { type: String, enum: ["manual", "csv", "pdf", "plaid"], default: "manual" },
  createdAt:           { type: Date, default: Date.now }
});

// Only enforce uniqueness when plaidTransactionId is an actual string (not null/missing).
// The old { sparse: true } compound index is ineffective here because userId is always present.
transactionSchema.index(
  { userId: 1, plaidTransactionId: 1 },
  { unique: true, partialFilterExpression: { plaidTransactionId: { $type: "string" } } }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", transactionSchema);
