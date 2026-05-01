import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  province?: string;
  resetToken?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  firstName: String,
  lastName: String,
  province: { type: String, default: "ON" },
  resetToken: String,
  resetTokenExpires: Date,
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>("User", userSchema);
