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
exports.BankConnection = void 0;
// Mongoose schema for Plaid bank connections: linked institution, accounts, and sync state
const mongoose_1 = __importStar(require("mongoose"));
const PlaidAccountSchema = new mongoose_1.Schema({
    plaidAccountId: { type: String, required: true },
    name: { type: String, required: true },
    officialName: String,
    type: { type: String, required: true },
    subtype: { type: String, required: true },
    mask: String,
    currentBalance: Number,
    availableBalance: Number,
    linkedAccountId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Account" },
}, { _id: false });
const BankConnectionSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    institutionId: { type: String, required: true },
    institutionName: { type: String, required: true },
    institutionLogo: String,
    plaidAccessToken: { type: String, required: true },
    plaidItemId: { type: String, required: true, unique: true },
    plaidCursor: String,
    accounts: [PlaidAccountSchema],
    status: { type: String, enum: ["active", "error", "requires_reauth"], default: "active" },
    errorCode: String,
    lastSyncedAt: Date,
    transactionsSynced: { type: Number, default: 0 },
}, { timestamps: true });
exports.BankConnection = mongoose_1.default.model("BankConnection", BankConnectionSchema);
