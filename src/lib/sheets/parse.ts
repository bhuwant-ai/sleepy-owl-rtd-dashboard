/**
 * Parsers that turn raw sheet rows (arrays of cells) into clean, SKU-mapped
 * domain objects.
 *
 * Input is an array-of-arrays (from the xlsx reader) rather than a fixed CSV
 * layout, and columns are located by TOLERANT matching on the header row. This
 * makes parsing robust to filters (all rows are present), two-row headers, and
 * header renames (e.g. "Closing Inventory No. Of boxes" vs "No. Of boxes").
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
/** Convert CSV text to an array-of-arrays (used by tests / snapshots). */
export function csvToRows(csv: string): string[][] {
  return Papa.parse<string[]>(csv, { skipEmptyLines: false }).data.filter((r): r is string[] =>
    Array.isArray(r)
  );
}
/** Parse a number that may contain commas/spaces/%. Blank -> 0. */
function num(v: unknown): number {
  if (v == null) return 0;
  const cleaned = String(v).replace(/[,%\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}
const cell = (row: string[], i: number): string => (i >= 0 && row[i] != null ? String(row[i]) : "");

/** First column whose (trimmed) header matches any of the patterns; -1 if none. */
function findCol(header: string[], ...patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h.trim()));
    if (i >= 0) return i;
  }
  return -1;
}
/** Index of the first row (within the first 40) that looks like a header. */
function findHeaderRow(aoa: string[][], required: RegExp[]): number {
  for (let i = 0; i < Math.min(aoa.length, 40); i++) {
    const cells = aoa[i].map((x) => String(x).trim());
    if (required.every((p) => cells.some((c) => p.test(c)))) return i;
  }
  return -1;
}

