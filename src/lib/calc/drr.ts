/**
 * DRR (Daily Run Rate) and DOH (Days of Inventory On Hand).
 *
 * Two DRR methods (kept clearly separate everywhere in the app):
 *
 *   Sales-based DRR   = MTD sales cases / elapsed days in the current month
 *   Demand-plan DRR   = current-month demand cases / days in the current month
 *
 * Business decision: "elapsed days" = completed days, EXCLUDING today
 * (so on the 10th of the month, elapsed = 9).
 *
 * DOH = current inventory cases / DRR   (JWL-only inventory, per decision).
 */
import { daysInMonth } from "./dates";

export interface MonthContext {
  today: Date;
  monthLabel: string; // e.g. "Sep 2026"
  elapsedDays: number; // completed days excluding today (>= 1)
  daysInMonth: number; // calendar days in the month
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function getMonthContext(today: Date): MonthContext {
  const elapsed = Math.max(1, today.getDate() - 1); // exclude today; never 0
  return {
    today,
    monthLabel: `${MONTHS[today.getMonth()]} ${today.getFullYear()}`,
    elapsedDays: elapsed,
    daysInMonth: daysInMonth(today),
  };
}

/** Sales-based DRR (cases/day). Returns 0 when there are no sales. */
export function salesDrr(mtdCases: number, elapsedDays: number): number {
  if (elapsedDays <= 0) return 0;
  return mtdCases / elapsedDays;
}

/** Demand-plan DRR (cases/day). Returns 0 when there is no demand. */
export function demandDrr(demandCases: number, daysInMonthCount: number): number {
  if (daysInMonthCount <= 0) return 0;
  return demandCases / daysInMonthCount;
}

/**
 * DOH = inventory / DRR. Returns Infinity when DRR is 0 (nothing being sold),
 * which the UI renders as "∞".
 */
export function doh(inventoryCases: number, drr: number): number {
  if (drr <= 0) return Infinity;
  return inventoryCases / drr;
}
