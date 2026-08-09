// Mongoose schema for recurring bills with frequency, due date, and autopay flag
import mongoose from 'mongoose';

export interface IBill extends mongoose.Document {
  userId: string;
  name: string;
  description?: string;
  category: 'utilities' | 'subscription' | 'insurance' | 'rent-mortgage' | 'phone' | 'internet' | 'transportation' | 'other';
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  dueDate: number; // Day of month (1-31)
  paymentMethod?: 'credit-card' | 'debit' | 'bank-transfer' | 'cash' | 'other';
  accountId?: string;
  status: 'active' | 'paused' | 'cancelled';
  reminderDaysBefore: number; // Send reminder N days before due date
  isAutoPay: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const billSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
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
    accountId: mongoose.Schema.Types.ObjectId,
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
  },
  { timestamps: true }
);

export const Bill = mongoose.model<IBill>('Bill', billSchema);