// ---------- inventory tabs (JWL Racks, Low Shelf Life) --------------------
export function parseInventoryTab(
  aoa: string[][],
  source: InventorySource,
  locationType: LocationType
): ParseResult<InventoryBatch[]> {
  const issues: DataQualityIssue[] = [];
  const out: InventoryBatch[] = [];
  let nonSellableCount = 0;
  let nonSellableCases = 0;
  let expiredCount = 0;
  let expiredCases = 0;

  const hi = findHeaderRow(aoa, [/^sku/i]);
  if (hi < 0) {
    issues.push({
      severity: "error",
      code: "HEADER_NOT_FOUND",
      message: `Could not find a header row with an SKU column in ${source}.`,
      context: source,
    });
    return { data: out, issues };
  }
  const H = aoa[hi].map((c) => c.trim());
  const col = {
    sku: findCol(H, /^sku$/i, /^sku codes?$/i, /^product code$/i, /^sku/i),
    cat: findCol(H, /^categories$/i, /categor/i),
    mfd: findCol(H, /^mfd$/i, /^mfg/i, /manufactur/i),
    exp: findCol(H, /^exp$/i, /^expiry/i, /^exp/i),
    batch: findCol(H, /^batch\s*no/i, /batch/i),
    shelf: findCol(H, /total shelf life/i),
    rem: findCol(H, /^remaining/i),
    loc: findCol(H, /^location$/i, /location/i),
    remarks: findCol(H, /^remarks$/i, /remark/i),
  };
  // Current available/closing stock in cases. Prefer explicit "available/
  // closing" columns; otherwise the boxes column that comes AFTER Location
  // (the closing count, vs the opening count that comes before it).
  let boxCol = findCol(H, /total boxes avl/i, /closing.*box/i, /available.*box/i);
  if (boxCol < 0 && col.loc >= 0) {
    for (let i = col.loc + 1; i < H.length; i++) {
      if (/box/i.test(H[i])) {
        boxCol = i;
        break;
      }
    }
  }
  if (boxCol < 0) boxCol = findCol(H, /no\.?\s*of\s*boxes/i);

  for (const row of aoa.slice(hi + 1)) {
    const rawSku = cell(row, col.sku).trim();
    if (!rawSku) continue;

    const resolved = resolveSku(rawSku);
    if (!resolved) {
      const cat = normalizeCategory(cell(row, col.cat));
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

    const cases = num(cell(row, boxCol));

    // Business rule: set aside stock flagged "Non Sellable" (only tabs that
    // have a Remarks column) or already expired (0% / negative remaining shelf
    // life). Track the excluded case quantities for separate reporting.
    if (col.remarks >= 0) {
      const remark = cell(row, col.remarks).trim().toLowerCase();
      if (remark === "non sellable" || remark === "non-sellable") {
        nonSellableCount++;
        nonSellableCases += Math.max(0, cases);
        continue;
      }
    }
    if (col.rem >= 0) {
      const rd = numOrNull(cell(row, col.rem));
      if (rd != null && rd <= 0) {
        expiredCount++;
        expiredCases += Math.max(0, cases);
        continue;
      }
    }

    if (cases < 0) {
      issues.push({
        severity: "warning",
        code: "NEGATIVE_INVENTORY",
        message: `Negative stock for ${resolved.sku} at ${cell(row, col.loc) || "?"}`,
        context: source,
      });
      continue;
    }
    if (cases === 0) continue; // no current stock in this batch/location

    const mfd = parseSheetDate(cell(row, col.mfd));
    const exp = parseSheetDate(cell(row, col.exp));
    if (!mfd) {
      issues.push({
        severity: "warning",
        code: "MISSING_MFD",
        message: `Missing/invalid manufacturing date for ${resolved.sku} (batch ${cell(row, col.batch) || "?"}) — excluded from shelf-life & coverage.`,
        context: source,
      });
    }
    if (!exp) {
      issues.push({
        severity: "warning",
        code: "MISSING_EXP",
        message: `Missing/invalid expiry date for ${resolved.sku} (batch ${cell(row, col.batch) || "?"}).`,
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
      location: cell(row, col.loc).trim(),
      batchNo: cell(row, col.batch).trim(),
      mfd,
      exp,
      totalShelfLifeDays: numOrNull(cell(row, col.shelf)),
      cases,
    });
  }

  // One concise summary per exclusion type (instead of one line per batch).
  if (nonSellableCount > 0) {
    issues.push({
      severity: "info",
      code: "EXCLUDED_NON_SELLABLE",
      message: `Excluded ${nonSellableCount} non-sellable batch${nonSellableCount === 1 ? "" : "es"} (${nonSellableCases} cases).`,
      context: source,
      cases: nonSellableCases,
      count: nonSellableCount,
    });
  }
  if (expiredCount > 0) {
    issues.push({
      severity: "info",
      code: "EXCLUDED_EXPIRED",
      message: `Excluded ${expiredCount} expired batch${expiredCount === 1 ? "" : "es"} (0% or negative shelf life; ${expiredCases} cases).`,
      context: source,
      cases: expiredCases,
      count: expiredCount,
    });
  }
  return { data: out, issues };
}

// ---------- vendor (RTD at Lotus) — wide format, up to 2 batches / SKU ----
export function parseVendorLotus(aoa: string[][]): ParseResult<InventoryBatch[]> {
  const issues: DataQualityIssue[] = [];
  const out: InventoryBatch[] = [];

  const hi = findHeaderRow(aoa, [/^sku$/i]);
  const headerRow = hi >= 0 ? hi : 0;
  const H = (aoa[headerRow] || []).map((c) => c.trim());
  const s = findCol(H, /^sku$/i, /^sku/i);
  if (s < 0) {
    issues.push({ severity: "error", code: "HEADER_NOT_FOUND", message: "No SKU column in RTD at Lotus.", context: "VENDOR_LOTUS" });
    return { data: out, issues };
  }
  // Column offsets relative to the SKU column (matches the Lotus layout:
  // Total | SKU | Name | AugQty | MFG | Exp | 70%Hit | Batch2Qty | MFG | Exp | 70%Hit)
  const O = { total: s - 1, q1: s + 2, mfg1: s + 3, exp1: s + 4, q2: s + 6, mfg2: s + 7, exp2: s + 8 };

  for (const r of aoa.slice(headerRow + 1)) {
    const rawSku = cell(r, s).trim();
    if (!rawSku) continue;
    const resolved = resolveSku(rawSku);
    if (!resolved) continue;

    const total = num(cell(r, O.total));
    const pieces = [
      { cases: num(cell(r, O.q1)), mfd: parseSheetDate(cell(r, O.mfg1)), exp: parseSheetDate(cell(r, O.exp1)), tag: "B1" },
      { cases: num(cell(r, O.q2)), mfd: parseSheetDate(cell(r, O.mfg2)), exp: parseSheetDate(cell(r, O.exp2)), tag: "B2" },
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
export function parseSales(aoa: string[][]): ParseResult<SalesMtd[]> {
  const issues: DataQualityIssue[] = [];
  const bySku = new Map<string, number>();

  const hi = findHeaderRow(aoa, [/product code|^sku/i]);
  const headerRow = hi >= 0 ? hi : 0;
  const H = (aoa[headerRow] || []).map((c) => c.trim());
  const skuCol = findCol(H, /^product code$/i, /^sku$/i, /product|sku/i);
  const mtdCol = findCol(H, /mtd/i, /sale/i);

  for (const r of aoa.slice(headerRow + 1)) {
    const rawSku = cell(r, skuCol).trim();
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
    const cases = num(cell(r, mtdCol));
    bySku.set(resolved.sku, (bySku.get(resolved.sku) || 0) + cases);
  }
  const data = [...bySku.entries()].map(([sku, cases]) => ({ sku, cases }));
  return { data, issues };
}

// ---------- Demand Plan (Sep'26 RTD DP) -----------------------------------
// The tab has two stacked sections: cases first, then units (cases x pack
// size). We take the FIRST occurrence of each tracked "-ONE" SKU, which is the
// cases figure, from Column C (SKU, index 2) / Column M (total cases, index 12).
export function parseDemand(aoa: string[][]): ParseResult<DemandPlanEntry[]> {
  const issues: DataQualityIssue[] = [];
  const seen = new Map<string, DemandPlanEntry>();
  const COL_SKU = 2;
  const COL_TOTAL_CASES = 12;

  for (const r of aoa) {
    const rawSku = cell(r, COL_SKU).trim();
    if (!rawSku) continue;
    const resolved = resolveSku(rawSku);
    if (!resolved) continue; // packs / untracked / RPC etc.
    if (seen.has(resolved.root)) continue; // keep first (=cases) occurrence

    seen.set(resolved.root, {
      sku: resolved.sku,
      rootCode: resolved.root,
      category: resolved.category,
      cases: num(cell(r, COL_TOTAL_CASES)),
    });
  }

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
