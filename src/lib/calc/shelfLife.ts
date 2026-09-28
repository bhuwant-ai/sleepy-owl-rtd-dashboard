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
 *   - ABOVE_70     : strictly greater than 75%   ("75%+" good stock)
 *   - BETWEEN_50_70: 50% up to and including 75%
 *   - BELOW_50     : less than 50%
 *
 * (Business decision: inventory at exactly 75.00% is NOT counted as "75%+".
 *  It falls into the 50-75% bucket.)
 *
 * NOTE: the enum keys (ABOVE_70, BETWEEN_50_70) are historical identifiers and
 * are kept stable across threshold changes; only the numeric threshold and the
 * human labels move. Change SHELF_THRESHOLD_PCT below to retune the constraint.
 */
import { addDays, daysBetween } from "./dates";

/**
 * The single source of truth for the "good stock" shelf-life threshold, as a
 * percentage. Stock with strictly MORE than this % of shelf life remaining is
 * counted as "75%+" (the eligible pool for coverage, supply and production).
 */
export const SHELF_THRESHOLD_PCT = 75;
/** Lower boundary of the middle ("watch") bucket, as a percentage. */
export const MID_BUCKET_FLOOR_PCT = 50;
/** The threshold expressed as a fraction (0-1). */
const THRESHOLD_FRACTION = SHELF_THRESHOLD_PCT / 100;

export type ShelfBucket = "ABOVE_70" | "BETWEEN_50_70" | "BELOW_50";

export interface ShelfLifeSnapshot {
  totalDays: number; // EXP - MFD
  elapsedDays: number; // today - MFD
  remainingDays: number; // EXP - today
  remainingPct: number; // 0-100
  bucket: ShelfBucket;
  /** Date the batch first drops to <= threshold (i.e. is no longer "75%+"). */
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
 * The date a batch reaches the threshold — defined as the first calendar day
 * on which its remaining shelf life is <= the threshold (i.e. no longer
 * eligible as "75%+" stock).
 *
 * remaining% <= 75%  <=>  elapsed days >= 25% of total shelf life.
 * We take the ceiling so that, e.g., a 273-day batch (25% = 68.25 days) is
 * still >75% on day 68 and first drops to <=75% on day 69.
 */
export function seventyPercentDate(mfd: Date, totalShelfLifeDays: number): Date {
  // Subtract a tiny epsilon before ceil() so that floating-point noise
  // (e.g. 0.25 * 100 === 25.000000000000004) doesn't push a clean whole-day
  // threshold up by an extra day.
  const daysUntil = Math.ceil((1 - THRESHOLD_FRACTION) * totalShelfLifeDays - 1e-9);
  return addDays(mfd, daysUntil);
}

/**
 * Classify a remaining-% figure into a bucket.
 *  > 75        -> ABOVE_70        ("75%+")
 *  50 .. 75    -> BETWEEN_50_70   (75 exactly lands here)
 *  < 50        -> BELOW_50
 */
export function classifyBucket(remainingPct: number): ShelfBucket {
  if (remainingPct > SHELF_THRESHOLD_PCT) return "ABOVE_70";
  if (remainingPct >= MID_BUCKET_FLOOR_PCT) return "BETWEEN_50_70";
  return "BELOW_50";
}

export const BUCKET_LABELS: Record<ShelfBucket, string> = {
  ABOVE_70: `Above ${SHELF_THRESHOLD_PCT}%`,
  BETWEEN_50_70: `${MID_BUCKET_FLOOR_PCT}%–${SHELF_THRESHOLD_PCT}%`,
  BELOW_50: `Below ${MID_BUCKET_FLOOR_PCT}%`,
};
