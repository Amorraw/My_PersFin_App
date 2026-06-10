"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialPlan = void 0;
// Mongoose schema for long-term financial plans with goals, assumptions, and projections
const mongoose_1 = __importStar(require("mongoose"));
const financialPlanSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
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
exports.FinancialPlan = mongoose_1.default.model("FinancialPlan", financialPlanSchema);
