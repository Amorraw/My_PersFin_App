import {
  categorizeTransaction,
  getSuggestedCategory,
  getAvailableCategories,
} from "../utils/categorization";

// ── categorizeTransaction ─────────────────────────────────────────────────────

describe("categorizeTransaction", () => {
  it("returns 'Other Living Expenses' for empty string", () => {
    expect(categorizeTransaction("")).toBe("Other Living Expenses");
  });

  it("returns 'Other Living Expenses' for unrecognised merchant", () => {
    expect(categorizeTransaction("RANDOM MERCHANT XYZ")).toBe("Other Living Expenses");
  });

  it("categorises Walmart as Groceries", () => {
    expect(categorizeTransaction("WALMART GROCERY #123")).toBe("Groceries");
  });

  it("categorises Costco as Groceries", () => {
    expect(categorizeTransaction("COSTCO WHOLESALE")).toBe("Groceries");
  });

  it("categorises Starbucks as Eating Out", () => {
    expect(categorizeTransaction("STARBUCKS COFFEE")).toBe("Eating Out");
  });

  it("categorises DoorDash as Eating Out", () => {
    expect(categorizeTransaction("DOORDASH ORDER 456")).toBe("Eating Out");
  });

  it("categorises Shell as Vehicle Fuel", () => {
    expect(categorizeTransaction("SHELL GASOLINE")).toBe("Vehicle Fuel");
  });

  it("categorises Esso as Vehicle Fuel", () => {
    expect(categorizeTransaction("ESSO FUEL PURCHASE")).toBe("Vehicle Fuel");
  });

  it("categorises Uber as Bus / Taxi / Ride Share", () => {
    expect(categorizeTransaction("UBER TRIP TORONTO")).toBe("Bus / Taxi / Ride Share");
  });

  it("categorises Lyft as Bus / Taxi / Ride Share", () => {
    expect(categorizeTransaction("LYFT RIDE 123")).toBe("Bus / Taxi / Ride Share");
  });

  it("categorises Netflix as Cable / Streaming Services", () => {
    expect(categorizeTransaction("NETFLIX SUBSCRIPTION")).toBe("Cable / Streaming Services");
  });

  it("categorises Spotify as Cable / Streaming Services", () => {
    expect(categorizeTransaction("SPOTIFY PREMIUM")).toBe("Cable / Streaming Services");
  });

  it("categorises BC Hydro as Hydro / Power", () => {
    expect(categorizeTransaction("BC HYDRO PAYMENT")).toBe("Hydro / Power");
  });

  it("categorises Shoppers Drug Mart as Prescriptions", () => {
    expect(categorizeTransaction("SHOPPERS DRUG MART")).toBe("Prescriptions");
  });

  it("categorises ICBC as Vehicle Insurance / Registration", () => {
    expect(categorizeTransaction("ICBC INSURANCE RENEWAL")).toBe("Vehicle Insurance / Registration");
  });

  it("categorises rent payments", () => {
    expect(categorizeTransaction("RENT PAYMENT LANDLORD")).toBe("Rent");
  });

  it("categorises mortgage payments", () => {
    expect(categorizeTransaction("FIRST MORTGAGE PAYMENT")).toBe("First Mortgage");
  });

  it("categorises gym memberships as Fitness Memberships", () => {
    expect(categorizeTransaction("GOODLIFE FITNESS GYM")).toBe("Fitness Memberships");
  });

  it("categorises RRSP contributions", () => {
    expect(categorizeTransaction("RRSP CONTRIBUTION")).toBe("RRSP / TFSA");
  });

  it("categorises TFSA contributions", () => {
    expect(categorizeTransaction("TFSA DEPOSIT")).toBe("RRSP / TFSA");
  });

  it("categorises CRA payments as Income Tax Repayment", () => {
    expect(categorizeTransaction("CRA TAX PAYMENT")).toBe("Income Tax Repayment");
  });

  it("categorises payroll deposits as Full-Time Income", () => {
    expect(categorizeTransaction("PAYROLL DIRECT DEPOSIT")).toBe("Full-Time Income");
  });

  it("is case-insensitive", () => {
    expect(categorizeTransaction("walmart")).toBe("Groceries");
    expect(categorizeTransaction("WALMART")).toBe("Groceries");
    expect(categorizeTransaction("WalMart")).toBe("Groceries");
  });
});

// ── getSuggestedCategory ──────────────────────────────────────────────────────

describe("getSuggestedCategory", () => {
  it("returns the same result as categorizeTransaction", () => {
    const descriptions = [
      "STARBUCKS",
      "SHELL FUEL",
      "NETFLIX",
      "UNKNOWN MERCHANT",
      "",
    ];
    descriptions.forEach((desc) => {
      expect(getSuggestedCategory(desc)).toBe(categorizeTransaction(desc));
    });
  });
});

// ── getAvailableCategories ────────────────────────────────────────────────────

describe("getAvailableCategories", () => {
  it("returns a non-empty sorted array of strings", () => {
    const categories = getAvailableCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach((c) => expect(typeof c).toBe("string"));
  });

  it("is sorted alphabetically", () => {
    const categories = getAvailableCategories();
    const sorted = [...categories].sort((a, b) => a.localeCompare(b));
    expect(categories).toEqual(sorted);
  });

  it("contains no duplicates", () => {
    const categories = getAvailableCategories();
    const unique = new Set(categories);
    expect(unique.size).toBe(categories.length);
  });
});
