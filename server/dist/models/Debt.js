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
exports.Debt = void 0;
// Mongoose schema for debts: balance, interest rate, minimum payment, and due schedule
const mongoose_1 = __importStar(require("mongoose"));
const debtSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
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
exports.Debt = mongoose_1.default.model("Debt", debtSchema);
