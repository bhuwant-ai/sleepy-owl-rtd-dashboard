/** Display formatting helpers used across the dashboard UI. */
import type { ShelfBucket } from "./calc/shelfLife";

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

export function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

/** DOH / coverage days: null means "no run rate" -> infinite. */
export function fmtDays(n: number | null | undefined): string {
  if (n == null) return "∞";
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-15" -> "15 Sep 2026". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-09-15" -> Date; add days; back to ISO. Used for client-side recompute. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export const BUCKET_META: Record<
  ShelfBucket,
  { label: string; color: string; bg: string; text: string }
> = {
  ABOVE_70: { label: "Above 75%", color: "#15803d", bg: "var(--good-bg)", text: "var(--good)" },
  BETWEEN_50_70: { label: "50–75%", color: "#b45309", bg: "var(--warn-bg)", text: "var(--warn)" },
  BELOW_50: { label: "Below 50%", color: "#b91c1c", bg: "var(--bad-bg)", text: "var(--bad)" },
};

export const COVERAGE_STATUS_LABEL: Record<string, string> = {
  FULLY_CONSUMED: "Sold while >75%",
  PARTIAL_TRANSITION: "Partly aged out",
  FULLY_TRANSITIONED: "Aged out unsold",
  ALREADY_BELOW_70: "Already ≤75%",
};
