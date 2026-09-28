import { describe, it, expect } from "vitest";
import { classifyBucket, seventyPercentDate, shelfLifeSnapshot } from "../shelfLife";
import { formatDate } from "../dates";

describe("classifyBucket — bucket boundaries (75% threshold)", () => {
  it("puts strictly-above-75% into ABOVE_70", () => {
    expect(classifyBucket(75.01)).toBe("ABOVE_70");
    expect(classifyBucket(91)).toBe("ABOVE_70");
  });
  it("puts exactly 75% into the 50-75% bucket (not 75%+)", () => {
    expect(classifyBucket(75)).toBe("BETWEEN_50_70");
  });
  it("puts 70% (below the 75% threshold) into the 50-75% bucket", () => {
    expect(classifyBucket(70)).toBe("BETWEEN_50_70");
  });
  it("puts exactly 50% into the 50-75% bucket", () => {
    expect(classifyBucket(50)).toBe("BETWEEN_50_70");
  });
  it("puts below 50% into BELOW_50", () => {
    expect(classifyBucket(49.99)).toBe("BELOW_50");
    expect(classifyBucket(10)).toBe("BELOW_50");
  });
});

describe("seventyPercentDate (drops to <=75%)", () => {
  it("is MFD + ceil(25% of shelf life)", () => {
    const mfd = new Date(2026, 5, 25); // 25-Jun-2026
    // 273-day shelf life -> 25% = 68.25 -> ceil = 69 days -> 02-Sep-2026
    expect(formatDate(seventyPercentDate(mfd, 273))).toBe("02-Sep-2026");
  });
  it("uses an exact 25% when it lands on a whole day", () => {
    const mfd = new Date(2026, 0, 1); // 01-Jan-2026
    // 100-day shelf life -> 25% = 25 days -> 26-Jan-2026
    expect(formatDate(seventyPercentDate(mfd, 100))).toBe("26-Jan-2026");
  });
});

describe("shelfLifeSnapshot", () => {
  it("computes remaining % live from MFD/EXP and today", () => {
    const mfd = new Date(2026, 6, 22); // 22-Jul-2026
    const exp = new Date(2027, 3, 17); // 17-Apr-2027 (269 days)
    const today = new Date(2026, 8, 10); // 10-Sep-2026 (50 days elapsed)
    const snap = shelfLifeSnapshot(mfd, exp, today);
    expect(snap.totalDays).toBe(269);
    expect(snap.elapsedDays).toBe(50);
    expect(snap.remainingDays).toBe(219);
    expect(Math.round(snap.remainingPct)).toBe(81); // 219/269 = 81.4%
    expect(snap.bucket).toBe("ABOVE_70"); // 81.4% > 75%
  });
});
