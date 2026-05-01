import mongoose, { Schema, Document } from "mongoose";

export interface IRecurringTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  dayOfMonth: number;
  nextDueDate: Date;
  accountId?: mongoose.Types.ObjectId;
  isActive: boolean;
  lastPostedDate?: Date;
  createdAt: Date;
}

const schema = new Schema<IRecurringTransaction>(
  {
    userId:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name:          { type: String, required: true },
    amount:        { type: Number, required: true, min: 0 },
    type:          { type: String, enum: ["income", "expense"], required: true },
    category:      { type: String, default: "Other" },
    frequency:     { type: String, enum: ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"], default: "monthly" },
    dayOfMonth:    { type: Number, min: 1, max: 31, default: 1 },
    nextDueDate:   { type: Date, required: true },
    accountId:     { type: Schema.Types.ObjectId, ref: "Account" },
    isActive:      { type: Boolean, default: true },
    lastPostedDate:{ type: Date },
  },
  { timestamps: true }
);

export const RecurringTransaction = mongoose.model<IRecurringTransaction>("RecurringTransaction", schema);
