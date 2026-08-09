"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAID_ENV = exports.PLAID_SECRET = exports.PLAID_CLIENT_ID = exports.SESSION_SECRET = exports.PORT = exports.MONGO_URI = void 0;
// Loads environment variables and exports typed config constants for the app
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/persfin";
exports.PORT = parseInt(process.env.PORT || "3000", 10);
exports.SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production";
exports.PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
exports.PLAID_SECRET = process.env.PLAID_SECRET || "";
exports.PLAID_ENV = (process.env.PLAID_ENV || "sandbox");
