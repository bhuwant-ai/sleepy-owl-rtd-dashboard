/**
 * FEFO 70%+ stock-coverage simulation.
 * =====================================
 *
 * THE PROBLEM
 * -----------
 * We want to know: "For how many days can we keep meeting demand using ONLY
 * inventory that is above 70% remaining shelf life?"
 *
 * The naive answer — `current 70%+ inventory / daily run rate` — is WRONG,
 * because some of that inventory will itself drop below 70% (age out) before
 * we ever get to sell it. Those cases must NOT be counted as usable 70%+
 * coverage.
 *
 * THE METHOD (daily simulation, First-Expiry-First-Out)
 * -----------------------------------------------------
 * Starting today, we step forward one day at a time. On each day:
 *   1. Any batch that has crossed below 70% is removed from the usable pool.
 *      Whatever quantity was left in it is recorded as
 *      "transitioned below 70% before consumption".
 *   2. From the batches still above 70%, we consume that day's demand (DRR),
 *      taking from the earliest-expiring batch first (FEFO), spilling over to
 *      the next batch when one is emptied.
 *   3. Repeat until no 70%+ inventory remains.
 *
 * Every case of the starting 70%+ pool therefore ends up either
 *   - CONSUMED while still above 70% (this is the effective usable stock), or
 *   - TRANSITIONED below 70% before we could sell it.
 * so: initial 70%+  =  consumed  +  transitioned.
 *
 * Effective coverage (days)  =  consumed / DRR.
 *
 * Day 1 of the simulation represents "today". A batch that first drops to
 * <=70% `k` days from today is therefore usable on simulation days 1..k.
 *
 * The simulation is intentionally per-SKU: demand for one SKU can only consume
 * that same SKU's inventory. Overall/category figures are obtained by running
 * each SKU separately and adding up the results.
 */
import { addDays, daysBetween } from "./dates";

/** One batch entering the simulation (already known to be a single SKU). */
export interface FefoBatchInput {
  batchId: string;
  cases: number;
  /** Expiry date — drives FEFO ordering (earliest expiry consumed first). */
  expDate: Date;
  /** Date this batch first drops to <=70% remaining shelf life. */
  date70: Date;
}

export type FefoBatchStatus =
  | "ALREADY_BELOW_70" // was <=70% at the start; excluded from the pool
  | "FULLY_CONSUMED" // entirely sold while still above 70%
  | "PARTIAL_TRANSITION" // partly sold, remainder aged below 70%
  | "FULLY_TRANSITIONED"; // never reached before it aged below 70%

export interface FefoBatchResult {
  batchId: string;
  fefoPriority: number | null; // 1 = consumed first; null if excluded
  initialCases: number;
  consumedAbove70: number;
  transitionedBelow70: number;
  date70: Date;
  status: FefoBatchStatus;
}

export interface FefoResult {
  drr: number;
  /** Cases that were strictly above 70% at the start (the usable pool). */
  initialAbove70Cases: number;
  /** Cases already at/below 70% at the start (excluded from the pool). */
  alreadyBelow70Cases: number;
  /** Cases sold while still above 70% — the true usable coverage. */
  consumedAbove70Cases: number;
  /** Cases that aged below 70% before they could be sold. */
  transitionedCases: number;
  /** consumed / DRR. Infinity when there is no demand. */
  effectiveCoverageDays: number;
  /** Approximate date the 70%+ pool is exhausted (null if never / no demand). */
  coverageEndDate: Date | null;
  batches: FefoBatchResult[];
}

const MAX_SIM_DAYS = 4000; // safety valve (~11 years) so we never loop forever.
const EPS = 1e-9;

/**
 * Run the daily FEFO simulation for a single SKU.
 *
 * @param batchesIn  the SKU's batches (any location mix the caller decided to include)
 * @param drr        daily run rate in cases/day (>= 0)
 * @param today      the reference "today"
 */
