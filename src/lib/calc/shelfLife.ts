/**
 * Shelf-life calculations.
 *
 * A batch has a manufacturing date (MFD) and an expiry date (EXP). Its total
 * shelf life is the number of days between them. At any point in time the
 * "remaining shelf life %" is how much of that window is still left.
 *
 *   remaining %  =  (EXP - today) / (EXP - MFD)  x 100
 *
 * We classify inventory into three buckets by remaining %:
 *   - ABOVE_70     : strictly greater than 70%
 *   - BETWEEN_50_70: 50% up to and including 70%
 *   - BELOW_50     : less than 50%
 *
 * (Business decision: inventory at exactly 70.00% is NOT counted as "70%+".
 *  It falls into the 50-70% bucket.)
 */
import { addDays, daysBetween } from "./dates";

/** The single source of truth for the "70%+" threshold, as a fraction. */
export const SEVENTY_PCT = 0.7;

export type ShelfBucket = "ABOVE_70" | "BETWEEN_50_70" | "BELOW_50";

export interface ShelfLifeSnapshot {
  totalDays: number; // EXP - MFD
  elapsedDays: number; // today - MFD
  remainingDays: number; // EXP - today
  remainingPct: number; // 0-100
  bucket: ShelfBucket;
  /** Date the batch first drops to <= 70% (i.e. is no longer "70%+"). */
  date70: Date;
}

/**
 * Compute a full shelf-life snapshot for a batch as of `today`.
 *
 * `totalShelfLifeDays` is optional: when the sheet provides it we prefer the
 * live EXP-MFD span, but fall back to the provided figure if EXP is missing.
 */
export function shelfLifeSnapshot(
  mfd: Date,
  exp: Date | null,
  today: Date,
  totalShelfLifeDaysFallback?: number | null
): ShelfLifeSnapshot {
  const totalDays =
    exp != null ? daysBetween(mfd, exp) : (totalShelfLifeDaysFallback ?? NaN);
  const elapsedDays = daysBetween(mfd, today);
  const remainingDays = totalDays - elapsedDays;
  const remainingPct = totalDays > 0 ? (remainingDays / totalDays) * 100 : NaN;
  return {
    totalDays,
    elapsedDays,
    remainingDays,
    remainingPct,
    bucket: classifyBucket(remainingPct),
    date70: seventyPercentDate(mfd, totalDays),
  };
}

/**
 * The date a batch reaches the 70% threshold — defined as the first calendar
 * day on which its remaining shelf life is <= 70% (i.e. no longer eligible as
 * "70%+" stock).
 *
 * remaining% <= 70%  <=>  elapsed days >= 30% of total shelf life.
 * We take the ceiling so that, e.g., a 273-day batch (30% = 81.9 days) is
 * still >70% on day 81 and first drops to <=70% on day 82.
 */
export function seventyPercentDate(mfd: Date, totalShelfLifeDays: number): Date {
  // Subtract a tiny epsilon before ceil() so that floating-point noise
  // (e.g. 0.3 * 100 === 30.000000000000004) doesn't push a clean whole-day
  // threshold up by an extra day.
  const daysUntil = Math.ceil((1 - SEVENTY_PCT) * totalShelfLifeDays - 1e-9);
  return addDays(mfd, daysUntil);
}

/**
 * Classify a remaining-% figure into a bucket.
 *  > 70        -> ABOVE_70
 *  50 .. 70    -> BETWEEN_50_70   (70 exactly lands here)
 *  < 50        -> BELOW_50
 */
export function classifyBucket(remainingPct: number): ShelfBucket {
  if (remainingPct > 70) return "ABOVE_70";
  if (remainingPct >= 50) return "BETWEEN_50_70";
  return "BELOW_50";
}

export const BUCKET_LABELS: Record<ShelfBucket, string> = {
  ABOVE_70: "Above 70%",
  BETWEEN_50_70: "50%–70%",
  BELOW_50: "Below 50%",
};
