/**
 * Removes all 10 demo users and every document tied to them.
 * Run: npm run clear:demo
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { User } from "../models/User";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Bill } from "../models/Bill";
import { Goal } from "../models/Goal";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";

const DEMO_EMAILS = Array.from({ length: 10 }, (_, i) => `user_test${i + 1}@demo.com`);

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/persfin");
  console.log("Connected\n");

  for (const email of DEMO_EMAILS) {
    const user = await User.findOne({ email });
    if (!user) { console.log(`  ⏭  ${email} not found`); continue; }
    const uid = user._id;
    const [txns, accts, budgets, bills, goals, snapshots] = await Promise.all([
      Transaction.deleteMany({ userId: uid }),
      Account.deleteMany({ userId: uid }),
      Budget.deleteMany({ userId: uid }),
      Bill.deleteMany({ userId: uid }),
      Goal.deleteMany({ userId: uid }),
      NetWorthSnapshot.deleteMany({ userId: uid }),
    ]);
    await User.deleteOne({ _id: uid });
    console.log(`  ✓  ${email} removed — ${txns.deletedCount} txns, ${accts.deletedCount} accounts, ${budgets.deletedCount} budgets, ${bills.deletedCount} bills, ${goals.deletedCount} goals, ${snapshots.deletedCount} snapshots`);
  }

  console.log("\nAll demo data cleared.");
}

main().catch(console.error).finally(() => mongoose.disconnect());
