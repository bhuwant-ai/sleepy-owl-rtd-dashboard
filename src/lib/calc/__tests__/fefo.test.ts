/**
 * Tests for the FEFO 70%+ coverage simulation.
 * These mirror the exact scenarios in the project brief (Tests 1-6).
 */
import { describe, it, expect } from "vitest";
import { simulateFefoCoverage, type FefoBatchInput, type FefoBatchResult } from "../fefo";
import { addDays } from "../dates";

const TODAY = new Date(2026, 8, 10); // 10-Sep-2026 (month is 0-based)

/**
 * Build a batch.
 * @param daysAbove70  how many days from today it stays strictly > 70%
 *                     (0 or negative => already at/below 70% today)
 * @param expOffset    expiry offset in days from today (controls FEFO order)
 */
function batch(id: string, cases: number, daysAbove70: number, expOffset: number): FefoBatchInput {
  return {
    batchId: id,
    cases,
    date70: addDays(TODAY, daysAbove70),
    expDate: addDays(TODAY, expOffset),
  };
}

function find(batches: FefoBatchResult[], id: string): FefoBatchResult {
  const b = batches.find((x) => x.batchId === id);
  if (!b) throw new Error(`batch ${id} not found`);
  return b;
}

describe("Test 1 — simple coverage (nothing ages out before it is sold)", () => {
  it("matches the naive inventory / DRR result", () => {
    const r = simulateFefoCoverage([batch("A", 1000, 100, 100)], 50, TODAY);
    expect(r.initialAbove70Cases).toBe(1000);
    expect(r.consumedAbove70Cases).toBe(1000);
    expect(r.transitionedCases).toBe(0);
    expect(r.effectiveCoverageDays).toBe(20); // 1000 / 50
    expect(find(r.batches, "A").status).toBe("FULLY_CONSUMED");
  });
});

describe("Test 2 — the worked example from the brief", () => {
  // DRR 50/day. Batch A: 500 cases, below-70% in 2 days (earliest expiry).
  //             Batch B: 1500 cases, below-70% in 30 days.
  const r = simulateFefoCoverage(
    [batch("A", 500, 2, 10), batch("B", 1500, 30, 200)],
    50,
    TODAY
  );

  it("keeps physical vs usable inventory distinct", () => {
    expect(r.initialAbove70Cases).toBe(2000);
  });
  it("counts only stock sold while above 70% as usable", () => {
    expect(r.consumedAbove70Cases).toBe(1500);
  });
  it("records stock that aged below 70% before it could be sold", () => {
    expect(r.transitionedCases).toBe(500);
  });
  it("gives 30 days of coverage (NOT the naive 2000/50 = 40)", () => {
    expect(r.effectiveCoverageDays).toBe(30);
  });
  it("splits batch A into 100 sold + 400 aged out", () => {
    const a = find(r.batches, "A");
    expect(a.fefoPriority).toBe(1);
    expect(a.consumedAbove70).toBe(100);
    expect(a.transitionedBelow70).toBe(400);
    expect(a.status).toBe("PARTIAL_TRANSITION");
  });
  it("splits batch B into 1400 sold + 100 aged out", () => {
    const b = find(r.batches, "B");
    expect(b.fefoPriority).toBe(2);
    expect(b.consumedAbove70).toBe(1400);
    expect(b.transitionedBelow70).toBe(100);
  });
});

describe("Test 3 — multiple batches with different dates", () => {
  it("consumes FEFO and reconciles consumed + transitioned = initial", () => {
    const r = simulateFefoCoverage(
      [
        batch("X", 200, 1, 5), // ages out first
        batch("Y", 300, 3, 10),
        batch("Z", 400, 10, 20),
      ],
      100,
      TODAY
    );
    expect(r.initialAbove70Cases).toBe(900);
    expect(r.consumedAbove70Cases).toBe(700);
    expect(r.transitionedCases).toBe(200);
    // conservation law: nothing is created or lost
    expect(r.consumedAbove70Cases + r.transitionedCases).toBe(r.initialAbove70Cases);
    expect(r.effectiveCoverageDays).toBe(7); // 700 / 100

    expect(find(r.batches, "X").consumedAbove70).toBe(100);
    expect(find(r.batches, "X").transitionedBelow70).toBe(100);
    expect(find(r.batches, "Y").consumedAbove70).toBe(200);
    expect(find(r.batches, "Y").transitionedBelow70).toBe(100);
    expect(find(r.batches, "Z").consumedAbove70).toBe(400);
    expect(find(r.batches, "Z").transitionedBelow70).toBe(0);
  });
});

describe("Test 4 — partial consumption spills across batches in one day", () => {
  it("consumes 30 from batch 1 then 20 from batch 2 to satisfy DRR of 50", () => {
    const r = simulateFefoCoverage(
      [batch("B1", 30, 100, 5), batch("B2", 100, 100, 10)],
      50,
      TODAY
    );
    expect(r.consumedAbove70Cases).toBe(130);
    expect(r.transitionedCases).toBe(0);
    expect(find(r.batches, "B1").consumedAbove70).toBe(30);
    expect(find(r.batches, "B2").consumedAbove70).toBe(100);
    // 130 / 50 = 2.6 days of coverage
    expect(r.effectiveCoverageDays).toBeCloseTo(2.6, 5);
  });
});

describe("Test 5 — a batch already below 70% is excluded from the start", () => {
  it("does not count already-below-70% stock in the usable pool", () => {
    const r = simulateFefoCoverage(
      [
        batch("OLD", 500, 0, 1), // exactly at 70% today -> excluded
        batch("PAST", 300, -5, 1), // already past 70% -> excluded
        batch("GOOD", 500, 50, 10),
      ],
      50,
      TODAY
    );
    expect(r.initialAbove70Cases).toBe(500); // only GOOD
    expect(r.alreadyBelow70Cases).toBe(800); // OLD + PAST
    expect(r.consumedAbove70Cases).toBe(500);
    expect(r.transitionedCases).toBe(0);
    expect(r.effectiveCoverageDays).toBe(10);
    expect(find(r.batches, "OLD").status).toBe("ALREADY_BELOW_70");
    expect(find(r.batches, "PAST").status).toBe("ALREADY_BELOW_70");
    expect(find(r.batches, "OLD").fefoPriority).toBeNull();
  });
});

describe("Test 6 — exactly 70% is treated as NOT eligible (strictly above 70%)", () => {
  it("excludes a batch whose 70% date is today", () => {
    const r = simulateFefoCoverage([batch("EXACT", 1000, 0, 5)], 50, TODAY);
    expect(r.initialAbove70Cases).toBe(0);
    expect(r.alreadyBelow70Cases).toBe(1000);
    expect(r.consumedAbove70Cases).toBe(0);
    expect(find(r.batches, "EXACT").status).toBe("ALREADY_BELOW_70");
  });
});

describe("Edge case — no demand means unbounded coverage", () => {
  it("returns Infinity coverage and consumes nothing when DRR is 0", () => {
    const r = simulateFefoCoverage([batch("A", 1000, 100, 5)], 0, TODAY);
    expect(r.effectiveCoverageDays).toBe(Infinity);
    expect(r.consumedAbove70Cases).toBe(0);
    expect(r.coverageEndDate).toBeNull();
  });
});
