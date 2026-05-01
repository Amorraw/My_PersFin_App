import { Router, Request, Response } from "express";
import Notification from "../models/Notification";
import { runAlertEngine } from "../jobs/alertEngine";
import mongoose from "mongoose";

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  next();
}

function userId(req: Request): mongoose.Types.ObjectId {
  return (req.user as any)._id;
}

// GET /api/notifications — list non-dismissed notifications
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { category, unread } = req.query;
  const filter: any = { userId: userId(req), isDismissed: false };
  if (category) filter.category = category;
  if (unread === "true") filter.isRead = false;

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadCount = await Notification.countDocuments({ userId: userId(req), isDismissed: false, isRead: false });
  res.json({ notifications, unreadCount });
});

// PUT /api/notifications/:id/read
router.put("/:id/read", requireAuth, async (req: Request, res: Response) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: userId(req) },
    { isRead: true }
  );
  res.json({ ok: true });
});

// PUT /api/notifications/read-all
router.put("/read-all", requireAuth, async (req: Request, res: Response) => {
  await Notification.updateMany({ userId: userId(req), isDismissed: false }, { isRead: true });
  res.json({ ok: true });
});

// DELETE /api/notifications/:id — dismiss
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: userId(req) },
    { isDismissed: true }
  );
  res.json({ ok: true });
});

// DELETE /api/notifications — dismiss all
router.delete("/", requireAuth, async (req: Request, res: Response) => {
  await Notification.updateMany({ userId: userId(req) }, { isDismissed: true });
  res.json({ ok: true });
});

// POST /api/notifications/refresh — manually trigger alert engine
router.post("/refresh", requireAuth, async (req: Request, res: Response) => {
  await runAlertEngine(userId(req));
  const unreadCount = await Notification.countDocuments({
    userId: userId(req),
    isDismissed: false,
    isRead: false,
  });
  res.json({ ok: true, unreadCount });
});

export default router;
