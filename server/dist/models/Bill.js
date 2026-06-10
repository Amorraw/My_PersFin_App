"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bill = void 0;
// Mongoose schema for recurring bills with frequency, due date, and autopay flag
const mongoose_1 = __importDefault(require("mongoose"));
const billSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    description: String,
    category: {
        type: String,
        enum: ['utilities', 'subscription', 'insurance', 'rent-mortgage', 'phone', 'internet', 'transportation', 'other'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    frequency: {
        type: String,
        enum: ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'],
        default: 'monthly',
    },
    dueDate: {
        type: Number,
        required: true,
        min: 1,
        max: 31,
    },
    paymentMethod: {
        type: String,
        enum: ['credit-card', 'debit', 'bank-transfer', 'cash', 'other'],
    },
    accountId: mongoose_1.default.Schema.Types.ObjectId,
    status: {
        type: String,
        enum: ['active', 'paused', 'cancelled'],
        default: 'active',
    },
    reminderDaysBefore: {
        type: Number,
        default: 3,
        min: 0,
    },
    isAutoPay: {
        type: Boolean,
        default: false,
    },
    notes: String,
}, { timestamps: true });
exports.Bill = mongoose_1.default.model('Bill', billSchema);
