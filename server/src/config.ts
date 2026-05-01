import dotenv from "dotenv";

dotenv.config();

export const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/persfin";
export const PORT = parseInt(process.env.PORT || "3000", 10);
export const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production";

export const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
export const PLAID_SECRET    = process.env.PLAID_SECRET    || "";
export const PLAID_ENV       = (process.env.PLAID_ENV || "sandbox") as "sandbox" | "development" | "production";
