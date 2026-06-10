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
exports.RRSPAccount = void 0;
// Mongoose schema for RRSP accounts with contribution and withdrawal history sub-documents
const mongoose_1 = __importStar(require("mongoose"));
const rrspAccountSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    accountName: { type: String, required: true },
    institution: { type: String, default: "" },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "CAD" },
    notes: { type: String, default: "" },
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
            withholding: Number,
        },
    ],
    lifetimeContributionRoom: { type: Number, default: 0 },
    deductionLimit: { type: Number, default: 0 },
    annualContributionLimit: { type: Number, default: 31560 }, // 2024 limit
    currentYearUsed: { type: Number, default: 0 },
    isAccountOwner: { type: Boolean, default: true },
    spousalAccountId: mongoose_1.Schema.Types.ObjectId,
    investmentHoldings: [
        {
            symbol: String,
            quantity: Number,
            adjustedCostBase: Number,
            currentValue: Number,
        },
    ],
}, { timestamps: true });
exports.RRSPAccount = mongoose_1.default.model("RRSPAccount", rrspAccountSchema);
