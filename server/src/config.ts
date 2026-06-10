// Loads environment variables and exports typed config constants for the app
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

export const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/persfin";
export const PORT = parseInt(process.env.PORT || "3000", 10);

// Refuse to start in production with the default session secret — session cookies
// are signed with this value, so a known/default secret lets attackers forge sessions.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set in production");
}
export const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production";

export const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
export const PLAID_SECRET    = process.env.PLAID_SECRET    || "";
export const PLAID_ENV       = (process.env.PLAID_ENV || "sandbox") as "sandbox" | "development" | "production";

// 32-byte AES-256-GCM key used to encrypt Plaid access tokens at rest.
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
if (process.env.NODE_ENV === "production" && !process.env.ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable must be set in production");
}
const rawEncryptionKey = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, "base64")
  : crypto.scryptSync("dev-only-insecure-key", "persfin-dev-salt", 32);

if (rawEncryptionKey.length !== 32) {
  throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)");
}
export const ENCRYPTION_KEY = rawEncryptionKey;
