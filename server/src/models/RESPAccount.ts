// Mongoose schema for RESP plans with beneficiary list and CESG-tracked contributions
import mongoose, { Schema, Document } from "mongoose";

export interface IRESPAccount extends Document {
  userId: mongoose.Types.ObjectId;
  accountName: string;
  beneficiaryName: string;
  beneficiaryBirthDate: Date;
  beneficiarySIN: string;
  balance: number;
  currency: string;
  contributions: Array<{
    year: number;
    amount: number;
    date: Date;
  }>;
  grants: Array<{
    year: number;
    amount: number;
    date: Date;
    type: "CESG" | "ADDITIONAL_CESG" | "PROVINCIAL";
  }>;
  withdrawals: Array<{
    year: number;
    amount: number;
    date: Date;
    type: "EAP" | "AIP";
  }>;
  annualContributionAllowance: number;
  lifetimeContributionLimit: number;
  currentYearContribution: number;
  cumulativeGrantRoom: number;
  investmentHoldings: Array<{
    symbol: string;
    quantity: number;
    purchasePrice: number;
    currentValue: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const respAccountSchema = new Schema<IRESPAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountName: { type: String, required: true },
    beneficiaryName: { type: String, required: true },
    beneficiaryBirthDate: { type: Date, required: true },
    beneficiarySIN: { type: String, required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "CAD" },
    contributions: [
      {
        year: Number,
        amount: Number,
        date: { type: Date, default: Date.now },
      },
    ],
    grants: [
      {
        year: Number,
        amount: Number,
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ["CESG", "ADDITIONAL_CESG", "PROVINCIAL"] },
      },
    ],
    withdrawals: [
      {
        year: Number,
        amount: Number,
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ["EAP", "AIP"] },
      },
    ],
    annualContributionAllowance: { type: Number, default: 50000 },
    lifetimeContributionLimit: { type: Number, default: 50000 },
    currentYearContribution: { type: Number, default: 0 },
    cumulativeGrantRoom: { type: Number, default: 0 },
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

export const RESPAccount = mongoose.model<IRESPAccount>(
  "RESPAccount",
  respAccountSchema
);
