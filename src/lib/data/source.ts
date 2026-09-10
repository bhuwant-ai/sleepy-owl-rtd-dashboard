/**
 * Loads the raw data for the dashboard.
 *
 * For the MVP this reads directly from the Google Sheets on every request, so
 * the dashboard always reflects the live sheets. When Supabase is connected,
 * the sync writes this same shape into the database and this loader can read
 * from there instead (the compute layer is unchanged).
 */
import { fetchTabCsv } from "../sheets/client";
import {
  parseInventoryTab,
  parseVendorLotus,
  parseSales,
  parseDemand,
  type InventoryTabFields,
} from "../sheets/parse";
import { SHEETS, getToday } from "../constants";
import { computeDashboard, type DashboardData, type DashboardInput } from "../calc/dashboard";
import { isSupabaseConfigured } from "../supabase/client";
import { loadRaw as loadRawFromDb } from "../supabase/repository";
import type { DataQualityIssue } from "../types";

export const JWL_FIELDS: InventoryTabFields = {
  sku: "SKU",
  category: "Categories",
  mfd: "MFD",
  exp: "EXP",
  batchNo: "Batch No.",
  shelf: "Total Shelf Life(Days)",
  boxes: "Closing Inventory No. Of boxes",
  location: "Location",
  name: "Description",
};

export const LOW_SHELF_FIELDS: InventoryTabFields = {
  sku: "SKU",
  category: "Categories",
  mfd: "MFD",
  exp: "EXP",
  batchNo: "Batch No",
  shelf: "Total Shelf Life(Days)",
  boxes: "Closing Inventory No. of Boxes",
  location: "Location",
  name: "Description",
};

/** Fetch + parse every source tab into the combined dashboard input. */
export async function loadRawFromSheets(): Promise<DashboardInput> {
  const [jwlCsv, lowCsv, lotusCsv, salesCsv, demandCsv] = await Promise.all([
    fetchTabCsv(SHEETS.inventory.id, SHEETS.inventory.tabs.jwlRacks),
    fetchTabCsv(SHEETS.inventory.id, SHEETS.inventory.tabs.lowShelfLife),
    fetchTabCsv(SHEETS.inventory.id, SHEETS.inventory.tabs.vendorLotus),
    fetchTabCsv(SHEETS.inventory.id, SHEETS.inventory.tabs.mtdSales),
    fetchTabCsv(SHEETS.demand.id, SHEETS.demand.tab),
  ]);

  const jwl = parseInventoryTab(jwlCsv, "JWL_RACKS", "JWL", JWL_FIELDS);
  const low = parseInventoryTab(lowCsv, "LOW_SHELF_LIFE", "JWL", LOW_SHELF_FIELDS);
  const lotus = parseVendorLotus(lotusCsv);
  const sales = parseSales(salesCsv);
  const demand = parseDemand(demandCsv);

  return {
    batches: [...jwl.data, ...low.data, ...lotus.data],
    sales: sales.data,
    demand: demand.data,
    issues: [
      ...jwl.issues,
      ...low.issues,
      ...lotus.issues,
      ...sales.issues,
      ...demand.issues,
    ],
  };
}

/**
 * The full dashboard.
 *
 * - If Supabase is configured, read the stored snapshot (fast, decoupled from
 *   sheet availability). If the DB is empty or errors, fall back to the live
 *   sheets so the dashboard always shows something useful.
 * - If Supabase is NOT configured, read the live sheets directly.
 */
export async function getDashboard(): Promise<DashboardData> {
  const today = getToday();

  if (isSupabaseConfigured()) {
    try {
      const raw = await loadRawFromDb();
      if (raw.batches.length === 0) {
        const live = await loadRawFromSheets();
        return computeDashboard(withNote(live, {
          severity: "info",
          code: "DB_EMPTY",
          message: "Database is empty — showing live sheet data. Click “Refresh data” to sync it into Supabase.",
        }), today);
      }
      return computeDashboard(raw, today);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const live = await loadRawFromSheets();
      return computeDashboard(withNote(live, {
        severity: "warning",
        code: "DB_READ_FAILED",
        message: `Could not read Supabase (${msg}) — showing live sheet data instead.`,
      }), today);
    }
  }

  const live = await loadRawFromSheets();
  return computeDashboard(live, today);
}

function withNote(input: DashboardInput, note: DataQualityIssue): DashboardInput {
  return { ...input, issues: [note, ...(input.issues ?? [])] };
}
