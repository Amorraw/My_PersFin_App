// Mongoose schema for FHSA accounts with opened year and annual contribution history
import mongoose, { Schema, Document } from "mongoose";

export interface IFHSAAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountName: string;
  balance: number;
  currency: string;
  contributions: Array<{
    year: number;
    amount: number;
    date: Date;
  }>;
  withdrawals: Array<{
    year: number;
    amount: number;
    date: Date;
    purpose: string;
  }>;
  annualLimit: number;
  lifetimeLimit: number;
  currentYearUsed: number;
  lifetimeUsed: number;
  firstTimeHomeBuyerStatus: boolean;
  homeWithdrawalEligible: boolean;
  investmentHoldings: Array<{
    symbol: string;
    quantity: number;
    purchasePrice: number;
    currentValue: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const fhsaAccountSchema = new Schema<IFHSAAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountName: { type: String, required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "CAD" },
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
        purpose: String,
      },
    ],
    annualLimit: { type: Number, default: 8000 }, // 2024 limit
    lifetimeLimit: { type: Number, default: 40000 },
    currentYearUsed: { type: Number, default: 0 },
    lifetimeUsed: { type: Number, default: 0 },
    firstTimeHomeBuyerStatus: { type: Boolean, default: true },
    homeWithdrawalEligible: { type: Boolean, default: false },
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

export const FHSAAccount = mongoose.model<IFHSAAccount>(
  "FHSAAccount",
  fhsaAccountSchema
);
