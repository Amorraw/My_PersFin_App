"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetWorthSnapshot = void 0;
// Mongoose schema for point-in-time net worth snapshots: assets, liabilities, and breakdown
const mongoose_1 = __importDefault(require("mongoose"));
const netWorthSnapshotSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    totalAssets: {
        type: Number,
        required: true,
        min: 0,
    },
    totalLiabilities: {
        type: Number,
        default: 0,
        min: 0,
    },
    netWorth: {
        type: Number,
        required: true,
    },
    snapshotDate: {
        type: Date,
        default: Date.now,
    },
    breakdown: {
        assets: {
            cash: { type: Number, default: 0 },
            investments: { type: Number, default: 0 },
            realEstate: { type: Number, default: 0 },
            otherAssets: { type: Number, default: 0 },
        },
        liabilities: {
            mortgages: { type: Number, default: 0 },
            creditCard: { type: Number, default: 0 },
            loans: { type: Number, default: 0 },
            otherLiabilities: { type: Number, default: 0 },
        },
    },
}, { timestamps: true });
exports.NetWorthSnapshot = mongoose_1.default.model('NetWorthSnapshot', netWorthSnapshotSchema);
