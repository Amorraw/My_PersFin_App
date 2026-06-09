// Mongoose schema for debts: balance, interest rate, minimum payment, and due schedule
import mongoose, { Schema, Document } from "mongoose";

export interface IDebt extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: "credit-card" | "student-loan" | "mortgage" | "auto-loan" | "personal-loan" | "other";
  principal: number;
  currentBalance: number;
  interestRate: number; // Annual percentage rate
  minimumPayment: number;
  dueScheduleType?: "specific" | "monthly" | "biweekly";
  dueDate?: Date;
  accountNumber?: string;
  lender?: string;
  createdAt: Date;
}

const debtSchema = new Schema<IDebt>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ["credit-card", "student-loan", "mortgage", "auto-loan", "personal-loan", "other"],
    required: true 
  },
  principal: { type: Number, required: true },
  currentBalance: { type: Number, required: true },
  interestRate: { type: Number, required: true }, // e.g., 18.5 for 18.5%
  minimumPayment: { type: Number, required: true },
  dueScheduleType: {
    type: String,
    enum: ["specific", "monthly", "biweekly"],
    default: "specific"
  },
  dueDate: Date,
  accountNumber: String,
  lender: String,
  createdAt: { type: Date, default: Date.now }
});

export const Debt = mongoose.model<IDebt>("Debt", debtSchema);


