// Mongoose schema for Plaid bank connections: linked institution, accounts, and sync state
import mongoose, { Schema, Document } from "mongoose";

export interface IPlaidAccount {
  plaidAccountId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype: string;
  mask?: string;
  currentBalance?: number;
  availableBalance?: number;
  linkedAccountId?: mongoose.Types.ObjectId;
}

export interface IBankConnection extends Document {
  userId: mongoose.Types.ObjectId;
  institutionId: string;
  institutionName: string;
  institutionLogo?: string;
  plaidAccessToken: string;
  plaidItemId: string;
  plaidCursor?: string;
  accounts: IPlaidAccount[];
  status: "active" | "error" | "requires_reauth";
  errorCode?: string;
  lastSyncedAt?: Date;
  transactionsSynced: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlaidAccountSchema = new Schema<IPlaidAccount>({
  plaidAccountId: { type: String, required: true },
  name:           { type: String, required: true },
  officialName:   String,
  type:           { type: String, required: true },
  subtype:        { type: String, required: true },
  mask:           String,
  currentBalance:   Number,
  availableBalance: Number,
  linkedAccountId:  { type: Schema.Types.ObjectId, ref: "Account" },
}, { _id: false });

const BankConnectionSchema = new Schema<IBankConnection>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    institutionId:    { type: String, required: true },
    institutionName:  { type: String, required: true },
    institutionLogo:  String,
    plaidAccessToken: { type: String, required: true },
    plaidItemId:      { type: String, required: true, unique: true },
    plaidCursor:      String,
    accounts:         [PlaidAccountSchema],
    status:           { type: String, enum: ["active", "error", "requires_reauth"], default: "active" },
    errorCode:        String,
    lastSyncedAt:     Date,
    transactionsSynced: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const BankConnection = mongoose.model<IBankConnection>("BankConnection", BankConnectionSchema);
