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
exports.DebtStrategy = void 0;
// Mongoose schema for saved debt payoff strategies with avalanche/snowball allocations
const mongoose_1 = __importStar(require("mongoose"));
const debtStrategySchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    strategyType: {
        type: String,
        enum: ["avalanche", "snowball", "hybrid", "consolidation", "mortgage-acceleration"],
        required: true,
    },
    debtIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "Debt" }],
    monthlyBudget: { type: Number, required: true, default: 0 },
    priorityWeighting: { type: Number, default: 50 }, // 50 = balanced
    targetPayoffMonths: Number,
    totalDebt: { type: Number, default: 0 },
    totalInterest: { type: Number, default: 0 },
    payoffMonths: { type: Number, default: 0 },
    monthlyPayment: { type: Number, default: 0 },
    priorityOrder: [
        {
            debtId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Debt" },
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
exports.DebtStrategy = mongoose_1.default.model("DebtStrategy", debtStrategySchema);
