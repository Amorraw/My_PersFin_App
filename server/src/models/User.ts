// Mongoose schema for app users: credentials, profile, and province preference
import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  province?: string;
  /** SHA-256 hash of the password-reset token (the plaintext token is only ever emailed) */
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
  demoProfileIndex?: number;   // 1–10 when user has demo data loaded; undefined otherwise
  demoHistoryYears?: number;   // 3–7; years of history generated for the active demo profile
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  firstName: String,
  lastName: String,
  province: { type: String, default: "ON" },
  resetTokenHash: String,
  resetTokenExpires: Date,
  createdAt: { type: Date, default: Date.now },
  demoProfileIndex:  { type: Number, default: null },
  demoHistoryYears:  { type: Number, default: null },
});

export const User = mongoose.model<IUser>("User", userSchema);
