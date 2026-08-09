/**
 * Demo data seeder — creates 10 Canadian financial profiles with 1-7 years of
 * history (pass `years` in SeedOpts; defaults to 3), covering accounts,
 * transactions, budgets, bills, goals, debts, properties, recurring
 * transactions, investments, and TFSA/RRSP/FHSA/RESP tracker accounts.
 * Run: npm run seed:demo
 *
 * All demo accounts use password: Demo1234!
 * Emails: user_test1@demo.com … user_test10@demo.com
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
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
import { Debt } from "../models/Debt";
import { Property } from "../models/Property";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { TaxAccount } from "../models/TaxAccount";
import { Investment } from "../models/Investment";
import { TFSAAccount } from "../models/TFSAAccount";
import { RRSPAccount } from "../models/RRSPAccount";
import { FHSAAccount } from "../models/FHSAAccount";
import { RESPAccount } from "../models/RESPAccount";
import { DEBT_DEFAULTS, amortizedPayment } from "../routes/debts";
import { getRiskProfile, getETFRecommendations } from "../utils/investmentAdvisor";

// ── Shared account-type sets ──────────────────────────────────────────────────

const LIABILITY_TYPES = new Set(["credit-card", "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan"]);
const TAX_WRAPPER_TYPES = new Set(["tfsa", "rrsp", "investment"]);

const PROVINCE_CITY: Record<string, string> = {
  ON: "Toronto", BC: "Vancouver", AB: "Calgary", QC: "Montreal", NS: "Halifax",
  MB: "Winnipeg", SK: "Regina", NB: "Saint John", NL: "St. John's",
  PE: "Charlottetown", YT: "Whitehorse", NT: "Yellowknife", NU: "Iqaluit",
};

// Illustrative CAD unit prices + assumed average annual return, per ETF symbol
// (matches the catalog in utils/investmentAdvisor.ts getETFRecommendations).
const ETF_MARKET: Record<string, { price: number; annualReturn: number }> = {
  VFV: { price: 145, annualReturn: 0.09 },
  VCN: { price: 45, annualReturn: 0.07 },
  VEF: { price: 28, annualReturn: 0.07 },
  VAB: { price: 25, annualReturn: 0.03 },
  VSB: { price: 24, annualReturn: 0.025 },
  VRE: { price: 18, annualReturn: 0.05 },
  XGB: { price: 22, annualReturn: 0.04 },
  VSP: { price: 50, annualReturn: 0.02 },
};

// Risk profile per persona (profileIndex 1-10) — used for ETF allocation on
// any tfsa/rrsp/investment account. Irrelevant for profiles with no such
// accounts (1, 2) but harmless to define.
const RISK_BY_PROFILE_INDEX: Array<"conservative" | "moderate" | "aggressive"> = [
  "conservative", "conservative", "moderate", "aggressive", "moderate",
  "moderate", "aggressive", "moderate", "conservative", "moderate",
];

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// _rng and _now are set by seedProfile before each run so that "Reset" can use
// a deterministic seed (same data every time) while "Regenerate" uses Math.random.

let _rng: () => number = Math.random;
let _now: Date = new Date();

function rnd(min: number, max: number): number {
  return parseFloat((_rng() * (max - min) + min).toFixed(2));
}
function rndInt(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(_rng() * arr.length)];
}
function txnDate(monthsAgo: number, day: number): Date {
  const d = new Date(_now);
  d.setDate(1);
  d.setHours(rndInt(8, 20), rndInt(0, 59), 0, 0);
  d.setMonth(d.getMonth() - monthsAgo);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}
/** Returns all bi-weekly pay dates going back `months` months. */
function payDates(months: number): Date[] {
  const anchor = new Date(_now);
  anchor.setMonth(anchor.getMonth() - months);
  anchor.setDate(1);
  const dates: Date[] = [];
  const cur = new Date(anchor);
  while (cur <= _now) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 14);
  }
  return dates;
}

// ── Canadian content ──────────────────────────────────────────────────────────

const GROCERIES = ["Loblaw", "Metro", "No Frills", "Sobeys", "FreshCo", "Food Basics", "Real Canadian Superstore", "IGA", "Maxi", "Walmart Supercenter"];
const GAS = ["Petro-Canada", "Esso", "Shell Canada", "Pioneer", "Ultramar", "Fas Gas"];
const RESTAURANTS = ["Tim Hortons", "A&W Canada", "Harvey's", "Swiss Chalet", "Boston Pizza", "Montana's", "Kelsey's", "St-Hubert", "Mary Brown's Chicken", "Popeyes Canada", "Subway Canada"];
const COFFEE = ["Tim Hortons", "Second Cup", "Starbucks", "Williams Coffee Pub"];
const STREAMING = ["Netflix", "Crave TV", "Disney+", "Amazon Prime Video", "Spotify", "Apple TV+"];
const PHARMACIES = ["Shoppers Drug Mart", "Rexall", "Jean Coutu", "Pharmaprix"];
const CLOTHING = ["Winners", "H&M Canada", "Roots", "Banana Republic", "Reitmans", "Simons", "Hudson's Bay"];

// ── Profile types ─────────────────────────────────────────────────────────────

interface AcctDef {
  key: string;
  name: string;
  type: string;
  institution: string;
  openingBalance: number; // positive for both assets and liabilities
}
interface SpendRule {
  category: string;
  descriptions: string[];
  min: number;
  max: number;
  perMonth: number;    // average occurrences per month
  accountKey: string;
}
interface LiabilityPmt {
  accountKey: string;
  monthly: number;
  desc: string;
  sourceKey: string;
}
interface DemoProfile {
  email: string;
  firstName: string;
  lastName: string;
  province: string;
  accounts: AcctDef[];
  netPayBiweekly: number;
  payDesc: string;
  payAccountKey: string;
  spending: SpendRule[];
  liabilityPayments: LiabilityPmt[];
  budgets: Array<{ category: string; amount: number }>;
  bills: Array<{ name: string; category: string; amount: number; dueDate: number }>;
  goals: Array<{ name: string; category: string; target: number; current: number; months: number; priority: string }>;
  savingsTransfers?: Array<{ category: string; desc: string; amount: number; accountKey: string; sourceKey: string }>;
  /** First Home Savings Account — only set for pre-homeownership personas actively saving for a down payment. */
  hasFHSA?: boolean;
  /** RESP beneficiary — only set when the profile's existing accounts/goals already reference a named child/RESP. */
  respBeneficiary?: { name: string; birthYear: number };
}

// ── 10 Profiles ───────────────────────────────────────────────────────────────

