// Mongoose schema for category budgets with period cycle and rollover configuration
import mongoose, { Schema, Document } from "mongoose";

export interface IBudget extends Document {
  userId: mongoose.Types.ObjectId;
  category: string;
  categoryKey?: string;
  majorCategoryKey?: string;
  majorCategoryName?: string;
  amount: number;
  period: "biweekly" | "monthly" | "yearly";
  rolloverMode: "none" | "carry-unused" | "carry-net";
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
}

const budgetSchema = new Schema<IBudget>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, required: true },
  categoryKey: { type: String, required: false },
  majorCategoryKey: { type: String, required: false },
  majorCategoryName: { type: String, required: false },
  amount: { type: Number, required: true },
  period: {
    type: String,
    enum: ["biweekly", "monthly", "yearly"],
    default: "monthly"
  },
  rolloverMode: {
    type: String,
    enum: ["none", "carry-unused", "carry-net"],
    default: "carry-unused"
  },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: Date,
  createdAt: { type: Date, default: Date.now }
});

export const Budget = mongoose.model<IBudget>("Budget", budgetSchema);
