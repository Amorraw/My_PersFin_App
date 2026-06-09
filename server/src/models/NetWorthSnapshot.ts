// Mongoose schema for point-in-time net worth snapshots: assets, liabilities, and breakdown
import mongoose from 'mongoose';

export interface INetWorthSnapshot extends mongoose.Document {
  userId: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  snapshotDate: Date;
  breakdown: {
    assets: {
      cash: number;
      investments: number;
      realEstate: number;
      otherAssets: number;
    };
    liabilities: {
      mortgages: number;
      creditCard: number;
      loans: number;
      otherLiabilities: number;
    };
  };
  createdAt: Date;
}

const netWorthSnapshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
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
  },
  { timestamps: true }
);

export const NetWorthSnapshot = mongoose.model<INetWorthSnapshot>('NetWorthSnapshot', netWorthSnapshotSchema);
