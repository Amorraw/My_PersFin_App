import { describe, it, expect } from "vitest";
import { fmtPctSigned, fmtDate, fmtPctRatio } from "../utils/formatters";

// ── fmtPctSigned ──────────────────────────────────────────────────────────────

describe("fmtPctSigned", () => {
  it("prefixes positive values with '+'", () => {
    expect(fmtPctSigned(5.2)).toBe("+5.2%");
  });

  it("prefixes negative values with '-'", () => {
    expect(fmtPctSigned(-3.7)).toBe("-3.7%");
  });

  it("returns '+0.0%' for zero", () => {
    expect(fmtPctSigned(0)).toBe("+0.0%");
  });

  it("respects custom decimal precision", () => {
    expect(fmtPctSigned(1.23456, 3)).toBe("+1.235%");
  });

  it("handles NaN as +0.0%", () => {
    expect(fmtPctSigned(NaN)).toBe("+0.0%");
  });

  it("handles Infinity as +0.0%", () => {
    expect(fmtPctSigned(Infinity)).toBe("+0.0%");
  });
});

// ── fmtDate ───────────────────────────────────────────────────────────────────

describe("fmtDate", () => {
  it("formats a Date object into a readable string", () => {
    const date = new Date("2024-06-15");
    const result = fmtDate(date);
    expect(result).toContain("2024");
    expect(result.length).toBeGreaterThan(4);
  });

  it("formats an ISO date string", () => {
    const result = fmtDate("2024-01-20");
    expect(result).toContain("2024");
  });

  it("includes a short month abbreviation", () => {
    const result = fmtDate("2024-03-05");
    expect(result).toContain("Mar");
  });

  it("includes a numeric day", () => {
    // Use a local-time Date to avoid UTC midnight timezone shifting the day
    const result = fmtDate(new Date(2024, 5, 8)); // June 8, 2024 local time
    expect(result).toContain("8");
  });
});

// ── fmtPctRatio ───────────────────────────────────────────────────────────────

describe("fmtPctRatio", () => {
  it("converts decimal ratio to percentage string", () => {
    expect(fmtPctRatio(0.26)).toBe("26.00%");
  });

  it("converts 1.0 to 100.00%", () => {
    expect(fmtPctRatio(1.0)).toBe("100.00%");
  });

  it("converts 0 to 0.00%", () => {
    expect(fmtPctRatio(0)).toBe("0.00%");
  });

  it("respects custom decimal precision", () => {
    expect(fmtPctRatio(0.333, 1)).toBe("33.3%");
  });

  it("handles NaN as 0.00%", () => {
    expect(fmtPctRatio(NaN)).toBe("0.00%");
  });

  it("handles values greater than 1 (>100%)", () => {
    expect(fmtPctRatio(1.5)).toBe("150.00%");
  });
});
