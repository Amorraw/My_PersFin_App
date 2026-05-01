import mongoose, { Schema, Document } from "mongoose";

export interface IGIC extends Document {
  userId: mongoose.Types.ObjectId;
  issuer: string;
  accountType: "TFSA" | "RRSP" | "FHSA" | "RRIF" | "non-registered" | "RDSP";
  principal: number;
  interestRate: number; // annual %
  term: number; // months
  purchaseDate: Date;
  maturityDate: Date;
  maturityValue: number;
  isCompound: boolean;
  compoundFrequency: "annually" | "semi-annually" | "quarterly" | "monthly";
  isCashedOut: boolean;
  cashOutDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const gicSchema = new Schema<IGIC>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    issuer: { type: String, required: true },
    accountType: {
      type: String,
      enum: ["TFSA", "RRSP", "FHSA", "RRIF", "non-registered", "RDSP"],
      required: true,
    },
    principal: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    term: { type: Number, required: true },
    purchaseDate: { type: Date, required: true },
    maturityDate: { type: Date, required: true },
    maturityValue: { type: Number, required: true },
    isCompound: { type: Boolean, default: false },
    compoundFrequency: {
      type: String,
      enum: ["annually", "semi-annually", "quarterly", "monthly"],
      default: "annually",
    },
    isCashedOut: { type: Boolean, default: false },
    cashOutDate: Date,
    notes: String,
  },
  { timestamps: true }
);

export const GIC = mongoose.model<IGIC>("GIC", gicSchema);
