// Mongoose schema for RRSP accounts with contribution and withdrawal history sub-documents
import mongoose, { Schema, Document } from "mongoose";

export interface IRRSPAccount extends Document {
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
    withholding: number; // Withholding tax amount
  }>;
  lifetimeContributionRoom: number;
  deductionLimit: number;
  annualContributionLimit: number;
  currentYearUsed: number;
  isAccountOwner: boolean; // true for RRSP, false for Spousal RRSP
  spousalAccountId?: mongoose.Types.ObjectId; // For Spousal RRSP linking
  investmentHoldings: Array<{
    symbol: string;
    quantity: number;
    adjustedCostBase: number;
    currentValue: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const rrspAccountSchema = new Schema<IRRSPAccount>(
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
        withholding: Number,
      },
    ],
    lifetimeContributionRoom: { type: Number, default: 0 },
    deductionLimit: { type: Number, default: 0 },
    annualContributionLimit: { type: Number, default: 31560 }, // 2024 limit
    currentYearUsed: { type: Number, default: 0 },
    isAccountOwner: { type: Boolean, default: true },
    spousalAccountId: Schema.Types.ObjectId,
    investmentHoldings: [
      {
        symbol: String,
        quantity: Number,
        adjustedCostBase: Number,
        currentValue: Number,
      },
    ],
  },
  { timestamps: true }
);

export const RRSPAccount = mongoose.model<IRRSPAccount>(
  "RRSPAccount",
  rrspAccountSchema
);
