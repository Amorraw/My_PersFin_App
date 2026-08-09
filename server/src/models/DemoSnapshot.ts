import mongoose, { Schema, Document } from "mongoose";

export interface IDemoSnapshot extends Document {
  userId: mongoose.Types.ObjectId;
  profileIndex: number;
  savedAt: Date;
  accounts: any[];
  transactions: any[];
  budgets: any[];
  bills: any[];
  goals: any[];
  netWorthSnapshots: any[];
  debts: any[];
  properties: any[];
  recurringTransactions: any[];
  taxAccounts: any[];
  investments: any[];
  tfsaAccounts: any[];
  rrspAccounts: any[];
  fhsaAccounts: any[];
  respAccounts: any[];
}

const snapshotSchema = new Schema<IDemoSnapshot>(
  {
    userId:                { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    profileIndex:          { type: Number, required: true },
    savedAt:               { type: Date, default: Date.now },
    accounts:              Schema.Types.Mixed,
    transactions:          Schema.Types.Mixed,
    budgets:               Schema.Types.Mixed,
    bills:                 Schema.Types.Mixed,
    goals:                 Schema.Types.Mixed,
    netWorthSnapshots:     Schema.Types.Mixed,
    debts:                 Schema.Types.Mixed,
    properties:            Schema.Types.Mixed,
    recurringTransactions: Schema.Types.Mixed,
    taxAccounts:           Schema.Types.Mixed,
    investments:           Schema.Types.Mixed,
    tfsaAccounts:          Schema.Types.Mixed,
    rrspAccounts:          Schema.Types.Mixed,
    fhsaAccounts:          Schema.Types.Mixed,
    respAccounts:          Schema.Types.Mixed,
  },
  { strict: false }
);

export const DemoSnapshot = mongoose.model<IDemoSnapshot>("DemoSnapshot", snapshotSchema);
