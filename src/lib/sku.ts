/**
 * SKU parsing and mapping.
 *
 * Every SKU code looks like ROOT (4 dash-separated parts) + an optional pack
 * suffix, e.g. "CCC-BLK-230-CAN-C24" -> root "CCC-BLK-230-CAN", pack "C24".
 * We use the root to bridge the demand sheet (-ONE) and the inventory/sales
 * sheets (-C24 / -C12), and we only track the standard single-unit case.
 */
import { SKU_MASTER, STANDARD_PACK_SUFFIXES, type SkuMasterEntry } from "./constants";
import type { Category } from "./types";

const BY_ROOT = new Map<string, SkuMasterEntry>(SKU_MASTER.map((e) => [e.root, e]));

/** First 4 dash-separated segments, e.g. CCC-BLK-230-CAN. */
export function rootOf(sku: string): string {
  return sku.trim().split("-").slice(0, 4).join("-");
}

/** Everything after the root, e.g. "C24", "ONE", "P04-C08", or "" if none. */
export function packOf(sku: string): string {
  return sku.trim().split("-").slice(4).join("-");
}

export interface ResolvedSku {
  sku: string; // canonical (-C24 / -C12)
  root: string;
  name: string;
  category: Category;
  unitsPerCase: number;
}

/**
 * Resolve a raw SKU code (from any sheet) to one of the 12 tracked products.
 * Returns null when the code is not a tracked RTD product, or is a multipack
 * variant we deliberately exclude (e.g. Pack-of-4 "C04"/"P04").
 */
export function resolveSku(rawSku: string | null | undefined): ResolvedSku | null {
  if (!rawSku) return null;
  const root = rootOf(rawSku);
  const entry = BY_ROOT.get(root);
  if (!entry) return null; // not a tracked RTD product
  const pack = packOf(rawSku).toUpperCase();
  if (!STANDARD_PACK_SUFFIXES.has(pack)) return null; // a multipack -> excluded
  return {
    sku: entry.sku,
    root: entry.root,
    name: entry.name,
    category: entry.category,
    unitsPerCase: entry.unitsPerCase,
  };
}

/** True when the root is tracked but the pack is a non-standard multipack. */
export function isExcludedMultipack(rawSku: string | null | undefined): boolean {
  if (!rawSku) return false;
  if (!BY_ROOT.has(rootOf(rawSku))) return false;
  return !STANDARD_PACK_SUFFIXES.has(packOf(rawSku).toUpperCase());
}

/** Normalize the various category spellings to our canonical Category. */
export function normalizeCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.startsWith("rtd can") || s === "can" || s === "cans") return "RTD Cans";
  if (s.startsWith("rtd bottle") || s === "bottle" || s === "bottles") return "RTD Bottles";
  return null;
}

export const ALL_SKUS: string[] = SKU_MASTER.map((e) => e.sku);
