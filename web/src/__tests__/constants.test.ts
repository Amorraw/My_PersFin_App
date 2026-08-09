import { describe, it, expect } from "vitest";
import {
  LIABILITY_TYPES,
  DEBT_ACCOUNT_TYPES,
  INVESTMENT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "../utils/constants";

// ── LIABILITY_TYPES ───────────────────────────────────────────────────────────

describe("LIABILITY_TYPES", () => {
  it("contains credit-card", () => expect(LIABILITY_TYPES.has("credit-card")).toBe(true));
  it("contains mortgage", () => expect(LIABILITY_TYPES.has("mortgage")).toBe(true));
  it("contains auto-loan", () => expect(LIABILITY_TYPES.has("auto-loan")).toBe(true));
  it("contains student-loan", () => expect(LIABILITY_TYPES.has("student-loan")).toBe(true));
  it("contains personal-loan", () => expect(LIABILITY_TYPES.has("personal-loan")).toBe(true));
  it("contains line-of-credit", () => expect(LIABILITY_TYPES.has("line-of-credit")).toBe(true));

  it("does not contain chequing (asset)", () => expect(LIABILITY_TYPES.has("chequing")).toBe(false));
  it("does not contain savings (asset)", () => expect(LIABILITY_TYPES.has("savings")).toBe(false));
  it("does not contain tfsa (investment)", () => expect(LIABILITY_TYPES.has("tfsa")).toBe(false));
});

// ── DEBT_ACCOUNT_TYPES ────────────────────────────────────────────────────────

describe("DEBT_ACCOUNT_TYPES", () => {
  it("contains mortgage", () => expect(DEBT_ACCOUNT_TYPES.has("mortgage")).toBe(true));
  it("contains student-loan", () => expect(DEBT_ACCOUNT_TYPES.has("student-loan")).toBe(true));
  it("contains auto-loan", () => expect(DEBT_ACCOUNT_TYPES.has("auto-loan")).toBe(true));
  it("contains personal-loan", () => expect(DEBT_ACCOUNT_TYPES.has("personal-loan")).toBe(true));
  it("contains line-of-credit", () => expect(DEBT_ACCOUNT_TYPES.has("line-of-credit")).toBe(true));

  it("does not contain credit-card (handled separately in UI)", () => {
    expect(DEBT_ACCOUNT_TYPES.has("credit-card")).toBe(false);
  });

  it("does not contain savings", () => expect(DEBT_ACCOUNT_TYPES.has("savings")).toBe(false));
});

// ── INVESTMENT_TYPES ──────────────────────────────────────────────────────────

describe("INVESTMENT_TYPES", () => {
  it("contains tfsa", () => expect(INVESTMENT_TYPES.has("tfsa")).toBe(true));
  it("contains rrsp", () => expect(INVESTMENT_TYPES.has("rrsp")).toBe(true));
  it("contains gic", () => expect(INVESTMENT_TYPES.has("gic")).toBe(true));
  it("contains investment", () => expect(INVESTMENT_TYPES.has("investment")).toBe(true));

  it("does not contain chequing", () => expect(INVESTMENT_TYPES.has("chequing")).toBe(false));
  it("does not contain mortgage", () => expect(INVESTMENT_TYPES.has("mortgage")).toBe(false));
});

// ── ACCOUNT_TYPE_LABELS ───────────────────────────────────────────────────────

describe("ACCOUNT_TYPE_LABELS", () => {
  it("labels chequing correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["chequing"]).toBe("Chequing");
  });

  it("labels credit-card correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["credit-card"]).toBe("Credit Card");
  });

  it("labels tfsa correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["tfsa"]).toBe("TFSA");
  });

  it("labels rrsp correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["rrsp"]).toBe("RRSP");
  });

  it("labels fhsa correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["fhsa"]).toBe("FHSA");
  });

  it("labels mortgage correctly", () => {
    expect(ACCOUNT_TYPE_LABELS["mortgage"]).toBe("Mortgage");
  });

  it("labels line-of-credit as LOC", () => {
    expect(ACCOUNT_TYPE_LABELS["line-of-credit"]).toBe("LOC");
  });

  it("returns undefined for unknown account types", () => {
    expect(ACCOUNT_TYPE_LABELS["nonexistent"]).toBeUndefined();
  });

  it("all values are non-empty strings", () => {
    Object.values(ACCOUNT_TYPE_LABELS).forEach((label) => {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
