// Mongoose schema for pre-seeded demo data snapshots used in onboarding mode
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
}

const snapshotSchema = new Schema<IDemoSnapshot>(
  {
    userId:            { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    profileIndex:      { type: Number, required: true },
    savedAt:           { type: Date, default: Date.now },
    accounts:          Schema.Types.Mixed,
    transactions:      Schema.Types.Mixed,
    budgets:           Schema.Types.Mixed,
    bills:             Schema.Types.Mixed,
    goals:             Schema.Types.Mixed,
    netWorthSnapshots: Schema.Types.Mixed,
  },
  { strict: false }
);

export const DemoSnapshot = mongoose.model<IDemoSnapshot>("DemoSnapshot", snapshotSchema);
