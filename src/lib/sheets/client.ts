/**
 * Reads Google Sheets as a full Excel (.xlsx) export.
 *
 * Why xlsx and not CSV: the CSV / gviz export only returns the rows currently
 * VISIBLE after any filter on a tab, so a filter would silently hide data. The
 * xlsx export contains every row regardless of filters or hidden rows, which
 * makes the dashboard robust to however the team filters/sorts the sheets.
 *
 * Requires the sheet to be shared as "Anyone with the link" (current setup).
 * When we later switch to a private service account, only this file changes.
 */
import * as XLSX from "xlsx";

/** Download a whole spreadsheet as a parsed workbook (all tabs, all rows). */
export async function loadWorkbook(sheetId: string): Promise<XLSX.WorkBook> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  // Google returns a 307 redirect to a download host — fetch() follows it.
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `Failed to download the workbook (HTTP ${res.status}). Check the sheet is shared as "Anyone with the link".`
    );
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error("Workbook download was empty.");
  return XLSX.read(buf, { type: "array" });
}

function normalizeName(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Resolve a requested tab name to the workbook's actual sheet name, tolerating
 * differences in punctuation/spacing (e.g. "Sep'26 RTD DP" vs "Sep26 RTD DP").
 */
export function resolveSheetName(wb: XLSX.WorkBook, requested: string): string | null {
  if (wb.SheetNames.includes(requested)) return requested;
  const t = requested.trim();
  const byTrim = wb.SheetNames.find((n) => n.trim() === t);
  if (byTrim) return byTrim;
  const norm = normalizeName(requested);
  return wb.SheetNames.find((n) => normalizeName(n) === norm) ?? null;
}

/**
 * Return a tab as an array-of-arrays of strings (full data, all rows). Dates
 * are rendered in an unambiguous "dd-MMM-yyyy" format so they parse reliably.
 */
export function sheetToRows(wb: XLSX.WorkBook, tabName: string): string[][] {
  const name = resolveSheetName(wb, tabName);
  if (!name) {
    throw new Error(`Tab "${tabName}" not found. Available tabs: ${wb.SheetNames.join(", ")}`);
  }
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false, // render values as strings using their cell format
    dateNF: "dd-mmm-yyyy", // force an unambiguous date format
    defval: "",
    blankrows: false,
  });
  return aoa.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : []));
}
