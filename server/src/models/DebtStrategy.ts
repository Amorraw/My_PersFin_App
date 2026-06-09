// Mongoose schema for saved debt payoff strategies with avalanche/snowball allocations
import mongoose, { Schema, Document } from "mongoose";

export interface IDebtStrategy extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  strategyType: "avalanche" | "snowball" | "hybrid" | "consolidation" | "mortgage-acceleration";
  
  // Debts included in this strategy
  debtIds: mongoose.Types.ObjectId[];
  
  // Strategy parameters
  monthlyBudget: number; // Extra payment available
  priorityWeighting?: number; // For hybrid: 0-100 (0=snowball, 100=avalanche)
  targetPayoffMonths?: number; // Goal payoff timeline
  
  // Analysis results
  totalDebt: number;
  totalInterest: number; // Interest paid with this strategy
  payoffMonths: number; // Months to pay off completely
  monthlyPayment: number; // Average monthly payment
  priorityOrder: Array<{
    debtId: mongoose.Types.ObjectId;
    debtName: string;
    currentBalance: number;
    interestRate: number;
    priority: number; // 1 = pay first, 2 = pay second, etc
    recommendedPayment: number;
  }>;
  
  // Comparison data
  comparisonWithAvalanche?: {
    interestSavings: number;
    monthsSaved: number;
  };
  comparisonWithSnowball?: {
    interestSavings: number;
    monthsAdded: number;
  };
  
  // Recommendations
  recommendations: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

const debtStrategySchema = new Schema<IDebtStrategy>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  strategyType: {
    type: String,
    enum: ["avalanche", "snowball", "hybrid", "consolidation", "mortgage-acceleration"],
    required: true,
  },
  
  debtIds: [{ type: Schema.Types.ObjectId, ref: "Debt" }],
  
  monthlyBudget: { type: Number, required: true, default: 0 },
  priorityWeighting: { type: Number, default: 50 }, // 50 = balanced
  targetPayoffMonths: Number,
  
  totalDebt: { type: Number, default: 0 },
  totalInterest: { type: Number, default: 0 },
  payoffMonths: { type: Number, default: 0 },
  monthlyPayment: { type: Number, default: 0 },
  
  priorityOrder: [
    {
      debtId: { type: Schema.Types.ObjectId, ref: "Debt" },
      debtName: String,
      currentBalance: Number,
      interestRate: Number,
      priority: Number,
      recommendedPayment: Number,
    },
  ],
  
  comparisonWithAvalanche: {
    interestSavings: Number,
    monthsSaved: Number,
  },
  
  comparisonWithSnowball: {
    interestSavings: Number,
    monthsAdded: Number,
  },
  
  recommendations: [String],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const DebtStrategy = mongoose.model<IDebtStrategy>("DebtStrategy", debtStrategySchema);
