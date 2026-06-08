/**
 * Demo data seeder — creates 10 Canadian financial profiles with 2 years of history.
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

// ── Seasonal spending multipliers (per calendar month, 0=Jan … 11=Dec) ────────
// Reflects real Canadian seasonal patterns: heating in winter, travel & gas in
// summer, holiday shopping Nov-Dec. Applied to amounts so monthly totals vary.

const SEASONAL_FACTORS: Record<string, number[]> = {
  //                          Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
  Groceries:           [1.05, 1.00, 0.98, 0.95, 0.95, 0.92, 0.90, 0.90, 0.95, 1.00, 1.05, 1.22],
  Gas:                 [0.82, 0.83, 0.93, 1.03, 1.12, 1.22, 1.28, 1.24, 1.10, 0.98, 0.88, 0.82],
  Restaurants:         [0.75, 0.78, 0.87, 0.93, 1.00, 1.12, 1.20, 1.20, 1.05, 0.98, 0.92, 1.22],
  Coffee:              [1.15, 1.12, 1.05, 1.00, 0.95, 0.87, 0.83, 0.83, 0.97, 1.05, 1.10, 1.15],
  Utilities:           [1.55, 1.48, 1.25, 0.90, 0.68, 0.58, 0.65, 0.72, 0.80, 1.00, 1.22, 1.45],
  Shopping:            [0.72, 0.72, 0.83, 0.90, 1.00, 0.93, 0.97, 1.05, 1.15, 1.12, 1.32, 1.65],
  Entertainment:       [0.78, 0.78, 0.87, 0.92, 1.00, 1.15, 1.28, 1.28, 1.05, 0.97, 0.90, 1.12],
  Travel:              [0.60, 0.60, 0.75, 0.88, 1.08, 1.38, 1.65, 1.70, 1.12, 0.82, 0.72, 1.32],
  Healthcare:          [1.28, 1.20, 1.08, 1.00, 0.90, 0.80, 0.78, 0.80, 0.97, 1.05, 1.18, 1.08],
  "Kids Activities":   [0.60, 0.72, 0.90, 1.05, 1.08, 0.22, 0.18, 0.22, 1.20, 1.28, 1.18, 0.75],
  "Business Expenses": [0.90, 0.95, 1.00, 1.05, 1.07, 0.88, 0.72, 0.78, 1.07, 1.12, 1.07, 0.93],
  Household:           [0.72, 0.78, 1.12, 1.28, 1.32, 1.05, 0.93, 0.88, 0.88, 0.93, 0.87, 0.82],
  Auto:                [0.93, 0.93, 1.12, 1.18, 1.12, 0.95, 0.88, 0.87, 1.00, 1.07, 1.02, 0.93],
  Gifts:               [0.88, 1.10, 0.90, 0.92, 1.08, 0.92, 0.90, 0.90, 0.90, 0.95, 1.10, 1.65],
};
const DEFAULT_SEASONAL = [0.90, 0.92, 0.96, 0.98, 1.01, 1.04, 1.06, 1.06, 1.02, 1.00, 0.98, 1.06];

function seasonalFactor(category: string, month: number): number {
  return (SEASONAL_FACTORS[category] ?? DEFAULT_SEASONAL)[month];
}

/** Calendar month (0-11) for a date `monthsAgo` months before _now. */
function calendarMonthOf(monthsAgo: number): number {
  const d = new Date(_now);
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.getMonth();
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

function buildTransactions(
  userId: any,
  acctMap: Map<string, any>,
  profile: DemoProfile,
  historyMonths: number
): any[] {
  const txns: any[] = [];
  const LIABILITY_TYPES = new Set(["credit-card", "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan"]);

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

  // ── Per-year "character" factors ─────────────────────────────────────────────
  // Each (yearIndex, category) pair gets a stable random multiplier in [0.88, 1.12].
  // This makes every year slightly different from the next while staying recognisably
  // similar — exactly the "year-to-year variation but similar pattern" effect we want.
  const numYears = Math.ceil(historyMonths / 12) + 1;
  const allCats = [...new Set([
    ...profile.spending.map(r => r.category),
    "Healthcare", "Auto", "Gifts", "Household", "Education",
  ])];
  const yearChars = new Map<string, number[]>();
  for (const cat of allCats) {
    yearChars.set(cat, Array.from({ length: numYears }, () => rnd(0.88, 1.12)));
  }

  // ── Opening balances ──────────────────────────────────────────────────────────
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
      date: txnDate(historyMonths, 1),
      source: "manual",
    });
  }

  // ── Pay dates ─────────────────────────────────────────────────────────────────
  const pays = payDates(historyMonths);
  for (const date of pays) {
    add("income", rnd(profile.netPayBiweekly * 0.96, profile.netPayBiweekly * 1.04), "Employment Income", profile.payDesc, date, profile.payAccountKey);
  }

  // ── GST/HST Credit (quarterly) and annual tax refund ─────────────────────────
  for (let m = historyMonths - 1; m >= 0; m--) {
    const base = new Date(_now);
    base.setDate(1);
    base.setMonth(base.getMonth() - m);
    if ([0, 3, 6, 9].includes(base.getMonth())) {
      add("income", rnd(90, 160), "Government Transfer", "GST/HST Credit — CRA", txnDate(m, 5), profile.payAccountKey);
    }
    if (base.getMonth() === 3) {
      add("income", rnd(400, 1800), "Tax Refund", "CRA Tax Refund — Direct Deposit", txnDate(m, rndInt(10, 25)), profile.payAccountKey);
    }
  }

  // ── Monthly spending rules ────────────────────────────────────────────────────
  // Amount = base range × seasonal factor × year-character factor × inflation factor
  //   seasonal:    reflects the calendar month's typical spend pattern (heating in Jan, travel in Jul, etc.)
  //   year-char:   a stable per-(year,category) multiplier [0.88–1.12] so each year "feels" slightly different
  //   inflation:   ~2.5% per year; older months are proportionally cheaper
  for (let m = historyMonths - 1; m >= 0; m--) {
    const month     = calendarMonthOf(m);             // 0=Jan … 11=Dec
    const yearIndex = Math.floor(m / 12);             // 0=current year, 1=last year, …
    const inflation = 1 / Math.pow(1.025, yearIndex); // older = cheaper

    for (const rule of profile.spending) {
      const seasonal  = seasonalFactor(rule.category, month);
      const yearChar  = yearChars.get(rule.category)?.[yearIndex] ?? 1.0;
      const scale     = seasonal * yearChar * inflation;

      // Vary count slightly with season for high-frequency categories
      const countScale = seasonal > 1.15 ? 1.2 : seasonal < 0.85 ? 0.8 : 1.0;
      const count = Math.max(0, Math.round(rule.perMonth * countScale + rnd(-0.5, 0.5)));

      for (let i = 0; i < count; i++) {
        const rawAmount = rnd(rule.min, rule.max);
        const amount    = parseFloat((rawAmount * scale).toFixed(2));
        add("expense", Math.max(1, amount), rule.category, pick(rule.descriptions), txnDate(m, rndInt(1, 28)), rule.accountKey);
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

    // ── Liability payments ──────────────────────────────────────────────────────
    for (const lp of profile.liabilityPayments) {
      const sourceId = acctMap.get(lp.sourceKey);
      const liabId = acctMap.get(lp.accountKey);
      if (!sourceId || !liabId) continue;
      txns.push({ userId, accountId: sourceId, type: "expense", amount: lp.monthly, category: "Debt Payment", description: lp.desc, date: txnDate(m, 27), source: "manual" });
      txns.push({ userId, accountId: liabId, type: "income", amount: lp.monthly, category: "Debt Payment", description: lp.desc, date: txnDate(m, 27), source: "manual" });
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
      const sSeasonal  = seasonalFactor(ev.cat, month);
      const sYearChar  = yearChars.get(ev.cat)?.[yearIndex] ?? 1.0;
      const sInflation = 1 / Math.pow(1.025, yearIndex);
      const evAmount = Math.max(1, parseFloat((rnd(ev.min, ev.max) * sSeasonal * sYearChar * sInflation).toFixed(2)));
      add("expense", evAmount, ev.cat, pick(ev.descs), txnDate(m, rndInt(1, 28)), profile.payAccountKey);
    }
  }

  return txns;
}

// ── Net worth snapshot builder ────────────────────────────────────────────────

function buildSnapshots(userId: any, profile: DemoProfile, historyMonths: number): any[] {
  const LIABILITY_TYPES = new Set(["credit-card", "line-of-credit", "student-loan", "mortgage", "auto-loan", "personal-loan"]);
  const snapshots: any[] = [];

  // Compute rough asset/liability totals from opening balances
  let baseAssets = 0, baseLiabilities = 0;
  for (const acct of profile.accounts) {
    if (LIABILITY_TYPES.has(acct.type)) baseLiabilities += acct.openingBalance;
    else baseAssets += acct.openingBalance;
  }

  // Generate quarterly snapshots over the full history window
  for (let m = historyMonths; m >= 0; m -= 3) {
    const growthFactor = 1 + (0.005 * (historyMonths - m));
    const paydownFactor = 1 - (0.01 * (historyMonths - m));
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

// ── Seed options ──────────────────────────────────────────────────────────────

export interface SeedOpts {
  /** Custom PRNG — pass mulberry32(n) for deterministic data, omit for Math.random */
  rng?: () => number;
  /** Base date for transaction history — omit to use current date */
  baseDate?: Date;
  /** Years of history to generate: 3–7; defaults to 5 */
  years?: number;
}

// ── Data-only seeder (for an EXISTING user — no User doc created) ─────────────

export async function seedDataForUser(userId: any, profile: DemoProfile, opts?: SeedOpts): Promise<void> {
  _rng = opts?.rng ?? Math.random;
  _now = opts?.baseDate ?? new Date();
  const historyMonths = Math.max(36, Math.min(84, (opts?.years ?? 5) * 12));

  const acctMap = new Map<string, any>();
  for (const def of profile.accounts) {
    const acct = await Account.create({
      userId, name: def.name, type: def.type,
      institution: def.institution, balance: 0, currency: "CAD",
    } as any);
    acctMap.set(def.key, acct._id);
  }

  const txns = buildTransactions(userId, acctMap, profile, historyMonths);
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
  const snapshots = buildSnapshots(userId, profile, historyMonths);
  await NetWorthSnapshot.insertMany(snapshots);
}

// ── Seeder for a single profile ───────────────────────────────────────────────

export async function seedProfile(profile: DemoProfile, passwordHash: string, opts?: SeedOpts): Promise<void> {
  _rng  = opts?.rng      ?? Math.random;
  _now  = opts?.baseDate ?? new Date();
  const historyMonths = Math.max(36, Math.min(84, (opts?.years ?? 5) * 12));

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

  // Create accounts
  const acctMap = new Map<string, any>();
  for (const def of profile.accounts) {
    const acct = await Account.create({
      userId, name: def.name, type: def.type,
      institution: def.institution, balance: 0, currency: "CAD",
    } as any);
    acctMap.set(def.key, acct._id);
  }

  // Insert transactions in bulk
  const txns = buildTransactions(userId, acctMap, profile, historyMonths);
  await Transaction.insertMany(txns);

  // Budgets
  const now = new Date();
  for (const b of profile.budgets) {
    await Budget.create({
      userId, category: b.category, amount: b.amount,
      period: "monthly", isActive: true,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    });
  }

  // Bills
  for (const b of profile.bills) {
    await Bill.create({
      userId, name: b.name, category: b.category,
      amount: b.amount, frequency: "monthly",
      dueDate: b.dueDate, status: "active", isAutoPay: true,
    });
  }

  // Goals
  for (const g of profile.goals) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + g.months);
    await Goal.create({
      userId, name: g.name, category: g.category,
      targetAmount: g.target, currentAmount: g.current,
      targetDate, priority: g.priority || "medium", status: "active",
    });
  }

  // Net worth snapshots
  const snapshots = buildSnapshots(userId, profile, historyMonths);
  await NetWorthSnapshot.insertMany(snapshots);

  console.log(`  ✓  ${profile.email} — ${txns.length} transactions, ${profile.accounts.length} accounts`);
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
    console.log(`✓  ${DEMO_EMAIL} created with "${PROFILES[DEFAULT_PROFILE_INDEX - 1].firstName}'s" profile (3 years of history)`);
  }

  console.log(`\nDone!`);
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: Demo1234!`);
}

// Only run when executed directly (not when imported as a module)
if (require.main === module) {
  main().catch(console.error).finally(() => mongoose.disconnect());
}
