import { describe, it, expect } from "vitest";
import {
  COLORS,
  PALETTE,
  CATEGORY_COLORS,
  categoryColor,
  fmtCAD,
  fmtMoney,
  fmtCADShort,
  fmtPct,
  fmtMonth,
} from "../components/charts/ChartTheme";

// ── Colour constants ───────────────────────────────────────────────────────────

describe("COLORS", () => {
  it("income colour is defined", () => {
    expect(COLORS.income).toBeTruthy();
    expect(COLORS.income).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("expense colour is defined", () => {
    expect(COLORS.expense).toBeTruthy();
  });

  it("all required keys are present", () => {
    const required = ["income", "expense", "net", "assets", "liabilities", "savings", "debt", "rrsp", "tfsa"];
    required.forEach((key) => {
      expect(COLORS).toHaveProperty(key);
    });
  });
});

describe("PALETTE", () => {
  it("contains at least 8 colours", () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(8);
  });

  it("each entry is a valid hex colour", () => {
    PALETTE.forEach((colour) => {
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ── categoryColor ─────────────────────────────────────────────────────────────

describe("categoryColor", () => {
  it("returns the named colour for a known category", () => {
    expect(categoryColor("Food & Dining", 0)).toBe(CATEGORY_COLORS["Food & Dining"]);
  });

  it("falls back to palette for an unknown category", () => {
    const result = categoryColor("Unknown Category", 0);
    expect(result).toBe(PALETTE[0]);
  });

  it("wraps palette index using modulo", () => {
    const result = categoryColor("Unknown", PALETTE.length + 2);
    expect(result).toBe(PALETTE[2]);
  });
});

// ── fmtCAD ────────────────────────────────────────────────────────────────────

describe("fmtCAD", () => {
  it("formats a positive number as Canadian dollars with no decimals", () => {
    const result = fmtCAD(1500);
    expect(result).toContain("1,500");
    expect(result).toContain("$");
  });

  it("formats zero as $0 CAD", () => {
    const result = fmtCAD(0);
    expect(result).toContain("0");
    expect(result).toContain("$");
  });

  it("handles NaN / Infinity gracefully (treats as 0)", () => {
    expect(fmtCAD(NaN)).toContain("0");
    expect(fmtCAD(Infinity)).toContain("0");
  });

  it("formats negative numbers", () => {
    const result = fmtCAD(-500);
    expect(result).toContain("500");
    expect(result).toContain("-");
  });
});

// ── fmtMoney ──────────────────────────────────────────────────────────────────

describe("fmtMoney", () => {
  it("formats with exactly 2 decimal places", () => {
    const result = fmtMoney(1234.5);
    expect(result).toContain("1,234.50");
  });

  it("handles zero", () => {
    expect(fmtMoney(0)).toContain("0.00");
  });

  it("handles NaN as 0", () => {
    expect(fmtMoney(NaN)).toContain("0.00");
  });
});

// ── fmtCADShort ───────────────────────────────────────────────────────────────

describe("fmtCADShort", () => {
  it("abbreviates millions with M suffix", () => {
    expect(fmtCADShort(2500000)).toContain("2.5M");
  });

  it("abbreviates ten-thousands with K suffix", () => {
    expect(fmtCADShort(50000)).toContain("50K");
  });

  it("does not abbreviate small numbers", () => {
    const result = fmtCADShort(5000);
    expect(result).not.toContain("K");
    expect(result).toContain("5,000");
  });

  it("handles negative millions", () => {
    expect(fmtCADShort(-1000000)).toContain("-$1.0M");
  });

  it("handles NaN as 0", () => {
    const result = fmtCADShort(NaN);
    expect(result).toContain("0");
  });
});

// ── fmtPct ────────────────────────────────────────────────────────────────────

describe("fmtPct", () => {
  it("formats a percentage with one decimal place", () => {
    expect(fmtPct(12.5)).toBe("12.5%");
  });

  it("formats zero", () => {
    expect(fmtPct(0)).toBe("0.0%");
  });

  it("handles NaN as 0%", () => {
    expect(fmtPct(NaN)).toBe("0.0%");
  });

  it("handles Infinity as 0%", () => {
    expect(fmtPct(Infinity)).toBe("0.0%");
  });
});

// ── fmtMonth ──────────────────────────────────────────────────────────────────

describe("fmtMonth", () => {
  it("parses YYYY-MM format and returns a short-month label", () => {
    const result = fmtMonth("2024-03");
    expect(result).toContain("24");
  });

  it("parses an ISO date string", () => {
    const result = fmtMonth("2024-06-15");
    expect(result).toContain("24");
  });

  it("returns a non-empty string", () => {
    expect(fmtMonth("2023-12").length).toBeGreaterThan(0);
  });
});
