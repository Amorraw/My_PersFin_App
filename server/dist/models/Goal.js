"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Goal = void 0;
// Mongoose schema for financial goals with target amount, date, and progress tracking
const mongoose_1 = __importDefault(require("mongoose"));
const goalSchema = new mongoose_1.default.Schema({
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
        enum: ['home', 'car', 'vacation', 'education', 'emergency-fund', 'investment', 'debt-payoff', 'other'],
        default: 'other',
    },
    targetAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    currentAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    targetDate: {
        type: Date,
        required: true,
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'paused'],
        default: 'active',
    },
    monthlyContribution: {
        type: Number,
        min: 0,
    },
    notes: String,
}, { timestamps: true });
exports.Goal = mongoose_1.default.model('Goal', goalSchema);
