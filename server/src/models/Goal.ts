// Mongoose schema for financial goals with target amount, date, and progress tracking
import mongoose from 'mongoose';

export interface IGoal extends mongoose.Document {
  userId: string;
  name: string;
  description?: string;
  category: 'home' | 'car' | 'vacation' | 'education' | 'emergency-fund' | 'investment' | 'debt-payoff' | 'other';
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'paused';
  monthlyContribution?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

export const Goal = mongoose.model<IGoal>('Goal', goalSchema);
