import { describe, it, expect } from "vitest";
import { getMonthContext, salesDrr, demandDrr, doh } from "../drr";

describe("getMonthContext", () => {
  it("counts elapsed days as completed days excluding today", () => {
    const ctx = getMonthContext(new Date(2026, 8, 10)); // 10-Sep-2026
    expect(ctx.elapsedDays).toBe(9);
    expect(ctx.daysInMonth).toBe(30); // September
    expect(ctx.monthLabel).toBe("Sep 2026");
  });
  it("never returns 0 elapsed days (guards the 1st of the month)", () => {
    const ctx = getMonthContext(new Date(2026, 8, 1));
    expect(ctx.elapsedDays).toBe(1);
  });
});

describe("salesDrr", () => {
  it("divides MTD sales by elapsed days", () => {
    expect(salesDrr(1078, 9)).toBeCloseTo(119.78, 2); // CCC-HAZ example
  });
  it("returns 0 when there are no sales", () => {
    expect(salesDrr(0, 9)).toBe(0);
  });
});

describe("demandDrr", () => {
  it("divides monthly demand by days in the month", () => {
    expect(demandDrr(3055, 30)).toBeCloseTo(101.83, 2); // CCC-HAZ demand
  });
});

describe("doh", () => {
  it("divides inventory by DRR", () => {
    expect(doh(1985, 119.78)).toBeCloseTo(16.57, 2);
  });
  it("returns Infinity when DRR is 0", () => {
    expect(doh(500, 0)).toBe(Infinity);
  });
});
