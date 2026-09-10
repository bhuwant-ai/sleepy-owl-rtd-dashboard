/**
 * Parsers that turn raw sheet CSV text into clean, SKU-mapped domain objects.
 *
 * These functions are PURE (CSV string in, data + issues out) so they can be
 * unit-tested against saved snapshots without any network access. The network
 * fetching lives separately in ./client.ts.
 */
import Papa from "papaparse";
import { parseSheetDate } from "../calc/dates";
import { resolveSku, isExcludedMultipack, normalizeCategory } from "../sku";
import type {
  InventoryBatch,
  SalesMtd,
  DemandPlanEntry,
  DataQualityIssue,
  ParseResult,
  InventorySource,
  LocationType,
} from "../types";
import { SKU_MASTER } from "../constants";

// ---------- small helpers -------------------------------------------------
function rows(csv: string): string[][] {
  return Papa.parse<string[]>(csv, { skipEmptyLines: false }).data.filter(Boolean);
}
function objects(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  }).data;
}
/** Parse a number that may contain commas/spaces. Blank -> 0. */
function num(v: string | undefined | null): number {
  if (v == null) return 0;
  const cleaned = String(v).replace(/[, ]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: string | undefined | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- inventory tabs (JWL Racks, Low Shelf Life) --------------------
export interface InventoryTabFields {
  sku: string;
  category: string;
  mfd: string;
  exp: string;
  batchNo: string;
  shelf: string;
  boxes: string; // closing / available boxes (= cases)
  location: string;
  name: string;
}

export function parseInventoryTab(
  csv: string,
  source: InventorySource,
  locationType: LocationType,
  f: InventoryTabFields
): ParseResult<InventoryBatch[]> {
  const issues: DataQualityIssue[] = [];
  const out: InventoryBatch[] = [];

  for (const row of objects(csv)) {
    const rawSku = (row[f.sku] || "").trim();
    if (!rawSku) continue;

    // Include a row when its SKU maps to a tracked product. This is robust to
    // a blank/"#N/A" category cell. We only look at the category column to
    // decide whether an UNMAPPED code is worth warning about (i.e. it looked
    // like an RTD row) versus silently skipping (a non-RTD row like Premix).
    const resolved = resolveSku(rawSku);
    if (!resolved) {
      const cat = normalizeCategory(row[f.category]);
      if (!cat) continue; // non-RTD row -> skip silently
      if (isExcludedMultipack(rawSku)) {
        issues.push({
          severity: "info",
          code: "EXCLUDED_MULTIPACK",
          message: `Excluded multipack variant (not a tracked single-unit case): ${rawSku}`,
          context: source,
        });
      } else {
        issues.push({
          severity: "warning",
          code: "UNTRACKED_RTD_SKU",
          message: `RTD row with an unrecognised SKU code: ${rawSku}`,
          context: source,
        });
      }
      continue;
    }

    const cases = num(row[f.boxes]);
    if (cases < 0) {
      issues.push({
        severity: "warning",
        code: "NEGATIVE_INVENTORY",
        message: `Negative stock for ${resolved.sku} at ${row[f.location] || "?"}`,
        context: source,
      });
      continue;
    }
    if (cases === 0) continue; // no current stock in this batch/location

    const mfd = parseSheetDate(row[f.mfd]);
    const exp = parseSheetDate(row[f.exp]);
    if (!mfd) {
      issues.push({
        severity: "warning",
        code: "MISSING_MFD",
        message: `Missing/invalid manufacturing date for ${resolved.sku} (batch ${row[f.batchNo] || "?"}) — excluded from shelf-life & coverage.`,
        context: source,
      });
    }
    if (!exp) {
      issues.push({
        severity: "warning",
        code: "MISSING_EXP",
        message: `Missing/invalid expiry date for ${resolved.sku} (batch ${row[f.batchNo] || "?"}).`,
        context: source,
      });
    }

    out.push({
      sku: resolved.sku,
      rootCode: resolved.root,
      name: resolved.name,
      category: resolved.category,
      locationType,
      source,
      location: (row[f.location] || "").trim(),
      batchNo: (row[f.batchNo] || "").trim(),
      mfd,
      exp,
      totalShelfLifeDays: numOrNull(row[f.shelf]),
      cases,
    });
  }
  return { data: out, issues };
}

// ---------- vendor (RTD at Lotus) — wide format, up to 2 batches / SKU ----
export function parseVendorLotus(csv: string): ParseResult<InventoryBatch[]> {
  const issues: DataQualityIssue[] = [];
  const out: InventoryBatch[] = [];
  const all = rows(csv);

  // Column layout (0-indexed), from the sheet header:
  // 0 Total Stock | 1 SKU | 2 Name | 3 Aug Prod | 4 MFG | 5 Exp | 6 70%Hit
  //   | 7 Batch2 Qty | 8 MFG | 9 Exp | 10 70%Hit
  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    const rawSku = (r[1] || "").trim();
    if (!rawSku) continue;
    const resolved = resolveSku(rawSku);
    if (!resolved) continue;

    const total = num(r[0]);
    const pieces: { cases: number; mfd: Date | null; exp: Date | null; tag: string }[] = [
      { cases: num(r[3]), mfd: parseSheetDate(r[4]), exp: parseSheetDate(r[5]), tag: "B1" },
      { cases: num(r[7]), mfd: parseSheetDate(r[8]), exp: parseSheetDate(r[9]), tag: "B2" },
    ];

    let added = 0;
    for (const p of pieces) {
      if (p.cases <= 0) continue;
      added += p.cases;
      out.push({
        sku: resolved.sku,
        rootCode: resolved.root,
        name: resolved.name,
        category: resolved.category,
        locationType: "VENDOR",
        source: "VENDOR_LOTUS",
        location: "Lotus",
        batchNo: p.mfd ? `Lotus/${p.tag}` : `Lotus/${p.tag}?`,
        mfd: p.mfd,
        exp: p.exp,
        totalShelfLifeDays: null,
        cases: p.cases,
      });
    }

    // If the sheet shows a total but no per-batch breakdown, keep the total
    // as a single dateless batch so it is not lost.
    if (added === 0 && total > 0) {
      out.push({
        sku: resolved.sku,
        rootCode: resolved.root,
        name: resolved.name,
        category: resolved.category,
        locationType: "VENDOR",
        source: "VENDOR_LOTUS",
        location: "Lotus",
        batchNo: "Lotus/total",
        mfd: null,
        exp: null,
        totalShelfLifeDays: null,
        cases: total,
      });
      issues.push({
        severity: "info",
        code: "VENDOR_NO_BATCH_DATES",
        message: `Vendor stock for ${resolved.sku} has no batch dates; kept as a single dateless batch.`,
        context: "VENDOR_LOTUS",
      });
    } else if (total > 0 && Math.abs(total - added) > 0.5) {
      issues.push({
        severity: "warning",
        code: "VENDOR_TOTAL_MISMATCH",
        message: `Vendor total (${total}) ≠ sum of batches (${added}) for ${resolved.sku}.`,
        context: "VENDOR_LOTUS",
      });
    }
  }
  return { data: out, issues };
}

// ---------- MTD Sales -----------------------------------------------------
export function parseSales(csv: string): ParseResult<SalesMtd[]> {
  const issues: DataQualityIssue[] = [];
  const bySku = new Map<string, number>();
  for (const row of objects(csv)) {
    const rawSku = (row["Product Code"] || "").trim();
    if (!rawSku) continue;
    const resolved = resolveSku(rawSku);
    if (!resolved) {
      if (!isExcludedMultipack(rawSku)) {
        issues.push({
          severity: "info",
          code: "SALES_UNTRACKED_SKU",
          message: `Sales row for an untracked SKU ignored: ${rawSku}`,
          context: "MTD_SALES",
        });
      }
      continue;
    }
    const cases = num(row["MTD Sale in cases"]);
    bySku.set(resolved.sku, (bySku.get(resolved.sku) || 0) + cases);
  }
  const data = [...bySku.entries()].map(([sku, cases]) => ({ sku, cases }));
  return { data, issues };
}

// ---------- Demand Plan (Sep'26 RTD DP) -----------------------------------
// The tab has two stacked sections: cases first, then units (cases x pack
// size). We take the FIRST occurrence of each tracked "-ONE" SKU, which is the
// cases figure, from Column M (index 12).
export function parseDemand(csv: string): ParseResult<DemandPlanEntry[]> {
  const issues: DataQualityIssue[] = [];
  const seen = new Map<string, DemandPlanEntry>();
  const COL_SKU = 2;
  const COL_TOTAL_CASES = 12;

  for (const r of rows(csv)) {
    const rawSku = (r[COL_SKU] || "").trim();
    if (!rawSku) continue;
    const resolved = resolveSku(rawSku);
    if (!resolved) continue; // packs / untracked / RPC etc.
    if (seen.has(resolved.root)) continue; // keep first (=cases) occurrence

    seen.set(resolved.root, {
      sku: resolved.sku,
      rootCode: resolved.root,
      category: resolved.category,
      cases: num(r[COL_TOTAL_CASES]),
    });
  }

  // Flag any tracked SKU that has no demand line.
  for (const m of SKU_MASTER) {
    if (!seen.has(m.root)) {
      issues.push({
        severity: "warning",
        code: "MISSING_DEMAND",
        message: `No current-month demand found for ${m.sku}.`,
        context: "DEMAND_PLAN",
      });
    }
  }
  return { data: [...seen.values()], issues };
}
