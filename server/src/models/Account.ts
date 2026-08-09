// Mongoose schema for financial accounts: bank, investment, credit, and debt accounts
import mongoose, { Schema, Document } from "mongoose";

export interface IAccount extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: "chequing" | "checking" | "savings" | "credit-card" | "tfsa" | "rrsp" | "gic" | "line-of-credit" | "student-loan" | "mortgage" | "auto-loan" | "personal-loan" | "investment" | "other";
  institution?: string;
  balance: number;
  currency: string;
  createdAt: Date;
}

const accountSchema = new Schema<IAccount>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["chequing", "checking", "savings", "credit-card", "tfsa", "rrsp", "gic", "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan", "investment", "other"],
    required: true
  },
  institution: { type: String },
  balance: { type: Number, default: 0 },
  currency: { type: String, default: "CAD" },
  createdAt: { type: Date, default: Date.now }
});

export const Account = mongoose.model<IAccount>("Account", accountSchema);
