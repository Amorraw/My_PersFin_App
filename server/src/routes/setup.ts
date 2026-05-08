/**
 * One-time setup route — seed demo users into production DB.
 * Protected by SETUP_SECRET env var. Remove this file after use.
 *
 * Usage:
 *   curl -X POST https://persfin-app.onrender.com/api/setup/seed-demo \
 *        -H "Content-Type: application/json" \
 *        -d '{"secret":"<your SETUP_SECRET value>"}'
 */

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Transaction } from "../models/Transaction";

const router = Router();

router.post("/seed-demo", async (req: Request, res: Response) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.body.secret !== secret) {
    return res.status(403).json({ error: "Invalid or missing secret" });
  }

  try {
    // Dynamic import so this heavy module isn't loaded at startup
    const { seedProfile, PROFILES } = await import("../scripts/seedDemoUsers");

    // Re-create the partial-filter index (idempotent)
    try {
      await Transaction.collection.dropIndex("userId_1_plaidTransactionId_1");
    } catch { /* index may not exist */ }
    await Transaction.collection.createIndex(
      { userId: 1, plaidTransactionId: 1 },
      { unique: true, partialFilterExpression: { plaidTransactionId: { $type: "string" } } }
    );

    const passwordHash = await bcrypt.hash("Demo1234!", 10);
    const results: string[] = [];

    for (const profile of PROFILES) {
      await seedProfile(profile, passwordHash);
      results.push(profile.email);
    }

    return res.json({
      ok: true,
      message: `Seeded ${results.length} demo users`,
      emails: results,
      password: "Demo1234!",
    });
  } catch (err: any) {
    console.error("Seed error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
