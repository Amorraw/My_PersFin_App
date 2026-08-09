// Mongoose schema for TFSA accounts with annual contribution and withdrawal history
import mongoose, { Schema, Document } from "mongoose";

export interface ITFSAAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountName: string;
  institution: string;
  balance: number;
  currency: string;
  notes?: string;
  contributions: Array<{
    year: number;
    amount: number;
    date: Date;
  }>;
  withdrawals: Array<{
    year: number;
    amount: number;
    date: Date;
  }>;
  lifetimeContributionRoom: number;
  annualLimit: number;
  currentYearUsed: number;
  investmentHoldings: Array<{
    symbol: string;
    quantity: number;
    purchasePrice: number;
    currentValue: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const tfsaAccountSchema = new Schema<ITFSAAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountName: { type: String, required: true },
    institution: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "CAD" },
    notes: { type: String, default: "" },
    contributions: [
      {
        year: Number,
        amount: Number,
        date: { type: Date, default: Date.now },
      },
    ],
    withdrawals: [
      {
        year: Number,
        amount: Number,
        date: { type: Date, default: Date.now },
      },
    ],
    lifetimeContributionRoom: { type: Number, default: 0 },
    annualLimit: { type: Number, default: 7000 }, // 2024 limit
    currentYearUsed: { type: Number, default: 0 },
    investmentHoldings: [
      {
        symbol: String,
        quantity: Number,
        purchasePrice: Number,
        currentValue: Number,
      },
    ],
  },
  { timestamps: true }
);

export const TFSAAccount = mongoose.model<ITFSAAccount>(
  "TFSAAccount",
  tfsaAccountSchema
);
