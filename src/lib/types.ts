/** Shared domain types for the RTD dashboard. */

export type Category = "RTD Cans" | "RTD Bottles";
export type LocationType = "JWL" | "VENDOR";
export type InventorySource = "JWL_RACKS" | "LOW_SHELF_LIFE" | "VENDOR_LOTUS";

/** A single batch of stock at a single location, after cleaning/mapping. */
export interface InventoryBatch {
  sku: string; // canonical SKU (e.g. CCC-BLK-230-CAN-C24)
  rootCode: string; // e.g. CCC-BLK-230-CAN
  name: string;
  category: Category;
  locationType: LocationType;
  source: InventorySource;
  location: string; // rack code or "Lotus"
  batchNo: string;
  mfd: Date | null;
  exp: Date | null;
  totalShelfLifeDays: number | null;
  cases: number; // current cases at this location/batch
}

export interface SalesMtd {
  sku: string;
  cases: number;
}

export interface DemandPlanEntry {
  sku: string; // canonical SKU
  rootCode: string;
  category: Category;
  cases: number;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface DataQualityIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  context?: string;
  /** Optional structured figures (e.g. for exclusion summaries). */
  cases?: number;
  count?: number;
}

export interface ParseResult<T> {
  data: T;
  issues: DataQualityIssue[];
}
