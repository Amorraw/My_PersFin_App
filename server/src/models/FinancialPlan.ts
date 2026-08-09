// Mongoose schema for long-term financial plans with goals, assumptions, and projections
import mongoose, { Document, Schema } from "mongoose";

export interface IFinancialPlan extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  currentAge: number;
  retirementAge: number;
  expectedLifespan: number;
  currentIncome: number;
  currentSavings: number;
  monthlyContribution: number;
  expectedReturnRate: number;
  inflationRate: number;
  retirementIncome: number; // desired annual retirement income
  emergencyFundMonths: number; // months of expenses
  currentDebt: number;
  projections: {
    age: number;
    year: number;
    netWorth: number;
    savings: number;
    income: number;
    debt: number;
  }[];
  retirementProjection: {
    retirementAge: number;
    projectedNetWorth: number;
    sustainableWithdrawalRate: number;
    yearsOfRetirement: number;
    successProbability: number;
  };
  emergencyFundTarget: number;
  emergencyFundStatus: "underfunded" | "adequate" | "well-funded";
  debtPayoffPlan: {
    debtFreeDate: string;
    totalInterestPaid: number;
    monthlyPayment: number;
  };
  recommendations: string[];
  createdAt: Date;
  updatedAt: Date;
}

const financialPlanSchema = new Schema<IFinancialPlan>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  currentAge: { type: Number, required: true },
  retirementAge: { type: Number, required: true },
  expectedLifespan: { type: Number, required: true },
  currentIncome: { type: Number, required: true },
  currentSavings: { type: Number, required: true },
  monthlyContribution: { type: Number, required: true },
  expectedReturnRate: { type: Number, required: true },
  inflationRate: { type: Number, default: 2.5 },
  retirementIncome: { type: Number, required: true },
  emergencyFundMonths: { type: Number, default: 6 },
  currentDebt: { type: Number, default: 0 },
  projections: [
    {
      age: Number,
      year: Number,
      netWorth: Number,
      savings: Number,
      income: Number,
      debt: Number,
    },
  ],
  retirementProjection: {
    retirementAge: Number,
    projectedNetWorth: Number,
    sustainableWithdrawalRate: Number,
    yearsOfRetirement: Number,
    successProbability: Number,
  },
  emergencyFundTarget: Number,
  emergencyFundStatus: {
    type: String,
    enum: ["underfunded", "adequate", "well-funded"],
  },
  debtPayoffPlan: {
    debtFreeDate: String,
    totalInterestPaid: Number,
    monthlyPayment: Number,
  },
  recommendations: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const FinancialPlan = mongoose.model("FinancialPlan", financialPlanSchema);
