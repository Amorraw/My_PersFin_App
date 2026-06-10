/**
 * One-time migration: encrypts any BankConnection.plaidAccessToken values that were
 * saved before AES-256-GCM encryption was added (legacy plaintext "access-..." tokens).
 * Safe to re-run — already-encrypted tokens are left untouched.
 * Run: npm run encrypt:plaid-tokens
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { BankConnection } from "../models/BankConnection";
import { encrypt, isEncrypted } from "../utils/crypto";

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/persfin");
  console.log("Connected\n");

  const connections = await BankConnection.find({});
  let migrated = 0;

  for (const conn of connections) {
    if (isEncrypted(conn.plaidAccessToken)) continue;
    conn.plaidAccessToken = encrypt(conn.plaidAccessToken);
    await conn.save();
    migrated++;
    console.log(`  encrypted token for connection ${conn._id} (${conn.institutionName})`);
  }

  console.log(`\nDone. Encrypted ${migrated} of ${connections.length} connection(s).`);
}

main().catch(console.error).finally(() => mongoose.disconnect());
