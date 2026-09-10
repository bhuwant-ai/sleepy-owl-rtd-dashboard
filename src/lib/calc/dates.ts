/**
 * Date helpers for the RTD dashboard.
 *
 * All shelf-life math ultimately depends on parsing the manufacturing (MFD)
 * and expiry (EXP) dates that come from the Google Sheets, and on counting
 * whole calendar days between dates. We keep every bit of that logic here so
 * it is easy to read, test and reason about.
 */
import { parse, isValid, differenceInCalendarDays, addDays as dfAddDays } from "date-fns";

/**
 * The date formats we have actually seen in the source sheets, most-specific
 * first. MFD / EXP are written like "01-Apr-2026" or "1-Jan-2026". Inward
 * dates sometimes look like "03-09-2026" (day-month-year).
 */
const DATE_FORMATS = [
  "dd-MMM-yyyy",
  "d-MMM-yyyy",
  "dd-MM-yyyy",
  "d-M-yyyy",
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "d/M/yyyy",
];

/**
 * Parse a date string coming from a sheet cell. Returns `null` when the value
 * is blank or cannot be understood, so callers can flag a data-quality issue
 * instead of silently using a wrong date.
 *
 * Excel/Sheets sometimes exports an empty date cell as "30-Dec-1899" (the
 * spreadsheet epoch). We treat any year before 2000 as "missing".
 */
export function parseSheetDate(input: string | null | undefined): Date | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;

  for (const fmt of DATE_FORMATS) {
    const d = parse(s, fmt, new Date(2000, 0, 1));
    if (isValid(d) && d.getFullYear() >= 2000 && d.getFullYear() < 2100) {
      return normalize(d);
    }
  }

  // Last resort: let the JS engine try.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    if (d.getFullYear() >= 2000 && d.getFullYear() < 2100) return normalize(d);
  }
  return null;
}

/** Strip the time component so every date is anchored at local midnight. */
export function normalize(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `from` to `to` (positive if `to` is later). */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(normalize(to), normalize(from));
}

/** Return a new date `n` days after `d`. */
export function addDays(d: Date, n: number): Date {
  return normalize(dfAddDays(normalize(d), n));
}

/** Number of days in the calendar month that `d` falls in (28-31). */
export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** First day of the month `d` falls in. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Format as e.g. "15-Sep-2026" for display. Returns "—" for null. */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}