export const PROFILES: DemoProfile[] = [

  // ── 1. The Overwhelmed Graduate ─────────────────────────────────────────────
  {
    email: "user_test1@demo.com",
    firstName: "Taylor",
    lastName: "Morrison",
    province: "ON",
    accounts: [
      { key: "chq",  name: "TD Everyday Chequing",      type: "chequing",      institution: "TD (TD Canada Trust)", openingBalance: 820 },
      { key: "cc1",  name: "PC Financial Mastercard",    type: "credit-card",   institution: "PC Financial",         openingBalance: 4200 },
      { key: "sol",  name: "Scotiabank Student LOC",     type: "line-of-credit",institution: "Scotiabank",            openingBalance: 8500 },
      { key: "stl",  name: "NSLSC Student Loan",         type: "student-loan",  institution: "Other (specify)",       openingBalance: 29800 },
    ],
    netPayBiweekly: 1090, payDesc: "Payroll — Indigo Books & Music", payAccountKey: "chq",
    spending: [
      { category: "Rent",        descriptions: ["Interac e-Transfer – Landlord"],   min: 1450, max: 1450, perMonth: 1,   accountKey: "chq" },
      { category: "Groceries",   descriptions: GROCERIES,                            min: 75,   max: 110,  perMonth: 4,   accountKey: "cc1" },
      { category: "Transit",     descriptions: ["Presto Card Top-Up"],               min: 156,  max: 156,  perMonth: 1,   accountKey: "chq" },
      { category: "Restaurants", descriptions: RESTAURANTS,                          min: 12,   max: 45,   perMonth: 6,   accountKey: "cc1" },
      { category: "Coffee",      descriptions: COFFEE,                               min: 4,    max: 12,   perMonth: 10,  accountKey: "cc1" },
      { category: "Phone",       descriptions: ["Koodo Mobile"],                     min: 55,   max: 55,   perMonth: 1,   accountKey: "cc1" },
      { category: "Streaming",   descriptions: STREAMING,                            min: 14,   max: 22,   perMonth: 2,   accountKey: "cc1" },
      { category: "Shopping",    descriptions: ["Amazon.ca", "Dollarama"],           min: 20,   max: 80,   perMonth: 1.5, accountKey: "cc1" },
      { category: "Healthcare",  descriptions: PHARMACIES,                           min: 15,   max: 55,   perMonth: 0.7, accountKey: "cc1" },
    ],
    liabilityPayments: [
      { accountKey: "cc1", monthly: 135, desc: "PC Financial Min. Payment",    sourceKey: "chq" },
      { accountKey: "sol", monthly: 80,  desc: "Student Line Interest Payment", sourceKey: "chq" },
      { accountKey: "stl", monthly: 350, desc: "NSLSC Loan Payment",            sourceKey: "chq" },
    ],
    budgets: [
      { category: "Rent", amount: 1450 },
      { category: "Groceries", amount: 350 },
      { category: "Restaurants", amount: 200 },
      { category: "Transit", amount: 160 },
      { category: "Shopping", amount: 100 },
    ],
    bills: [
      { name: "Presto Monthly Pass", category: "transportation", amount: 156, dueDate: 1 },
      { name: "Koodo Mobile",        category: "phone",          amount: 55,  dueDate: 15 },
      { name: "Netflix",             category: "subscription",   amount: 18,  dueDate: 8 },
    ],
    goals: [
      { name: "Emergency Fund",       category: "emergency-fund", target: 3000,  current: 0,   months: 18, priority: "high" },
      { name: "Pay Off Credit Card",  category: "debt-payoff",    target: 4500,  current: 300, months: 24, priority: "high" },
    ],
  },

  // ── 2. The Over-Leveraged ────────────────────────────────────────────────────
  {
    email: "user_test2@demo.com",
    firstName: "Marcus",
    lastName: "Williams",
    province: "ON",
    accounts: [
      { key: "chq",  name: "BMO Performance Chequing",   type: "chequing",    institution: "BMO (Bank of Montreal)", openingBalance: 1200 },
      { key: "cc1",  name: "BMO World Elite Mastercard",  type: "credit-card", institution: "BMO (Bank of Montreal)", openingBalance: 8900 },
      { key: "cc2",  name: "Scotiabank Visa Infinite",    type: "credit-card", institution: "Scotiabank",             openingBalance: 6200 },
      { key: "auto", name: "Hyundai Financial Auto Loan", type: "auto-loan",   institution: "Other (specify)",        openingBalance: 21500 },
    ],
    netPayBiweekly: 1620, payDesc: "Payroll — Amazon Canada", payAccountKey: "chq",
    spending: [
      { category: "Rent",        descriptions: ["Interac e-Transfer – Landlord"],                  min: 2200, max: 2200, perMonth: 1,   accountKey: "chq" },
      { category: "Groceries",   descriptions: GROCERIES,                                           min: 130,  max: 200,  perMonth: 4,   accountKey: "cc1" },
      { category: "Gas",         descriptions: GAS,                                                 min: 70,   max: 120,  perMonth: 3,   accountKey: "cc1" },
      { category: "Restaurants", descriptions: RESTAURANTS,                                         min: 35,   max: 95,   perMonth: 8,   accountKey: "cc1" },
      { category: "Coffee",      descriptions: COFFEE,                                              min: 5,    max: 15,   perMonth: 8,   accountKey: "cc1" },
      { category: "Phone",       descriptions: ["Rogers Infinite Plan"],                            min: 95,   max: 95,   perMonth: 1,   accountKey: "cc2" },
      { category: "Internet",    descriptions: ["Rogers Ignite Internet"],                          min: 85,   max: 85,   perMonth: 1,   accountKey: "chq" },
      { category: "Shopping",    descriptions: [...CLOTHING, "Amazon.ca", "Best Buy Canada"],       min: 60,   max: 280,  perMonth: 3,   accountKey: "cc2" },
      { category: "Entertainment",descriptions: ["Cineplex", "Ticketmaster CA", ...STREAMING],     min: 20,   max: 120,  perMonth: 2,   accountKey: "cc2" },
      { category: "Insurance",   descriptions: ["Intact Auto Insurance"],                           min: 210,  max: 210,  perMonth: 1,   accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "cc1", monthly: 250, desc: "BMO Mastercard Payment",   sourceKey: "chq" },
      { accountKey: "cc2", monthly: 175, desc: "Scotiabank Visa Payment",   sourceKey: "chq" },
      { accountKey: "auto", monthly: 485, desc: "Hyundai Auto Loan Payment", sourceKey: "chq" },
    ],
    budgets: [
      { category: "Rent", amount: 2200 },
      { category: "Groceries", amount: 700 },
      { category: "Restaurants", amount: 400 },
      { category: "Gas", amount: 300 },
      { category: "Shopping", amount: 300 },
    ],
    bills: [
      { name: "Rogers Infinite",   category: "phone",          amount: 95,  dueDate: 5 },
      { name: "Rogers Internet",   category: "internet",       amount: 85,  dueDate: 5 },
      { name: "Intact Auto Ins.",  category: "insurance",      amount: 210, dueDate: 20 },
    ],
    goals: [
      { name: "Pay Off BMO Card",  category: "debt-payoff", target: 9000, current: 1000, months: 30, priority: "high" },
      { name: "Emergency Fund",    category: "emergency-fund", target: 5000, current: 0, months: 24, priority: "medium" },
    ],
  },

  // ── 3. The Single Parent Surviving ──────────────────────────────────────────
  {
    email: "user_test3@demo.com",
    firstName: "Jennifer",
    lastName: "Nguyen",
    province: "BC",
    accounts: [
      { key: "chq",  name: "RBC Day to Day Chequing",    type: "chequing",    institution: "RBC (Royal Bank)", openingBalance: 4200 },
      { key: "sav",  name: "RBC High Interest eSavings",  type: "savings",     institution: "RBC (Royal Bank)", openingBalance: 6800 },
      { key: "cc1",  name: "RBC Avion Visa",              type: "credit-card", institution: "RBC (Royal Bank)", openingBalance: 2100 },
      { key: "tfsa", name: "EQ Bank TFSA Savings",        type: "tfsa",        institution: "EQ Bank",          openingBalance: 19500 },
      { key: "resp", name: "TD RESP",                     type: "investment",  institution: "TD (TD Canada Trust)", openingBalance: 11200 },
      { key: "mtg",  name: "CMHC Insured Mortgage",       type: "mortgage",    institution: "RBC (Royal Bank)", openingBalance: 492000 },
    ],
    netPayBiweekly: 1950, payDesc: "Payroll — BC Children's Hospital Foundation", payAccountKey: "chq",
    spending: [
      { category: "Mortgage",    descriptions: ["RBC Mortgage Payment"],               min: 2450, max: 2450, perMonth: 1, accountKey: "chq" },
      { category: "Daycare",     descriptions: ["Sunshine Daycare Centre", "Kids First Childcare"], min: 1200, max: 1200, perMonth: 1, accountKey: "chq" },
      { category: "Groceries",   descriptions: GROCERIES,                              min: 100,  max: 160,  perMonth: 4, accountKey: "cc1" },
      { category: "Gas",         descriptions: GAS,                                    min: 55,   max: 90,   perMonth: 2, accountKey: "cc1" },
      { category: "Restaurants", descriptions: RESTAURANTS,                            min: 25,   max: 70,   perMonth: 4, accountKey: "cc1" },
      { category: "Phone",       descriptions: ["Bell Mobility"],                      min: 85,   max: 85,   perMonth: 1, accountKey: "chq" },
      { category: "Internet",    descriptions: ["Shaw Internet"],                      min: 95,   max: 95,   perMonth: 1, accountKey: "chq" },
      { category: "Insurance",   descriptions: ["BCAA Home & Auto Insurance"],         min: 220,  max: 220,  perMonth: 1, accountKey: "chq" },
      { category: "Kids Activities", descriptions: ["Hockey Registration", "Soccer Club", "Swimming Lessons"], min: 80, max: 200, perMonth: 0.8, accountKey: "chq" },
      { category: "Healthcare",  descriptions: PHARMACIES,                             min: 20,   max: 80,   perMonth: 1, accountKey: "cc1" },
    ],
    liabilityPayments: [
      { accountKey: "cc1", monthly: 400, desc: "RBC Visa Payment",    sourceKey: "chq" },
      { accountKey: "mtg", monthly: 2450, desc: "RBC Mortgage Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "Savings Transfer", desc: "Transfer to EQ TFSA",  amount: 300, accountKey: "sav",  sourceKey: "chq" },
      { category: "RESP Contribution",desc: "TD RESP Contribution",  amount: 200, accountKey: "resp", sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 600 },
      { category: "Restaurants", amount: 280 },
      { category: "Gas", amount: 180 },
      { category: "Healthcare", amount: 100 },
      { category: "Kids Activities", amount: 200 },
    ],
    bills: [
      { name: "Bell Mobility",          category: "phone",          amount: 85,  dueDate: 10 },
      { name: "Shaw Internet",          category: "internet",       amount: 95,  dueDate: 15 },
      { name: "BCAA Home & Auto Ins.",  category: "insurance",      amount: 220, dueDate: 1 },
    ],
    goals: [
      { name: "RESP for Emma", category: "education", target: 50000, current: 11200, months: 120, priority: "high" },
      { name: "Emergency Fund 3 Months", category: "emergency-fund", target: 12000, current: 6800, months: 18, priority: "high" },
      { name: "Vacation to Disneyland", category: "vacation", target: 4000, current: 500, months: 12, priority: "medium" },
    ],
    respBeneficiary: { name: "Emma", birthYear: new Date().getFullYear() - 8 },
  },

  // ── 4. The Young Professional Building Wealth ─────────────────────────────
  {
    email: "user_test4@demo.com",
    firstName: "Ethan",
    lastName: "Park",
    province: "ON",
    accounts: [
      { key: "chq",  name: "Tangerine Chequing",          type: "chequing",  institution: "Tangerine",      openingBalance: 6800 },
      { key: "sav",  name: "Tangerine Savings",            type: "savings",   institution: "Tangerine",      openingBalance: 14500 },
      { key: "tfsa", name: "Wealthsimple TFSA",            type: "tfsa",      institution: "Wealthsimple Cash", openingBalance: 32000 },
      { key: "rrsp", name: "TD Waterhouse RRSP",           type: "rrsp",      institution: "TD (TD Canada Trust)", openingBalance: 18500 },
      { key: "auto", name: "Toyota Financial Auto Loan",   type: "auto-loan", institution: "Other (specify)", openingBalance: 14200 },
    ],
    netPayBiweekly: 2385, payDesc: "Payroll — Shopify Inc.", payAccountKey: "chq",
    spending: [
      { category: "Rent",        descriptions: ["Interac e-Transfer – Property Mgmt"],  min: 1950, max: 1950, perMonth: 1, accountKey: "chq" },
      { category: "Groceries",   descriptions: GROCERIES,                                min: 90,   max: 130,  perMonth: 3, accountKey: "chq" },
      { category: "Gas",         descriptions: GAS,                                      min: 50,   max: 90,   perMonth: 2, accountKey: "chq" },
      { category: "Restaurants", descriptions: RESTAURANTS,                              min: 25,   max: 75,   perMonth: 5, accountKey: "chq" },
      { category: "Coffee",      descriptions: COFFEE,                                   min: 5,    max: 15,   perMonth: 6, accountKey: "chq" },
      { category: "Phone",       descriptions: ["Fido Mobile"],                          min: 55,   max: 55,   perMonth: 1, accountKey: "chq" },
      { category: "Internet",    descriptions: ["Bell Fibe Internet"],                   min: 65,   max: 65,   perMonth: 1, accountKey: "chq" },
      { category: "Fitness",     descriptions: ["GoodLife Fitness"],                     min: 50,   max: 50,   perMonth: 1, accountKey: "chq" },
      { category: "Streaming",   descriptions: STREAMING,                                min: 14,   max: 45,   perMonth: 3, accountKey: "chq" },
      { category: "Shopping",    descriptions: [...CLOTHING, "Amazon.ca"],               min: 50,   max: 200,  perMonth: 1.5, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "auto", monthly: 380, desc: "Toyota Financing Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "TFSA Contribution",  desc: "Wealthsimple TFSA Deposit",  amount: 500, accountKey: "tfsa", sourceKey: "chq" },
      { category: "RRSP Contribution",  desc: "TD RRSP Contribution",        amount: 400, accountKey: "rrsp", sourceKey: "chq" },
      { category: "Savings Transfer",   desc: "Transfer to Savings",         amount: 300, accountKey: "sav",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Rent", amount: 1950 },
      { category: "Groceries", amount: 400 },
      { category: "Restaurants", amount: 350 },
      { category: "Gas", amount: 175 },
      { category: "Shopping", amount: 200 },
    ],
    bills: [
      { name: "Fido Mobile",      category: "phone",        amount: 55, dueDate: 12 },
      { name: "Bell Fibe",        category: "internet",     amount: 65, dueDate: 18 },
      { name: "GoodLife Fitness", category: "other",        amount: 50, dueDate: 1 },
    ],
    goals: [
      { name: "TFSA Max ($95K)",     category: "investment",     target: 95000, current: 32000, months: 36, priority: "high" },
      { name: "Down Payment Fund",   category: "home",           target: 80000, current: 14500, months: 36, priority: "high" },
      { name: "Pay Off Car Loan",    category: "debt-payoff",    target: 14200, current: 5000,  months: 20, priority: "medium" },
    ],
    hasFHSA: true,
  },

  // ── 5. The Average Canadian Family ──────────────────────────────────────────
  {
    email: "user_test5@demo.com",
    firstName: "Ana",
    lastName: "Garcia",
    province: "AB",
    accounts: [
      { key: "chq",  name: "Scotiabank Momentum Chequing", type: "chequing",    institution: "Scotiabank",     openingBalance: 3500 },
      { key: "sav",  name: "Scotiabank Savings Accelerator",type: "savings",     institution: "Scotiabank",     openingBalance: 9800 },
      { key: "tfsa", name: "Scotiabank iTrade TFSA",        type: "tfsa",        institution: "Scotiabank",     openingBalance: 28500 },
      { key: "rrsp", name: "Scotiabank RRSP",               type: "rrsp",        institution: "Scotiabank",     openingBalance: 62000 },
      { key: "cc1",  name: "RBC Cashback Visa",             type: "credit-card", institution: "RBC (Royal Bank)", openingBalance: 1800 },
      { key: "auto", name: "ATB Auto Loan",                 type: "auto-loan",   institution: "ATB Financial",   openingBalance: 12000 },
      { key: "mtg",  name: "First Calgary Mortgage",        type: "mortgage",    institution: "Other (specify)", openingBalance: 315000 },
    ],
    netPayBiweekly: 2270, payDesc: "Payroll — City of Calgary", payAccountKey: "chq",
    spending: [
      { category: "Groceries",   descriptions: GROCERIES,                                      min: 120,  max: 180,  perMonth: 4,   accountKey: "cc1" },
      { category: "Gas",         descriptions: GAS,                                             min: 70,   max: 120,  perMonth: 3,   accountKey: "cc1" },
      { category: "Restaurants", descriptions: RESTAURANTS,                                     min: 30,   max: 85,   perMonth: 5,   accountKey: "cc1" },
      { category: "Phone",       descriptions: ["Telus Mobility"],                              min: 75,   max: 75,   perMonth: 1,   accountKey: "chq" },
      { category: "Internet",    descriptions: ["Shaw Internet AB"],                            min: 80,   max: 80,   perMonth: 1,   accountKey: "chq" },
      { category: "Utilities",   descriptions: ["Enbridge Gas", "ENMAX Power"],                min: 90,   max: 220,  perMonth: 1,   accountKey: "chq" },
      { category: "Insurance",   descriptions: ["Co-operators Home & Auto"],                   min: 200,  max: 200,  perMonth: 1,   accountKey: "chq" },
      { category: "Shopping",    descriptions: [...CLOTHING, "Amazon.ca", "Costco"],           min: 80,   max: 300,  perMonth: 2,   accountKey: "cc1" },
      { category: "Healthcare",  descriptions: PHARMACIES,                                      min: 25,   max: 90,   perMonth: 1,   accountKey: "cc1" },
      { category: "Kids Activities", descriptions: ["Calgary Minor Hockey", "Dance Studio"],   min: 100,  max: 250,  perMonth: 1,   accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "cc1",  monthly: 500,  desc: "RBC Visa Payment",        sourceKey: "chq" },
      { accountKey: "auto", monthly: 350,  desc: "ATB Auto Loan Payment",   sourceKey: "chq" },
      { accountKey: "mtg",  monthly: 1650, desc: "First Calgary Mortgage",  sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "TFSA Contribution", desc: "Scotiabank TFSA Deposit", amount: 300, accountKey: "tfsa", sourceKey: "chq" },
      { category: "RRSP Contribution", desc: "Scotiabank RRSP Deposit",  amount: 300, accountKey: "rrsp", sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 700 },
      { category: "Gas", amount: 300 },
      { category: "Restaurants", amount: 400 },
      { category: "Utilities", amount: 200 },
      { category: "Shopping", amount: 400 },
    ],
    bills: [
      { name: "Telus Mobility",         category: "phone",        amount: 75,  dueDate: 8 },
      { name: "Shaw Internet",          category: "internet",     amount: 80,  dueDate: 15 },
      { name: "Enbridge Gas",           category: "utilities",    amount: 130, dueDate: 20 },
      { name: "Co-operators Insurance", category: "insurance",    amount: 200, dueDate: 1 },
    ],
    goals: [
      { name: "Family Vacation Mexico", category: "vacation",      target: 8000,  current: 1500, months: 10, priority: "medium" },
      { name: "RRSP Top-Up",            category: "investment",    target: 100000, current: 62000, months: 24, priority: "high" },
      { name: "Pay Off Auto Loan",      category: "debt-payoff",   target: 12000, current: 4000,  months: 18, priority: "medium" },
    ],
  },

  // ── 6. The Comfortable Professional ─────────────────────────────────────────
  {
    email: "user_test6@demo.com",
    firstName: "Michael",
    lastName: "Chen",
    province: "ON",
    accounts: [
      { key: "chq",  name: "TD All-Inclusive Banking",    type: "chequing",  institution: "TD (TD Canada Trust)", openingBalance: 15000 },
      { key: "sav",  name: "TD High Interest Savings",    type: "savings",   institution: "TD (TD Canada Trust)", openingBalance: 42000 },
      { key: "tfsa", name: "TD Direct Investing TFSA",    type: "tfsa",      institution: "TD (TD Canada Trust)", openingBalance: 68500 },
      { key: "rrsp", name: "TD Direct Investing RRSP",    type: "rrsp",      institution: "TD (TD Canada Trust)", openingBalance: 145000 },
      { key: "mtg",  name: "TD Mortgage",                 type: "mortgage",  institution: "TD (TD Canada Trust)", openingBalance: 285000 },
    ],
    netPayBiweekly: 2960, payDesc: "Payroll — CIBC Capital Markets", payAccountKey: "chq",
    spending: [
      { category: "Groceries",   descriptions: GROCERIES,                                  min: 130,  max: 200,  perMonth: 4, accountKey: "chq" },
      { category: "Gas",         descriptions: GAS,                                         min: 80,   max: 130,  perMonth: 2, accountKey: "chq" },
      { category: "Restaurants", descriptions: [...RESTAURANTS, "The Keg Steakhouse", "Earls Restaurant"], min: 45, max: 150, perMonth: 5, accountKey: "chq" },
      { category: "Phone",       descriptions: ["Rogers Premier Plan"],                    min: 85,   max: 85,   perMonth: 1, accountKey: "chq" },
      { category: "Internet",    descriptions: ["Rogers Gigabit Internet"],                min: 90,   max: 90,   perMonth: 1, accountKey: "chq" },
      { category: "Insurance",   descriptions: ["TD Insurance Home & Auto"],               min: 280,  max: 280,  perMonth: 1, accountKey: "chq" },
      { category: "Shopping",    descriptions: [...CLOTHING, "Apple Store", "Amazon.ca", "Costco"], min: 100, max: 500, perMonth: 2, accountKey: "chq" },
      { category: "Entertainment",descriptions: ["Cineplex VIP", "Ticketmaster", "CN Tower"], min: 50, max: 200, perMonth: 1.5, accountKey: "chq" },
      { category: "Healthcare",  descriptions: ["Dentalcorp", ...PHARMACIES],              min: 40,   max: 200,  perMonth: 1, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "mtg", monthly: 1850, desc: "TD Mortgage Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "TFSA Contribution", desc: "TD TFSA Deposit",   amount: 800,  accountKey: "tfsa", sourceKey: "chq" },
      { category: "RRSP Contribution", desc: "TD RRSP Deposit",   amount: 1000, accountKey: "rrsp", sourceKey: "chq" },
      { category: "Savings Transfer",  desc: "Transfer to HISA",  amount: 500,  accountKey: "sav",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 800 },
      { category: "Restaurants", amount: 600 },
      { category: "Shopping", amount: 500 },
      { category: "Entertainment", amount: 300 },
      { category: "Gas", amount: 250 },
    ],
    bills: [
      { name: "Rogers Premier",   category: "phone",     amount: 85,  dueDate: 5 },
      { name: "Rogers Gigabit",   category: "internet",  amount: 90,  dueDate: 5 },
      { name: "TD Insurance",     category: "insurance", amount: 280, dueDate: 1 },
    ],
    goals: [
      { name: "Max RRSP ($200K)", category: "investment",     target: 200000, current: 145000, months: 30, priority: "high" },
      { name: "Cottage Fund",     category: "home",           target: 60000,  current: 20000,  months: 36, priority: "medium" },
      { name: "Europe Trip",      category: "vacation",       target: 15000,  current: 3000,   months: 14, priority: "medium" },
    ],
  },

  // ── 7. The Power Saver (DINK) ────────────────────────────────────────────────
  {
    email: "user_test7@demo.com",
    firstName: "Sophie",
    lastName: "Beaumont",
    province: "QC",
    accounts: [
      { key: "chq",  name: "Desjardins Chequing",          type: "chequing",   institution: "Desjardins",      openingBalance: 22000 },
      { key: "sav",  name: "EQ Bank Savings Plus",          type: "savings",    institution: "EQ Bank",         openingBalance: 58000 },
      { key: "tfsa", name: "Wealthsimple TFSA Invest",      type: "tfsa",       institution: "Wealthsimple Cash",openingBalance: 82000 },
      { key: "rrsp", name: "Desjardins RRSP",               type: "rrsp",       institution: "Desjardins",      openingBalance: 95000 },
      { key: "inv",  name: "Wealthsimple Non-Reg",          type: "investment", institution: "Wealthsimple Cash",openingBalance: 45000 },
      { key: "mtg",  name: "Desjardins Condo Mortgage",     type: "mortgage",   institution: "Desjardins",      openingBalance: 280000 },
    ],
    netPayBiweekly: 3270, payDesc: "Payroll — Ubisoft Montreal", payAccountKey: "chq",
    spending: [
      { category: "Groceries",    descriptions: ["IGA Montréal", "Maxi", "Provigo", "Metro QC"],   min: 110,  max: 170,  perMonth: 4, accountKey: "chq" },
      { category: "Transit",      descriptions: ["STM Mensuel", "OPUS Card"],                      min: 95,   max: 95,   perMonth: 1, accountKey: "chq" },
      { category: "Restaurants",  descriptions: [...RESTAURANTS, "L'Express", "Joe Beef", "Toqué!"], min: 40, max: 200, perMonth: 5, accountKey: "chq" },
      { category: "Phone",        descriptions: ["Videotron Mobile"],                              min: 65,   max: 65,   perMonth: 1, accountKey: "chq" },
      { category: "Internet",     descriptions: ["Videotron Internet"],                            min: 75,   max: 75,   perMonth: 1, accountKey: "chq" },
      { category: "Insurance",    descriptions: ["Desjardins Home Insurance"],                     min: 180,  max: 180,  perMonth: 1, accountKey: "chq" },
      { category: "Shopping",     descriptions: [...CLOTHING, "Simons", "Amazon.ca"],              min: 80,   max: 350,  perMonth: 2, accountKey: "chq" },
      { category: "Entertainment",descriptions: ["Cinéma Guzzo", "Théâtre du Rideau Vert", "OSM"], min: 40, max: 180, perMonth: 2, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "mtg", monthly: 1500, desc: "Desjardins Mortgage Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "TFSA Contribution",      desc: "Wealthsimple TFSA Deposit",  amount: 1500, accountKey: "tfsa", sourceKey: "chq" },
      { category: "RRSP Contribution",      desc: "Desjardins RRSP Deposit",    amount: 2000, accountKey: "rrsp", sourceKey: "chq" },
      { category: "Investment Contribution",desc: "Wealthsimple Non-Reg Dep.",  amount: 1000, accountKey: "inv",  sourceKey: "chq" },
      { category: "Savings Transfer",       desc: "Transfer to EQ Bank",        amount: 500,  accountKey: "sav",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 700 },
      { category: "Restaurants", amount: 600 },
      { category: "Shopping", amount: 400 },
      { category: "Entertainment", amount: 300 },
      { category: "Transit", amount: 100 },
    ],
    bills: [
      { name: "Videotron Mobile",      category: "phone",     amount: 65,  dueDate: 10 },
      { name: "Videotron Internet",    category: "internet",  amount: 75,  dueDate: 10 },
      { name: "Desjardins Home Ins.",  category: "insurance", amount: 180, dueDate: 1 },
    ],
    goals: [
      { name: "TFSA Maximum ($95K)",      category: "investment", target: 95000, current: 82000,  months: 12, priority: "high" },
      { name: "RRSP $150K Milestone",     category: "investment", target: 150000,current: 95000,  months: 24, priority: "high" },
      { name: "Investment Portfolio $100K",category:"investment", target: 100000,current: 45000,  months: 30, priority: "medium" },
    ],
  },

  // ── 8. The Business Owner ────────────────────────────────────────────────────
  {
    email: "user_test8@demo.com",
    firstName: "Robert",
    lastName: "Tremblay",
    province: "ON",
    accounts: [
      { key: "biz",  name: "CIBC Business Operating",      type: "chequing",   institution: "CIBC",            openingBalance: 38000 },
      { key: "chq",  name: "CIBC Personal Chequing",        type: "chequing",   institution: "CIBC",            openingBalance: 12000 },
      { key: "sav",  name: "CIBC Personal Savings",         type: "savings",    institution: "CIBC",            openingBalance: 25000 },
      { key: "rrsp", name: "CIBC Investor's Edge RRSP",     type: "rrsp",       institution: "CIBC",            openingBalance: 285000 },
      { key: "tfsa", name: "CIBC Investor's Edge TFSA",     type: "tfsa",       institution: "CIBC",            openingBalance: 88000 },
      { key: "inv",  name: "CIBC Investor's Edge Non-Reg",  type: "investment", institution: "CIBC",            openingBalance: 125000 },
      { key: "bmtg", name: "CIBC Business Property Mortgage",type:"mortgage",   institution: "CIBC",            openingBalance: 380000 },
    ],
    netPayBiweekly: 3200, payDesc: "Payroll — Tremblay Consulting Inc.", payAccountKey: "chq",
    spending: [
      { category: "Business Expenses",descriptions: ["Staples Canada", "Business Meals", "Office Depot"], min: 200, max: 800, perMonth: 3, accountKey: "biz" },
      { category: "Groceries",   descriptions: GROCERIES,                                      min: 140,  max: 220,  perMonth: 4, accountKey: "chq" },
      { category: "Gas",         descriptions: GAS,                                             min: 100,  max: 180,  perMonth: 3, accountKey: "chq" },
      { category: "Restaurants", descriptions: [...RESTAURANTS, "The Keg", "Ruth's Chris"],   min: 50,   max: 250,  perMonth: 6, accountKey: "chq" },
      { category: "Phone",       descriptions: ["Bell Business Line"],                         min: 125,  max: 125,  perMonth: 1, accountKey: "biz" },
      { category: "Internet",    descriptions: ["Bell Fibe Business"],                         min: 95,   max: 95,   perMonth: 1, accountKey: "biz" },
      { category: "Insurance",   descriptions: ["Aviva Business Insurance", "TD Insurance Home"], min: 350, max: 350, perMonth: 1, accountKey: "chq" },
      { category: "Shopping",    descriptions: [...CLOTHING, "Apple Store", "Amazon.ca"],      min: 100,  max: 600,  perMonth: 2, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "bmtg", monthly: 2100, desc: "CIBC Business Mortgage", sourceKey: "biz" },
    ],
    savingsTransfers: [
      { category: "RRSP Contribution", desc: "CIBC RRSP Deposit",    amount: 2500, accountKey: "rrsp", sourceKey: "chq" },
      { category: "TFSA Contribution", desc: "CIBC TFSA Deposit",    amount: 1000, accountKey: "tfsa", sourceKey: "chq" },
      { category: "Investment",        desc: "Non-Reg Portfolio Dep.",amount: 2000, accountKey: "inv",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 900 },
      { category: "Restaurants", amount: 800 },
      { category: "Gas", amount: 400 },
      { category: "Business Expenses", amount: 1500 },
      { category: "Shopping", amount: 600 },
    ],
    bills: [
      { name: "Bell Business",      category: "phone",     amount: 125, dueDate: 5 },
      { name: "Bell Fibe Business", category: "internet",  amount: 95,  dueDate: 5 },
      { name: "Aviva Business Ins.",category: "insurance", amount: 350, dueDate: 1 },
    ],
    goals: [
      { name: "RRSP Max ($350K)", category: "investment", target: 350000, current: 285000, months: 24, priority: "high" },
      { name: "Business Expansion Fund", category: "other", target: 50000, current: 15000, months: 18, priority: "high" },
      { name: "Retirement at 55",   category: "other",      target: 1500000, current: 498000, months: 72, priority: "high" },
    ],
  },

  // ── 9. The Pre-Retiree ───────────────────────────────────────────────────────
  {
    email: "user_test9@demo.com",
    firstName: "Linda",
    lastName: "MacPherson",
    province: "NS",
    accounts: [
      { key: "chq",  name: "RBC Day to Day Chequing",      type: "chequing",   institution: "RBC (Royal Bank)", openingBalance: 18000 },
      { key: "sav",  name: "RBC Enhanced Savings",          type: "savings",    institution: "RBC (Royal Bank)", openingBalance: 35000 },
      { key: "rrsp", name: "RBC Direct Investing RRSP",     type: "rrsp",       institution: "RBC (Royal Bank)", openingBalance: 648000 },
      { key: "tfsa", name: "RBC Direct Investing TFSA",     type: "tfsa",       institution: "RBC (Royal Bank)", openingBalance: 95000 },
      { key: "inv",  name: "RBC Non-Registered Portfolio",  type: "investment", institution: "RBC (Royal Bank)", openingBalance: 185000 },
      { key: "mtg",  name: "RBC Mortgage (Final Years)",    type: "mortgage",   institution: "RBC (Royal Bank)", openingBalance: 42000 },
    ],
    netPayBiweekly: 2885, payDesc: "Payroll — Nova Scotia Health Authority", payAccountKey: "chq",
    spending: [
      { category: "Groceries",    descriptions: GROCERIES,                                  min: 120,  max: 200,  perMonth: 3, accountKey: "chq" },
      { category: "Gas",          descriptions: GAS,                                         min: 70,   max: 130,  perMonth: 2, accountKey: "chq" },
      { category: "Restaurants",  descriptions: [...RESTAURANTS, "The Bicycle Thief", "Five Fishermen"], min: 50, max: 180, perMonth: 4, accountKey: "chq" },
      { category: "Phone",        descriptions: ["Eastlink Mobile"],                        min: 75,   max: 75,   perMonth: 1, accountKey: "chq" },
      { category: "Internet",     descriptions: ["Eastlink Internet"],                      min: 80,   max: 80,   perMonth: 1, accountKey: "chq" },
      { category: "Insurance",    descriptions: ["Intact Home & Auto NS"],                  min: 200,  max: 200,  perMonth: 1, accountKey: "chq" },
      { category: "Healthcare",   descriptions: ["Dentalcorp Halifax", ...PHARMACIES],      min: 50,   max: 250,  perMonth: 1.2, accountKey: "chq" },
      { category: "Shopping",     descriptions: [...CLOTHING, "Amazon.ca", "Costco"],       min: 80,   max: 400,  perMonth: 1.5, accountKey: "chq" },
      { category: "Travel",       descriptions: ["Air Canada", "WestJet", "Airbnb Canada"], min: 500, max: 2500,  perMonth: 0.4, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "mtg", monthly: 850, desc: "RBC Final Mortgage Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "RRSP Contribution",  desc: "RBC RRSP Top-Up (Final Years)", amount: 2000, accountKey: "rrsp", sourceKey: "chq" },
      { category: "TFSA Contribution",  desc: "RBC TFSA Deposit",              amount: 1500, accountKey: "tfsa", sourceKey: "chq" },
      { category: "Investment",         desc: "RBC Non-Reg Deposit",           amount: 1000, accountKey: "inv",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 600 },
      { category: "Restaurants", amount: 500 },
      { category: "Healthcare", amount: 300 },
      { category: "Travel", amount: 1000 },
      { category: "Shopping", amount: 500 },
    ],
    bills: [
      { name: "Eastlink Mobile",   category: "phone",     amount: 75,  dueDate: 8 },
      { name: "Eastlink Internet", category: "internet",  amount: 80,  dueDate: 8 },
      { name: "Intact Insurance",  category: "insurance", amount: 200, dueDate: 1 },
    ],
    goals: [
      { name: "Retire at 60 — $1.2M Target", category: "other",     target: 1200000, current: 928000, months: 36, priority: "high" },
      { name: "Pay Off Mortgage",             category: "debt-payoff",target: 42000,  current: 30000,  months: 8,  priority: "high" },
      { name: "Europe Retirement Trip",       category: "vacation",   target: 25000,  current: 5000,   months: 30, priority: "medium" },
    ],
  },

  // ── 10. The High Net Worth Executive ────────────────────────────────────────
  {
    email: "user_test10@demo.com",
    firstName: "Christine",
    lastName: "Vandenberg",
    province: "ON",
    accounts: [
      { key: "chq",  name: "BMO Private Banking Chequing",  type: "chequing",   institution: "BMO (Bank of Montreal)", openingBalance: 85000 },
      { key: "rrsp", name: "BMO Nesbitt Burns RRSP",         type: "rrsp",       institution: "BMO (Bank of Montreal)", openingBalance: 820000 },
      { key: "tfsa", name: "BMO InvestorLine TFSA",          type: "tfsa",       institution: "BMO (Bank of Montreal)", openingBalance: 95000 },
      { key: "inv",  name: "BMO Non-Registered Portfolio",   type: "investment", institution: "BMO (Bank of Montreal)", openingBalance: 580000 },
      { key: "mtg",  name: "BMO Final-Year Mortgage",        type: "mortgage",   institution: "BMO (Bank of Montreal)", openingBalance: 95000 },
    ],
    netPayBiweekly: 6150, payDesc: "Payroll — TD Bank Group (SVP)", payAccountKey: "chq",
    spending: [
      { category: "Groceries",    descriptions: ["Pusateri's Fine Foods", "Whole Foods Toronto", "Summerhill Market"], min: 250, max: 500, perMonth: 4, accountKey: "chq" },
      { category: "Gas",          descriptions: GAS,                                                min: 150,  max: 280,  perMonth: 2, accountKey: "chq" },
      { category: "Restaurants",  descriptions: ["Canoe Restaurant", "Scaramouche", "The Chase", "Alo Restaurant", "Buca"], min: 200, max: 800, perMonth: 6, accountKey: "chq" },
      { category: "Phone",        descriptions: ["Rogers Rogers Executive Plan"],                   min: 120,  max: 120,  perMonth: 1, accountKey: "chq" },
      { category: "Internet",     descriptions: ["Rogers Gigabit Pro"],                             min: 130,  max: 130,  perMonth: 1, accountKey: "chq" },
      { category: "Insurance",    descriptions: ["Sun Life Private Client", "Aviva Premium"],       min: 500,  max: 500,  perMonth: 1, accountKey: "chq" },
      { category: "Shopping",     descriptions: ["Holt Renfrew", "Nordstrom Canada", "Roots", "Apple Store Canada", "Tiffany & Co."], min: 300, max: 2500, perMonth: 3, accountKey: "chq" },
      { category: "Travel",       descriptions: ["Air Canada Business", "WestJet Plus", "Marriott Bonvoy", "Four Seasons Hotels"], min: 1500, max: 8000, perMonth: 0.8, accountKey: "chq" },
      { category: "Healthcare",   descriptions: ["Medcan Health", "Bupa Private", "Rexall"],       min: 100,  max: 800,  perMonth: 1, accountKey: "chq" },
      { category: "Entertainment",descriptions: ["Raptors Season Tickets", "Toronto Symphony", "Roy Thomson Hall"], min: 200, max: 1200, perMonth: 1.5, accountKey: "chq" },
    ],
    liabilityPayments: [
      { accountKey: "mtg", monthly: 1100, desc: "BMO Final Mortgage Payment", sourceKey: "chq" },
    ],
    savingsTransfers: [
      { category: "RRSP Contribution",  desc: "BMO RRSP (Maximizing)",         amount: 3000, accountKey: "rrsp", sourceKey: "chq" },
      { category: "TFSA Contribution",  desc: "BMO TFSA Deposit",              amount: 1000, accountKey: "tfsa", sourceKey: "chq" },
      { category: "Investment",         desc: "BMO Non-Reg Portfolio Top-Up",  amount: 6000, accountKey: "inv",  sourceKey: "chq" },
    ],
    budgets: [
      { category: "Groceries", amount: 2000 },
      { category: "Restaurants", amount: 3000 },
      { category: "Shopping", amount: 3000 },
      { category: "Travel", amount: 5000 },
      { category: "Entertainment", amount: 1500 },
    ],
    bills: [
      { name: "Rogers Executive Plan", category: "phone",     amount: 120, dueDate: 5 },
      { name: "Rogers Gigabit Pro",    category: "internet",  amount: 130, dueDate: 5 },
      { name: "Sun Life Insurance",    category: "insurance", amount: 500, dueDate: 1 },
    ],
    goals: [
      { name: "RRSP Max ($1M Milestone)", category: "investment", target: 1000000, current: 820000, months: 18, priority: "high" },
      { name: "Investment Portfolio $750K",category:"investment", target: 750000, current: 580000, months: 24, priority: "high" },
      { name: "Family Estate Planning",   category: "other",      target: 2000000, current: 1600000, months: 120, priority: "medium" },
    ],
  },
];

// ── Transaction generator ─────────────────────────────────────────────────────

// Annual compounding rates applied backward in time so a long (e.g. 7-year)
// history shows income/spending actually growing year over year, instead of
// a flat repeat of the same 12-month pattern.
const ANNUAL_RAISE = 0.025;
const ANNUAL_INFLATION = 0.02;

// Realistic Canadian consumer credit limits — revolving-credit account types
// (unlike installment loans/mortgages) receive open-ended spending in this
// generator, so without a cap a long window compounds into an implausible
// balance no real issuer would extend (e.g. $57K on a starter credit card
// over 7 years). Once a card hits its limit, further spending routed to it
// is redirected to chequing instead — "declined, paid by debit" — which is
// also the more realistic behavior for an over-extended persona than an
// ever-climbing balance.
const CREDIT_LIMIT: Partial<Record<string, number>> = {
  "credit-card": 15000,
  "line-of-credit": 20000,
};

function buildTransactions(
  userId: any,
  acctMap: Map<string, any>,
  profile: DemoProfile,
  months: number
): any[] {
  const txns: any[] = [];
  const typeByKey = new Map(profile.accounts.map((a) => [a.key, a.type]));

  // Running balance for every liability account, in chronological order (the
  // month loop below already runs oldest→newest). Used two ways: (1) cap
  // revolving-credit types at a realistic limit — see CREDIT_LIMIT above —
  // and (2) stop generating further payments on an installment loan
  // (auto/student/personal) once it's actually paid off, so a flat monthly
  // payment amount authored for a 3-year profile doesn't keep "paying" a
  // loan for years after its balance would realistically hit zero.
  const liabilityBalance = new Map<string, number>();
  for (const acct of profile.accounts) {
    if (LIABILITY_TYPES.has(acct.type)) liabilityBalance.set(acct.key, acct.openingBalance);
  }

  const add = (
    type: "income" | "expense",
    amount: number,
    category: string,
    description: string,
    date: Date,
    accountKey: string
  ) => {
    const accountId = acctMap.get(accountKey);
    if (!accountId) return;
    txns.push({ userId, accountId, type, amount: parseFloat(amount.toFixed(2)), category, description, date, source: "manual" });
  };

  // Routes a card expense to chequing instead once the card is at its limit,
  // and keeps the running balance in sync either way.
  const addCardExpense = (amount: number, category: string, description: string, date: Date, accountKey: string) => {
    const limit = CREDIT_LIMIT[typeByKey.get(accountKey) ?? ""];
    const balance = liabilityBalance.get(accountKey) ?? 0;
    if (limit !== undefined && balance >= limit) {
      add("expense", amount, category, description, date, profile.payAccountKey);
      return;
    }
    add("expense", amount, category, description, date, accountKey);
    if (liabilityBalance.has(accountKey)) liabilityBalance.set(accountKey, balance + amount);
  };

  // ── Opening balances (`months` months ago) ────────────────────────────────────
  for (const acct of profile.accounts) {
    if (acct.openingBalance <= 0) continue;
    const accountId = acctMap.get(acct.key);
    if (!accountId) continue;
    const isLiability = LIABILITY_TYPES.has(acct.type);
    txns.push({
      userId,
      accountId,
      type: isLiability ? "expense" : "income",
      amount: acct.openingBalance,
      category: isLiability ? "Opening Balance (Debt)" : "Opening Balance",
      description: `Opening Balance — ${acct.name}`,
      date: txnDate(months, 1),
      source: "manual",
    });
  }

  // ── Pay dates over the full window — compounding raise year over year ────────
  const pays = payDates(months);
  for (const date of pays) {
    const monthsAgoForPay = Math.round((_now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const raiseDiscount = Math.pow(1 + ANNUAL_RAISE, -(monthsAgoForPay / 12));
    const basePay = profile.netPayBiweekly * raiseDiscount;
    add("income", rnd(basePay * 0.96, basePay * 1.04), "Employment Income", profile.payDesc, date, profile.payAccountKey);
  }

  // ── GST/HST Credit (quarterly — Jan, Apr, Jul, Oct) ──────────────────────────
  for (let m = months - 1; m >= 0; m--) {
    const base = new Date(_now);
    base.setDate(1);
    base.setMonth(base.getMonth() - m);
    if ([0, 3, 6, 9].includes(base.getMonth())) {
      add("income", rnd(90, 160), "Government Transfer", "GST/HST Credit — CRA", txnDate(m, 5), profile.payAccountKey);
    }
    // Tax refund (March-April of each year)
    if (base.getMonth() === 3) {
      add("income", rnd(400, 1800), "Tax Refund", "CRA Tax Refund — Direct Deposit", txnDate(m, rndInt(10, 25)), profile.payAccountKey);
    }
  }

  // ── Monthly spending rules — compounding inflation discount further back ─────
  for (let m = months - 1; m >= 0; m--) {
    const inflationDiscount = Math.pow(1 + ANNUAL_INFLATION, -(m / 12));
    for (const rule of profile.spending) {
      const count = Math.round(rule.perMonth + rnd(-0.5, 0.5));
      for (let i = 0; i < count; i++) {
        const day = rndInt(1, 28);
        const amount = rnd(rule.min, rule.max) * inflationDiscount;
        const desc = pick(rule.descriptions);
        addCardExpense(amount, rule.category, desc, txnDate(m, day), rule.accountKey);
      }
    }

    // ── Savings transfers ───────────────────────────────────────────────────────
    if (profile.savingsTransfers) {
      for (const st of profile.savingsTransfers) {
        const sourceId = acctMap.get(st.sourceKey);
        const destId = acctMap.get(st.accountKey);
        if (!sourceId || !destId) continue;
        txns.push({
          userId, accountId: sourceId, type: "expense",
          amount: st.amount, category: st.category, description: st.desc,
          date: txnDate(m, rndInt(1, 5)), source: "manual",
        });
        txns.push({
          userId, accountId: destId, type: "income",
          amount: st.amount, category: st.category, description: st.desc,
          date: txnDate(m, rndInt(1, 5)), source: "manual",
        });
      }
    }

    // ── Liability payments — stop once an installment loan is paid off ──────────
    for (const lp of profile.liabilityPayments) {
      const sourceId = acctMap.get(lp.sourceKey);
      const liabId = acctMap.get(lp.accountKey);
      if (!sourceId || !liabId) continue;
      const isRevolving = CREDIT_LIMIT[typeByKey.get(lp.accountKey) ?? ""] !== undefined;
      const remaining = liabilityBalance.get(lp.accountKey) ?? 0;
      if (!isRevolving && remaining <= 0) continue; // installment loan already paid off — no more payments

      const payment = isRevolving ? lp.monthly : Math.min(lp.monthly, remaining);
      // Debit from chequing
      txns.push({ userId, accountId: sourceId, type: "expense", amount: payment, category: "Debt Payment", description: lp.desc, date: txnDate(m, 27), source: "manual" });
      // Credit (payment) on liability
      txns.push({ userId, accountId: liabId, type: "income", amount: payment, category: "Debt Payment", description: lp.desc, date: txnDate(m, 27), source: "manual" });
      liabilityBalance.set(lp.accountKey, remaining - payment);
    }

    // ── Random one-off events (healthcare, car repairs, gifts, etc.) ──────────
    if (_rng() < 0.4) {
      const oneOffs = [
        { cat: "Healthcare", descs: ["Dental Cleaning — Dentalcorp", "Optometrist", "Physiotherapy"], min: 80, max: 350 },
        { cat: "Auto", descs: ["Canadian Tire Auto Service", "Speedy Auto Service", "Oil Change"], min: 60, max: 400 },
        { cat: "Gifts", descs: ["Amazon.ca Gift", "Indigo Books", "ThinkGeek Canada"], min: 30, max: 200 },
        { cat: "Household", descs: ["IKEA Canada", "Home Depot Canada", "Canadian Tire"], min: 40, max: 300 },
        { cat: "Education", descs: ["Udemy Course", "LinkedIn Learning", "Book Purchase"], min: 15, max: 150 },
      ];
      const ev = pick(oneOffs);
      add("expense", rnd(ev.min, ev.max) * inflationDiscount, ev.cat, pick(ev.descs), txnDate(m, rndInt(1, 28)), profile.payAccountKey);
    }
  }

  return txns;
}

// ── Net worth snapshot builder ────────────────────────────────────────────────

function buildSnapshots(userId: any, profile: DemoProfile, months: number): any[] {
  const snapshots: any[] = [];

  // Compute rough asset/liability totals from opening balances
  let baseAssets = 0, baseLiabilities = 0;
  for (const acct of profile.accounts) {
    if (LIABILITY_TYPES.has(acct.type)) baseLiabilities += acct.openingBalance;
    else baseAssets += acct.openingBalance;
  }

  // Quarterly snapshots over the full window — true compounding (not a linear
  // approximation) so longer histories show realistic growth/paydown curves.
  for (let m = months; m >= 0; m -= 3) {
    const yearsElapsed = (months - m) / 12;
    const growthFactor = Math.pow(1.02, yearsElapsed); // ~2%/year asset growth
    const paydownFactor = Math.pow(0.94, yearsElapsed); // ~6%/year liability paydown
    const totalAssets = Math.round(baseAssets * growthFactor);
    const totalLiabilities = Math.max(0, Math.round(baseLiabilities * paydownFactor));
    const netWorth = totalAssets - totalLiabilities;

    const cashPct = ["chequing", "savings"].reduce((s, t) => {
      return s + profile.accounts.filter(a => a.type === t).reduce((ss, a) => ss + a.openingBalance, 0);
    }, 0) / Math.max(1, baseAssets);
    const invPct = ["rrsp", "tfsa", "investment"].reduce((s, t) => {
      return s + profile.accounts.filter(a => a.type === t).reduce((ss, a) => ss + a.openingBalance, 0);
    }, 0) / Math.max(1, baseAssets);
    const rePct = profile.accounts.filter(a => a.type === "mortgage").length > 0 ? 0.1 : 0;

    snapshots.push({
      userId,
      totalAssets,
      totalLiabilities,
      netWorth,
      snapshotDate: txnDate(m, 1),
      breakdown: {
        assets: {
          cash: Math.round(totalAssets * cashPct),
          investments: Math.round(totalAssets * invPct),
          realEstate: Math.round(totalAssets * rePct),
          otherAssets: Math.round(totalAssets * Math.max(0, 1 - cashPct - invPct - rePct)),
        },
        liabilities: {
          mortgages: Math.round(totalLiabilities * (baseLiabilities > 0 ? profile.accounts.filter(a => a.type === "mortgage").reduce((s, a) => s + a.openingBalance, 0) / baseLiabilities : 0)),
          creditCard: Math.round(totalLiabilities * (baseLiabilities > 0 ? profile.accounts.filter(a => a.type === "credit-card").reduce((s, a) => s + a.openingBalance, 0) / baseLiabilities : 0)),
          loans: Math.round(totalLiabilities * (baseLiabilities > 0 ? profile.accounts.filter(a => ["auto-loan", "student-loan", "personal-loan"].includes(a.type)).reduce((s, a) => s + a.openingBalance, 0) / baseLiabilities : 0)),
          otherLiabilities: Math.round(totalLiabilities * (baseLiabilities > 0 ? profile.accounts.filter(a => a.type === "line-of-credit").reduce((s, a) => s + a.openingBalance, 0) / baseLiabilities : 0)),
        },
      },
    });
  }
  return snapshots;
}

// ── Balance helper ────────────────────────────────────────────────────────────
// Replicates the exact formula the app itself uses when it lazily recalculates
// Account.balance from transactions (see getBalanceDelta in
// server/src/routes/transactions.ts). Account docs are inserted with
// balance: 0 and only get corrected on the next GET /accounts, so anything
// seeded here that needs a "current balance" (Debt, Property, Investment)
// must compute it independently, the same way, to stay consistent with what
// the UI will show.

function computeFinalBalance(txns: any[], accountId: any, isLiability: boolean): number {
  return txns.reduce((sum, t) => {
    if (String(t.accountId) !== String(accountId)) return sum;
    const baseDelta = t.type === "income" ? t.amount : -t.amount;
    return sum + (isLiability ? -baseDelta : baseDelta);
  }, 0);
}

// ── Debts + Properties ────────────────────────────────────────────────────────

async function buildDebtsAndProperties(
  userId: any,
  acctMap: Map<string, any>,
  profile: DemoProfile,
  txns: any[],
  months: number
): Promise<void> {
  for (const acctDef of profile.accounts) {
    if (!LIABILITY_TYPES.has(acctDef.type)) continue;
    const accountId = acctMap.get(acctDef.key);
    if (!accountId) continue;

    const finalBalance = Math.max(0, Math.round(computeFinalBalance(txns, accountId, true) * 100) / 100);
    const defaults = DEBT_DEFAULTS[acctDef.type] ?? { debtType: "other" as const, interestRate: 10, termMonths: 60, label: acctDef.type };
    const matchingPayment = profile.liabilityPayments.find((lp) => lp.accountKey === acctDef.key);
    const minimumPayment = matchingPayment?.monthly ?? amortizedPayment(finalBalance, defaults.interestRate, defaults.termMonths);

    const debt = await Debt.create({
      userId,
      name: acctDef.name,
      type: defaults.debtType,
      principal: acctDef.openingBalance,
      currentBalance: finalBalance,
      interestRate: defaults.interestRate,
      minimumPayment,
      dueScheduleType: "monthly",
      lender: acctDef.institution,
    } as any);

    if (acctDef.type === "mortgage") {
      const isBusiness = /business/i.test(acctDef.name);
      const purchasePrice = Math.round(acctDef.openingBalance / 0.8); // assume 20% down payment
      const yearsOwned = months / 12;
      const currentEstimatedValue = Math.round(purchasePrice * Math.pow(1.035, yearsOwned)); // ~3.5%/year appreciation
      await Property.create({
        userId,
        nickname: isBusiness ? "Business Property" : `${profile.lastName} Family Home`,
        type: isBusiness ? "commercial" : "primary-residence",
        city: PROVINCE_CITY[profile.province] ?? profile.province,
        province: profile.province,
        purchasePrice,
        purchaseDate: txnDate(months, 15),
        currentEstimatedValue,
        linkedMortgageDebtId: debt._id,
        annualPropertyTax: Math.round(currentEstimatedValue * 0.01),
      } as any);
    }
  }
}

// ── Recurring transactions ────────────────────────────────────────────────────

async function buildRecurringTransactions(
  userId: any,
  acctMap: Map<string, any>,
  profile: DemoProfile
): Promise<void> {
  const nextMonthly = (dayOfMonth: number): Date => {
    const d = new Date(_now);
    d.setDate(Math.min(dayOfMonth, 28));
    if (d <= _now) d.setMonth(d.getMonth() + 1);
    return d;
  };

  const payAccountId = acctMap.get(profile.payAccountKey);
  if (payAccountId) {
    const nextPay = new Date(_now);
    nextPay.setDate(nextPay.getDate() + 14);
    await RecurringTransaction.create({
      userId, name: profile.payDesc, amount: Math.round(profile.netPayBiweekly * 100) / 100,
      type: "income", category: "Employment Income", frequency: "biweekly",
      dayOfMonth: 1, nextDueDate: nextPay, accountId: payAccountId, isActive: true,
    } as any);
  }

  for (const bill of profile.bills) {
    if (!payAccountId) continue;
    await RecurringTransaction.create({
      userId, name: bill.name, amount: bill.amount, type: "expense",
      category: bill.category, frequency: "monthly", dayOfMonth: bill.dueDate,
      nextDueDate: nextMonthly(bill.dueDate), accountId: payAccountId, isActive: true,
    } as any);
  }

  for (const st of profile.savingsTransfers ?? []) {
    const accountId = acctMap.get(st.sourceKey);
    if (!accountId) continue;
    await RecurringTransaction.create({
      userId, name: st.desc, amount: st.amount, type: "expense",
      category: st.category, frequency: "monthly", dayOfMonth: 3,
      nextDueDate: nextMonthly(3), accountId, isActive: true,
    } as any);
  }
}

// ── Investments + tax-wrapper tracker accounts ───────────────────────────────

async function buildInvestmentsAndTrackers(
  userId: any,
  acctMap: Map<string, any>,
  profile: DemoProfile,
  txns: any[],
  months: number,
  riskProfile: "conservative" | "moderate" | "aggressive"
): Promise<void> {
  const allocation = getRiskProfile(riskProfile);
  const etfs = getETFRecommendations(allocation).filter((e) => e.allocation > 0);
  const yearsHeld = Math.max(1, months / 12);
  const currentYear = _now.getFullYear();

  for (const acctDef of profile.accounts) {
    if (!TAX_WRAPPER_TYPES.has(acctDef.type)) continue;
    const accountId = acctMap.get(acctDef.key);
    if (!accountId) continue;

    const finalBalance = Math.max(0, Math.round(computeFinalBalance(txns, accountId, false) * 100) / 100);
    if (finalBalance <= 0) continue;

    const accountType = acctDef.type === "investment" ? "non-registered" : (acctDef.type as "tfsa" | "rrsp");
    const totalCost = Math.round(finalBalance * 0.85 * 100) / 100; // assume ~15% unrealized gain
    const taxAccount = await TaxAccount.create({
      userId, accountType, accountName: acctDef.name, linkedAccountId: accountId,
      totalCost, currentValue: finalBalance, unrealizedGains: finalBalance - totalCost, realizedGains: 0,
      tfsaAnnualLimit: 7000, rrspContributionLimit: 31560,
    } as any);

    // Size holdings off the persona's risk allocation — same catalog the
    // Investment Recommendations page itself would suggest.
    const holdings: Array<{ symbol: string; name: string; type: string; quantity: number; purchasePrice: number; currentPrice: number; currentValue: number }> = [];
    for (const etf of etfs) {
      const market = ETF_MARKET[etf.symbol] ?? { price: 50, annualReturn: 0.05 };
      const currentValue = Math.round(finalBalance * (etf.allocation / 100) * 100) / 100;
      if (currentValue <= 0) continue;
      const quantity = Math.max(1, Math.round(currentValue / market.price));
      const purchasePrice = Math.round((market.price / Math.pow(1 + market.annualReturn, yearsHeld)) * 100) / 100;
      holdings.push({ symbol: etf.symbol, name: etf.name, type: etf.type, quantity, purchasePrice, currentPrice: market.price, currentValue });
    }

    for (const h of holdings) {
      const totalCostH = Math.round(h.quantity * h.purchasePrice * 100) / 100;
      await Investment.create({
        userId, taxAccountId: taxAccount._id, accountId,
        symbol: h.symbol, name: h.name, type: h.type === "cash" ? "cash" : "etf",
        purchaseDate: txnDate(months, 10), purchasePrice: h.purchasePrice, quantity: h.quantity, totalCost: totalCostH,
        currentPrice: h.currentPrice, currentValue: h.currentValue,
        unrealizedGain: Math.round((h.currentValue - totalCostH) * 100) / 100,
        unrealizedGainPercent: totalCostH > 0 ? Math.round(((h.currentValue - totalCostH) / totalCostH) * 1000) / 10 : 0,
        taxable: accountType === "non-registered", currency: "CAD",
      } as any);
    }

    if (acctDef.type === "tfsa" || acctDef.type === "rrsp") {
      const matchingContribution = profile.savingsTransfers?.find((st) => st.accountKey === acctDef.key)?.amount ?? Math.round(finalBalance * 0.05);
      const yearsOfContrib = Math.min(Math.ceil(yearsHeld), 6);
      const contributions = Array.from({ length: yearsOfContrib }, (_, i) => ({
        year: currentYear - i, amount: Math.round(matchingContribution * 12), date: new Date(currentYear - i, 2, 1),
      }));

      if (acctDef.type === "tfsa") {
        await TFSAAccount.create({
          userId, accountName: acctDef.name, institution: acctDef.institution, balance: finalBalance, currency: "CAD",
          contributions, withdrawals: [], lifetimeContributionRoom: Math.max(0, 95000 - finalBalance),
          annualLimit: 7000, currentYearUsed: contributions[0]?.amount ?? 0,
          investmentHoldings: holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity, purchasePrice: h.purchasePrice, currentValue: h.currentValue })),
        } as any);
      } else {
        await RRSPAccount.create({
          userId, accountName: acctDef.name, institution: acctDef.institution, balance: finalBalance, currency: "CAD",
          contributions, withdrawals: [], lifetimeContributionRoom: Math.max(0, 200000 - finalBalance),
          deductionLimit: 31560, annualContributionLimit: 31560, currentYearUsed: contributions[0]?.amount ?? 0,
          isAccountOwner: true,
          investmentHoldings: holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity, adjustedCostBase: h.purchasePrice, currentValue: h.currentValue })),
        } as any);
      }
    }
  }

  // ── FHSA (flagged profiles only) ────────────────────────────────────────────
  if (profile.hasFHSA) {
    const yearsContributed = Math.min(Math.ceil(yearsHeld), 3);
    const contributions = Array.from({ length: yearsContributed }, (_, i) => ({
      year: currentYear - i, amount: 8000, date: new Date(currentYear - i, 1, 1),
    }));
    const balance = Math.min(40000, contributions.reduce((s, c) => s + c.amount, 0));
    const conservativeAllocation = getRiskProfile("conservative");
    const fhsaEtfs = getETFRecommendations(conservativeAllocation).filter((e) => e.allocation > 0).slice(0, 2);
    const fhsaHoldings = fhsaEtfs.map((etf) => {
      const market = ETF_MARKET[etf.symbol] ?? { price: 50, annualReturn: 0.03 };
      const currentValue = Math.round(balance * (etf.allocation / 100));
      return { symbol: etf.symbol, quantity: Math.max(1, Math.round(currentValue / market.price)), purchasePrice: market.price, currentValue };
    });
    await FHSAAccount.create({
      userId, accountName: "FHSA — First Home Savings", balance, currency: "CAD",
      contributions, withdrawals: [], annualLimit: 8000, lifetimeLimit: 40000,
      currentYearUsed: contributions[0]?.amount ?? 0, lifetimeUsed: balance,
      firstTimeHomeBuyerStatus: true, homeWithdrawalEligible: false,
      investmentHoldings: fhsaHoldings,
    } as any);
  }

  // ── RESP (flagged profiles only) ─────────────────────────────────────────────
  if (profile.respBeneficiary) {
    const respAcctDef = profile.accounts.find((a) => a.type === "investment" && /resp/i.test(a.name));
    const respAccountId = respAcctDef ? acctMap.get(respAcctDef.key) : undefined;
    const balance = respAccountId
      ? Math.max(0, Math.round(computeFinalBalance(txns, respAccountId, false) * 100) / 100)
      : 0;
    const yearsOfContrib = Math.min(Math.ceil(yearsHeld), 10);
    const respContribution = profile.savingsTransfers?.find((st) => respAcctDef && st.accountKey === respAcctDef.key)?.amount ?? 200;
    const contributions = Array.from({ length: yearsOfContrib }, (_, i) => ({
      year: currentYear - i, amount: Math.round(respContribution * 12), date: new Date(currentYear - i, 5, 1),
    }));
    const grants = contributions.map((c) => ({ year: c.year, amount: Math.round(c.amount * 0.2), date: c.date, type: "CESG" as const }));
    await RESPAccount.create({
      userId, accountName: "RESP", beneficiaryName: profile.respBeneficiary.name,
      beneficiaryBirthDate: new Date(profile.respBeneficiary.birthYear, 5, 15),
      beneficiarySIN: "000-000-000", balance, currency: "CAD",
      contributions, grants, withdrawals: [],
      annualContributionAllowance: 50000, lifetimeContributionLimit: 50000,
      currentYearContribution: contributions[0]?.amount ?? 0,
      cumulativeGrantRoom: Math.max(0, 7200 - grants.reduce((s, g) => s + g.amount, 0)),
      investmentHoldings: [],
    } as any);
  }
}

// ── Seed options ──────────────────────────────────────────────────────────────

export interface SeedOpts {
  /** Custom PRNG — pass mulberry32(n) for deterministic data, omit for Math.random */
  rng?: () => number;
  /** Base date for transaction history — omit to use current date */
  baseDate?: Date;
  /** Years of history to generate — 1, 3, 5, or 7. Defaults to 3. */
  years?: 1 | 3 | 5 | 7;
}

// ── Data-only seeder (for an EXISTING user — no User doc created) ─────────────

export async function seedDataForUser(userId: any, profile: DemoProfile, opts?: SeedOpts): Promise<{ transactionCount: number }> {
  _rng = opts?.rng ?? Math.random;
  _now = opts?.baseDate ?? new Date();
  const years = opts?.years ?? 3;
  const months = years * 12;

  const acctMap = new Map<string, any>();
  for (const def of profile.accounts) {
    const acct = await Account.create({
      userId, name: def.name, type: def.type,
      institution: def.institution, balance: 0, currency: "CAD",
    } as any);
    acctMap.set(def.key, acct._id);
  }

  const txns = buildTransactions(userId, acctMap, profile, months);
  await Transaction.insertMany(txns);

  const now = new Date();
  for (const b of profile.budgets) {
    await Budget.create({
      userId, category: b.category, amount: b.amount,
      period: "monthly", isActive: true,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    });
  }
  for (const b of profile.bills) {
    await Bill.create({
      userId, name: b.name, category: b.category,
      amount: b.amount, frequency: "monthly",
      dueDate: b.dueDate, status: "active", isAutoPay: true,
    });
  }
  for (const g of profile.goals) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + g.months);
    await Goal.create({
      userId, name: g.name, category: g.category,
      targetAmount: g.target, currentAmount: g.current,
      targetDate, priority: g.priority || "medium", status: "active",
    });
  }
  const snapshots = buildSnapshots(userId, profile, months);
  await NetWorthSnapshot.insertMany(snapshots);

  // Full feature coverage: debts/properties, recurring transactions,
  // investments + the TFSA/RRSP/FHSA/RESP tracker models.
  await buildDebtsAndProperties(userId, acctMap, profile, txns, months);
  await buildRecurringTransactions(userId, acctMap, profile);
  const profileIdx = PROFILES.indexOf(profile);
  const riskProfile = RISK_BY_PROFILE_INDEX[profileIdx] ?? "moderate";
  await buildInvestmentsAndTrackers(userId, acctMap, profile, txns, months, riskProfile);

  return { transactionCount: txns.length };
}

