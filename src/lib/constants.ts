/**
 * Project configuration and the SKU master.
 *
 * The SKU master is the single place that defines the 12 RTD products we
 * track, and it is the bridge between the two Google Sheets, which use
 * different code suffixes:
 *   - Inventory / Sales sheets use  -C24 (cans) / -C12 (bottles)
 *   - Demand Plan sheet uses        -ONE
 * Both share the same 4-part "root" code (e.g. CCC-BLK-230-CAN), so we match
 * on the root and attach the canonical -C24/-C12 code here.
 */
import type { Category } from "./types";

export interface SkuMasterEntry {
  root: string;
  sku: string; // canonical code
  name: string;
  category: Category;
  unitsPerCase: number;
  casesPerBatch: number; // production batch size (cases) — used by Production planning
}

export const SKU_MASTER: SkuMasterEntry[] = [
  // ----- RTD Cans (24 units / case) -----
  { root: "CCC-BEL-230-CAN", sku: "CCC-BEL-230-CAN-C24", name: "Cold Coffee Can Belgian Mocha 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "CCC-BLK-230-CAN", sku: "CCC-BLK-230-CAN-C24", name: "Cold Brew Black Coffee Can 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 400 },
  { root: "CCC-CLA-230-CAN", sku: "CCC-CLA-230-CAN-C24", name: "Cold Coffee Can Classic 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "CCC-FVA-230-CAN", sku: "CCC-FVA-230-CAN-C24", name: "Cold Coffee Can French Vanilla 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "CCC-HAZ-230-CAN", sku: "CCC-HAZ-230-CAN-C24", name: "Cold Coffee Can Hazelnut 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "CCC-LAT-230-CAN", sku: "CCC-LAT-230-CAN-C24", name: "Cold Coffee Can Caramel Latte 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "CCC-VIE-230-CAN", sku: "CCC-VIE-230-CAN-C24", name: "Cold Coffee Can Vietnamese 230ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "RMC-CLA-220-CAN", sku: "RMC-CLA-220-CAN-C24", name: "Cold Matcha Can Classic 220ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "RMC-MAN-220-CAN", sku: "RMC-MAN-220-CAN-C24", name: "Cold Matcha Can Mango 220ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  { root: "RMC-VAN-220-CAN", sku: "RMC-VAN-220-CAN-C24", name: "Cold Matcha Can Vanilla 220ml", category: "RTD Cans", unitsPerCase: 24, casesPerBatch: 646 },
  // ----- RTD Bottles (12 units / case) -----
  { root: "RTD-CLA-200-BTL", sku: "RTD-CLA-200-BTL-C12", name: "Ready to Drink Classic 200ml", category: "RTD Bottles", unitsPerCase: 12, casesPerBatch: 800 },
  { root: "RTD-HAZ-200-BTL", sku: "RTD-HAZ-200-BTL-C12", name: "Ready to Drink Hazelnut 200ml", category: "RTD Bottles", unitsPerCase: 12, casesPerBatch: 800 },
];

/** Pack suffixes that represent the standard single-unit case we track.
 *  Anything else (C04, P04, C08, ...) is a multipack we deliberately exclude. */
export const STANDARD_PACK_SUFFIXES = new Set(["C24", "C12", "ONE", ""]);

/** Google Sheets sources. IDs are safe to keep in code (they are not secrets;
 *  access is controlled by the sheet's own sharing settings). */
export const SHEETS = {
  inventory: {
    id: "17uIGo_Dg5mWn1ghG-HeFioUz7Pl8VajEFOj4rJ_Kzv4",
    tabs: {
      jwlRacks: "JWL Racks Stock Count",
      lowShelfLife: "Low Shelf Life",
      vendorLotus: "RTD at Lotus",
      mtdSales: "MTD Sales",
    },
  },
  demand: {
    id: "1IeakZzwmqVnNFuZ6AYxtWXi_0dluU3FtkP8JRBNGVRg",
    // NOTE: the demand workbook/tab is named per-month. Update this each month
    // (or set DEMAND_TAB in the environment to override).
    tab: process.env.DEMAND_TAB || "Oct26 RTD DP",
  },
} as const;

/** The remaining-shelf-life threshold for "75%+" stock, as a percentage. */
export const SHELF_LIFE_THRESHOLD_PCT = 75;

/**
 * The "today" that drives every time-based calculation.
 * Override with DASHBOARD_TODAY=YYYY-MM-DD for testing/backdating.
 */
export function getToday(): Date {
  const override = process.env.DASHBOARD_TODAY;
  if (override) {
    const [y, m, d] = override.split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
