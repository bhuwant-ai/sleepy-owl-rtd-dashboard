/**
 * Reads a single tab from a Google Sheet as CSV text.
 *
 * We use the public "gviz" CSV export endpoint, which works as long as the
 * sheet is shared with "Anyone with the link" (the current setup). No API key
 * or login is required. When we later switch to a private service account,
 * only this file needs to change.
 */
export async function fetchTabCsv(sheetId: string, tabName: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tabName
  )}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to read tab "${tabName}" (HTTP ${res.status}). Check the sheet is shared as "Anyone with the link" and the tab name is correct.`
    );
  }
  const text = await res.text();
  // A private sheet returns an HTML sign-in page instead of CSV.
  if (text.trimStart().toLowerCase().startsWith("<!doctype html") || text.includes("<html")) {
    throw new Error(
      `Tab "${tabName}" did not return CSV — the sheet is probably not shared publicly.`
    );
  }
  return text;
}
