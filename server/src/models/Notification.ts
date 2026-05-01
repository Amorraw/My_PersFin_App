import mongoose, { Schema, Document } from "mongoose";

export type AlertCategory =
  | "rrsp"
  | "tfsa"
  | "bill"
  | "budget"
  | "net_worth"
  | "spending"
  | "automation";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  category: AlertCategory;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  isRead: boolean;
  isDismissed: boolean;
  relatedId?: string;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: ["rrsp", "tfsa", "bill", "budget", "net_worth", "spending", "automation"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    isRead: { type: Boolean, default: false },
    isDismissed: { type: Boolean, default: false },
    relatedId: { type: String },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isDismissed: 1, createdAt: -1 });

export default mongoose.model<INotification>("Notification", NotificationSchema);