export function simulateFefoCoverage(
  batchesIn: FefoBatchInput[],
  drr: number,
  today: Date
): FefoResult {
  // ---- 1. Split into the starting 70%+ pool vs. already-below-70% ----------
  // daysAbove70 = how many days (starting today) the batch stays > 70%.
  // If its 70% date is today or earlier, it is already <=70% -> excluded.
  type Work = FefoBatchInput & {
    remaining: number;
    daysAbove70: number;
    consumed: number;
    transitioned: number;
    eligible: boolean;
    priority: number | null;
  };

  const work: Work[] = batchesIn.map((b) => {
    const daysAbove70 = daysBetween(today, b.date70); // >0 means still eligible today
    return {
      ...b,
      remaining: b.cases,
      daysAbove70,
      consumed: 0,
      transitioned: 0,
      eligible: daysAbove70 >= 1 && b.cases > EPS,
      priority: null,
    };
  });

  const alreadyBelow70Cases = sum(work.filter((w) => !w.eligible && w.daysAbove70 < 1).map((w) => w.cases));
  const pool = work.filter((w) => w.eligible);
  const initialAbove70Cases = sum(pool.map((w) => w.cases));

  // ---- 2. FEFO ordering: earliest expiry first, then earliest 70% date -----
  pool.sort((a, b) => {
    const e = a.expDate.getTime() - b.expDate.getTime();
    if (e !== 0) return e;
    const t = a.date70.getTime() - b.date70.getTime();
    if (t !== 0) return t;
    return a.batchId.localeCompare(b.batchId);
  });
  pool.forEach((w, i) => (w.priority = i + 1));

  // No demand -> the 70%+ pool is never consumed; coverage is effectively
  // unbounded for the purposes of this metric.
  if (drr <= EPS) {
    return finalize(work, pool, {
      drr,
      initialAbove70Cases,
      alreadyBelow70Cases,
      consumedAbove70Cases: 0,
      transitionedCases: 0,
      effectiveCoverageDays: Infinity,
      coverageEndDate: null,
    });
  }

  // ---- 3. Step forward one day at a time -----------------------------------
  for (let day = 1; day <= MAX_SIM_DAYS; day++) {
    // 3a. Retire batches that have crossed below 70% before this day.
    for (const w of pool) {
      if (w.remaining > EPS && w.daysAbove70 < day) {
        w.transitioned += w.remaining;
        w.remaining = 0;
      }
    }

    // 3b. Whatever is still eligible and has stock is available today.
    const available = pool.filter((w) => w.remaining > EPS && w.daysAbove70 >= day);
    if (available.length === 0) break; // pool exhausted -> coverage ends

    // 3c. Consume the day's demand in FEFO order (pool is already sorted).
    let demandLeft = drr;
    for (const w of available) {
      if (demandLeft <= EPS) break;
      const take = Math.min(w.remaining, demandLeft);
      w.remaining -= take;
      w.consumed += take;
      demandLeft -= take;
    }
    // If we could not fully cover today's demand, this was the last (partial)
    // day of coverage — stop.
    if (demandLeft > EPS) break;
  }

  const consumedAbove70Cases = sum(pool.map((w) => w.consumed));
  const transitionedCases = sum(pool.map((w) => w.transitioned));
  const effectiveCoverageDays = consumedAbove70Cases / drr;
  const coverageEndDate = addDays(today, Math.floor(effectiveCoverageDays));

  return finalize(work, pool, {
    drr,
    initialAbove70Cases,
    alreadyBelow70Cases,
    consumedAbove70Cases,
    transitionedCases,
    effectiveCoverageDays,
    coverageEndDate,
  });
}

// -------------------------------------------------------------------------
function finalize(
  work: Array<{
    batchId: string;
    cases: number;
    date70: Date;
    consumed: number;
    transitioned: number;
    eligible: boolean;
    priority: number | null;
  }>,
  _pool: unknown,
  summary: Omit<FefoResult, "batches">
): FefoResult {
  const batches: FefoBatchResult[] = work.map((w) => ({
    batchId: w.batchId,
    fefoPriority: w.priority,
    initialCases: w.cases,
    consumedAbove70: round2(w.consumed),
    transitionedBelow70: round2(w.transitioned),
    date70: w.date70,
    status: statusOf(w),
  }));
  return { ...summary, batches };
}

function statusOf(w: {
  cases: number;
  consumed: number;
  transitioned: number;
  eligible: boolean;
}): FefoBatchStatus {
  if (!w.eligible) return "ALREADY_BELOW_70";
  if (w.transitioned <= EPS) return "FULLY_CONSUMED";
  if (w.consumed <= EPS) return "FULLY_TRANSITIONED";
  return "PARTIAL_TRANSITION";
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