// ── Seeder for a single profile ───────────────────────────────────────────────

export async function seedProfile(profile: DemoProfile, passwordHash: string, opts?: SeedOpts): Promise<void> {
  const existing = await User.findOne({ email: profile.email });
  if (existing) {
    console.log(`  ⏭  ${profile.email} already exists — skipping`);
    return;
  }

  const user = await User.create({
    email: profile.email,
    passwordHash,
    firstName: profile.firstName,
    lastName: profile.lastName,
    province: profile.province,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = user._id as any;

  const { transactionCount } = await seedDataForUser(userId, profile, opts);
  console.log(`  ✓  ${profile.email} — ${transactionCount} transactions, ${profile.accounts.length} accounts`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DEMO_EMAIL = "user_test@demo.com";
const DEFAULT_PROFILE_INDEX = 4; // The Young Professional — good neutral starter

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/persfin");
  console.log("Connected to MongoDB\n");

  try {
    await Transaction.collection.dropIndex("userId_1_plaidTransactionId_1");
  } catch { /* index may not exist yet */ }
  await Transaction.collection.createIndex(
    { userId: 1, plaidTransactionId: 1 },
    { unique: true, partialFilterExpression: { plaidTransactionId: { $type: "string" } } }
  );

  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    console.log(`${DEMO_EMAIL} already exists — skipping. Run clearDemoUsers first to recreate.`);
  } else {
    const passwordHash = await bcrypt.hash("Demo1234!", 10);
    const user = await User.create({
      email: DEMO_EMAIL,
      passwordHash,
      firstName: "Demo",
      lastName: "User",
      province: "ON",
      demoProfileIndex: DEFAULT_PROFILE_INDEX,
    });
    await seedDataForUser(user._id, PROFILES[DEFAULT_PROFILE_INDEX - 1]);
    console.log(`✓  ${DEMO_EMAIL} created with "${PROFILES[DEFAULT_PROFILE_INDEX - 1].firstName}'s" profile (default 3 years of history)`);
  }

  console.log(`\nDone!`);
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: Demo1234!`);
}

// Only run when executed directly (not when imported as a module)
if (require.main === module) {
  main().catch(console.error).finally(() => mongoose.disconnect());
}
