// AES-256-GCM helpers for encrypting sensitive tokens (e.g. Plaid access tokens) at rest
import crypto from "crypto";
import { ENCRYPTION_KEY } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Output format: base64(iv):base64(authTag):base64(ciphertext)
const ENCRYPTED_PATTERN = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// True if a stored value looks like ciphertext from encrypt() above, as opposed to a
// legacy plaintext Plaid access token (e.g. "access-sandbox-...") saved before encryption
// was added.
export function isEncrypted(value: string): boolean {
  return ENCRYPTED_PATTERN.test(value);
}

// One-way hash for lookup-only secrets (e.g. password reset tokens) that are never
// decrypted, only compared against an incoming value.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
