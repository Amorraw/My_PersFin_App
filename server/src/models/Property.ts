// Mongoose schema for real estate properties with valuation, equity, and mortgage linkage
import mongoose, { Schema, Document } from "mongoose";

export interface IProperty extends Document {
  userId: mongoose.Types.ObjectId;
  nickname: string;
  type: "primary-residence" | "rental" | "vacation" | "commercial" | "land" | "other";
  street?: string;
  city: string;
  province: string;
  postalCode?: string;
  purchasePrice: number;
  purchaseDate: Date;
  currentEstimatedValue: number;
  lastValuationDate: Date;
  linkedMortgageDebtId?: mongoose.Types.ObjectId;
  annualPropertyTax?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const propertySchema = new Schema<IProperty>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    nickname: { type: String, required: true },
    type: {
      type: String,
      enum: ["primary-residence", "rental", "vacation", "commercial", "land", "other"],
      required: true,
    },
    street: String,
    city: { type: String, required: true },
    province: { type: String, required: true },
    postalCode: String,
    purchasePrice: { type: Number, required: true },
    purchaseDate: { type: Date, required: true },
    currentEstimatedValue: { type: Number, required: true },
    lastValuationDate: { type: Date, default: Date.now },
    linkedMortgageDebtId: { type: Schema.Types.ObjectId, ref: "Debt" },
    annualPropertyTax: Number,
    notes: String,
  },
  { timestamps: true }
);

export const Property = mongoose.model<IProperty>("Property", propertySchema);
