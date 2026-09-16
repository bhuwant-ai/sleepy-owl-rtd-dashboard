/**
 * Dashboard orchestrator.
 *
 * Takes the cleaned raw data (batches, sales, demand) and produces every
 * number the UI needs, as a plain JSON-serializable object. All time-based
 * logic flows from a single `today`.
 *
 * Scope rule (per business decision):
 *   - JWL inventory = JWL Racks + Low Shelf Life
 *   - DOH and 70%+ coverage are computed on JWL only
 *   - Vendor (Lotus) stock is reported separately as a KPI
 */
import { addDays, daysBetween } from "./dates";
import { shelfLifeSnapshot, seventyPercentDate, type ShelfBucket } from "./shelfLife";
import { getMonthContext, salesDrr, demandDrr, doh } from "./drr";
import { simulateFefoCoverage, type FefoBatchInput } from "./fefo";
import { SKU_MASTER } from "../constants";
import type {
  InventoryBatch,
  SalesMtd,
  DemandPlanEntry,
  DataQualityIssue,
  Category,
} from "../types";

// ---------- output shape (all JSON-serializable) --------------------------
export interface Kpis {
  jwlTotalCases: number;
  vendorTotalCases: number;
  above70Cases: number;
  between5070Cases: number;
  below50Cases: number;
  unknownShelfCases: number;
  above70Pct: number;
  between5070Pct: number;
  below50Pct: number;
}

export interface SkuRow {
  sku: string;
  name: string;
  category: Category;
  jwlCases: number;
  above70Cases: number;
  between5070Cases: number;
  below50Cases: number;
  vendorCases: number;
  mtdSalesCases: number;
  salesDrr: number;
  demandCases: number;
  demandDrr: number;
  salesDoh: number | null; // null = infinite (no run rate)
  demandDoh: number | null;
  // Supply/stock-out planning (incl. vendor), sales-DRR FEFO simulation.
  above70InclVendorCases: number; // JWL >70% + vendor >70% (eligible today)
  stockoutInclVendorDate: string | null; // FEFO 70%+ coverage end date (JWL+vendor)
  stockoutInclVendorDays: number | null;
}

export interface CategoryRow {
  category: Category | "All RTD";
  jwlCases: number;
  above70Cases: number;
  between5070Cases: number;
  below50Cases: number;
  vendorCases: number;
  mtdSalesCases: number;
  demandCases: number;
}

export interface BatchRow {
  sku: string;
  name: string;
  category: Category;
  locationType: "JWL" | "VENDOR";
  location: string;
  batchNo: string;
  mfd: string | null; // ISO date
  exp: string | null;
  totalShelfLifeDays: number | null;
  cases: number;
  remainingPct: number | null;
  bucket: ShelfBucket | null;
  date70: string | null; // ISO date the batch drops to <=70%
}

export interface CoverageBatchRow {
  sku: string;
  batchNo: string;
  location: string;
  mfd: string | null;
  date70: string | null;
  initialCases: number;
  fefoPriority: number | null;
  consumedAbove70: number;
  transitionedBelow70: number;
  status: string;
}

export interface CoverageSkuRow {
  sku: string;
  name: string;
  category: Category;
  drr: number;
  initialAbove70Cases: number;
  consumedAbove70Cases: number;
  transitionedCases: number;
  effectiveCoverageDays: number | null;
  coverageEndDate: string | null;
  batches: CoverageBatchRow[];
}

export interface CoverageView {
  basis: "SALES" | "DEMAND";
  totalDrr: number;
  initialAbove70Cases: number;
  consumedAbove70Cases: number;
  transitionedCases: number;
  alreadyBelow70Cases: number;
  effectiveCoverageDays: number | null;
  coverageEndDate: string | null;
  perSku: CoverageSkuRow[];
}

export interface DashboardData {
  generatedAt: string;
  today: string;
  month: { label: string; elapsedDays: number; daysInMonth: number };
  config: { thresholdPct: number; coverageScope: "JWL only" };
  kpis: Kpis;
  /** Stock set aside and NOT included in JWL totals (shown separately). */
  excluded: {
    nonSellable: { cases: number; batches: number };
    expired: { cases: number; batches: number };
  };
  categories: CategoryRow[];
  skus: SkuRow[];
  batches: BatchRow[];
  coverage: { sales: CoverageView; demand: CoverageView };
  dataQuality: DataQualityIssue[];
}

// ---------- helpers -------------------------------------------------------
function isoDate(d: Date | null): string | null {
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface EnrichedBatch extends InventoryBatch {
  totalDays: number | null;
  remainingPct: number | null;
  bucket: ShelfBucket | null;
  date70: Date | null;
}

function enrichBatch(b: InventoryBatch, today: Date): EnrichedBatch {
  if (!b.mfd) {
    return { ...b, totalDays: null, remainingPct: null, bucket: null, date70: null };
  }
  const totalDays = b.exp ? daysBetween(b.mfd, b.exp) : b.totalShelfLifeDays ?? null;
  if (!totalDays || totalDays <= 0) {
    return { ...b, totalDays: null, remainingPct: null, bucket: null, date70: null };
  }
  const snap = shelfLifeSnapshot(b.mfd, b.exp, today, b.totalShelfLifeDays);
  return {
    ...b,
    totalDays,
    remainingPct: snap.remainingPct,
    bucket: snap.bucket,
    date70: seventyPercentDate(b.mfd, totalDays),
  };
}

// ---------- main ----------------------------------------------------------
export interface DashboardInput {
  batches: InventoryBatch[];
  sales: SalesMtd[];
  demand: DemandPlanEntry[];
  issues?: DataQualityIssue[];
}

export function computeDashboard(input: DashboardInput, today: Date): DashboardData {
  const month = getMonthContext(today);
  const issues: DataQualityIssue[] = [...(input.issues || [])];

  const enriched = input.batches.map((b) => enrichBatch(b, today));
  const jwl = enriched.filter((b) => b.locationType === "JWL");
  const vendor = enriched.filter((b) => b.locationType === "VENDOR");

  const salesBySku = new Map(input.sales.map((s) => [s.sku, s.cases]));
  const demandBySku = new Map(input.demand.map((d) => [d.sku, d.cases]));

  // ----- per-SKU rows -----
  const skus: SkuRow[] = SKU_MASTER.map((m) => {
    const jwlB = jwl.filter((b) => b.sku === m.sku);
    const vendB = vendor.filter((b) => b.sku === m.sku);
    const bucketSum = (bk: ShelfBucket) =>
      jwlB.filter((b) => b.bucket === bk).reduce((a, b) => a + b.cases, 0);
    const jwlCases = jwlB.reduce((a, b) => a + b.cases, 0);
    const mtd = salesBySku.get(m.sku) ?? 0;
    const dem = demandBySku.get(m.sku) ?? 0;
    const sDrr = salesDrr(mtd, month.elapsedDays);
    const dDrr = demandDrr(dem, month.daysInMonth);

    // Stock-out incl. vendor: same FEFO 70%+ simulation as the coverage
    // section, but over JWL + vendor batches, at the sales DRR.
    const fefoInputs: FefoBatchInput[] = [...jwlB, ...vendB]
      .filter((b) => b.mfd && b.date70 && b.totalDays)
      .map((b, i) => ({
        batchId: `${b.sku}|${b.source}|${i}`,
        cases: b.cases,
        expDate: b.exp ?? addDays(b.mfd!, b.totalDays!),
        date70: b.date70!,
      }));
    const fefoInclVendor = simulateFefoCoverage(fefoInputs, sDrr, today);

    return {
      sku: m.sku,
      name: m.name,
      category: m.category,
      jwlCases,
      above70Cases: bucketSum("ABOVE_70"),
      between5070Cases: bucketSum("BETWEEN_50_70"),
      below50Cases: bucketSum("BELOW_50"),
      vendorCases: vendB.reduce((a, b) => a + b.cases, 0),
      mtdSalesCases: mtd,
      salesDrr: round1(sDrr),
      demandCases: dem,
      demandDrr: round1(dDrr),
      salesDoh: finiteOrNull(round1(doh(jwlCases, sDrr))),
      demandDoh: finiteOrNull(round1(doh(jwlCases, dDrr))),
      above70InclVendorCases: round1(fefoInclVendor.initialAbove70Cases),
      stockoutInclVendorDate: isoDate(fefoInclVendor.coverageEndDate),
      stockoutInclVendorDays: finiteOrNull(round1(fefoInclVendor.effectiveCoverageDays)),
    };
  });

  // ----- KPIs -----
  const jwlTotalCases = jwl.reduce((a, b) => a + b.cases, 0);
  const above70 = jwl.filter((b) => b.bucket === "ABOVE_70").reduce((a, b) => a + b.cases, 0);
  const between = jwl.filter((b) => b.bucket === "BETWEEN_50_70").reduce((a, b) => a + b.cases, 0);
  const below = jwl.filter((b) => b.bucket === "BELOW_50").reduce((a, b) => a + b.cases, 0);
  const unknown = jwl.filter((b) => b.bucket === null).reduce((a, b) => a + b.cases, 0);
  const pct = (n: number) => (jwlTotalCases > 0 ? round1((n / jwlTotalCases) * 100) : 0);
  const kpis: Kpis = {
    jwlTotalCases,
    vendorTotalCases: vendor.reduce((a, b) => a + b.cases, 0),
    above70Cases: above70,
    between5070Cases: between,
    below50Cases: below,
    unknownShelfCases: unknown,
    above70Pct: pct(above70),
    between5070Pct: pct(between),
    below50Pct: pct(below),
  };
  if (unknown > 0) {
    issues.push({
      severity: "warning",
      code: "UNKNOWN_SHELF_LIFE",
      message: `${unknown} JWL cases could not be shelf-life classified (missing/invalid dates) and are excluded from the buckets.`,
    });
  }

  // ----- category rows -----
  const catRow = (cat: Category | "All RTD"): CategoryRow => {
    const rowsForCat = cat === "All RTD" ? skus : skus.filter((s) => s.category === cat);
    const s = (f: (r: SkuRow) => number) => rowsForCat.reduce((a, r) => a + f(r), 0);
    return {
      category: cat,
      jwlCases: s((r) => r.jwlCases),
      above70Cases: s((r) => r.above70Cases),
      between5070Cases: s((r) => r.between5070Cases),
      below50Cases: s((r) => r.below50Cases),
      vendorCases: s((r) => r.vendorCases),
      mtdSalesCases: s((r) => r.mtdSalesCases),
      demandCases: s((r) => r.demandCases),
    };
  };
  const categories = [catRow("All RTD"), catRow("RTD Cans"), catRow("RTD Bottles")];

  // ----- batch table -----
  const batches: BatchRow[] = enriched
    .map((b) => ({
      sku: b.sku,
      name: b.name,
      category: b.category,
      locationType: b.locationType,
      location: b.location,
      batchNo: b.batchNo,
      mfd: isoDate(b.mfd),
      exp: isoDate(b.exp),
      totalShelfLifeDays: b.totalDays,
      cases: b.cases,
      remainingPct: b.remainingPct != null ? round1(b.remainingPct) : null,
      bucket: b.bucket,
      date70: isoDate(b.date70),
    }))
    .sort((a, b) =>
      a.sku === b.sku ? (a.date70 || "").localeCompare(b.date70 || "") : a.sku.localeCompare(b.sku)
    );

  // ----- coverage simulations (JWL only) -----
  const buildCoverage = (basis: "SALES" | "DEMAND"): CoverageView => {
    const perSku: CoverageSkuRow[] = [];
    let tInit = 0, tCons = 0, tTrans = 0, tBelow = 0, tDrr = 0;

    for (const m of SKU_MASTER) {
      const skuBatches = jwl.filter((b) => b.sku === m.sku);
      const mtd = salesBySku.get(m.sku) ?? 0;
      const dem = demandBySku.get(m.sku) ?? 0;
      const drr = basis === "SALES" ? salesDrr(mtd, month.elapsedDays) : demandDrr(dem, month.daysInMonth);

      // Only batches with usable dates can enter the simulation.
      const inputs: FefoBatchInput[] = [];
      const metaById = new Map<string, EnrichedBatch>();
      skuBatches.forEach((b, i) => {
        if (!b.mfd || !b.date70 || !b.totalDays) return;
        const expDate = b.exp ?? addDays(b.mfd, b.totalDays);
        const id = `${b.sku}|${b.batchNo}|${b.location}|${isoDate(b.mfd)}|${i}`;
        metaById.set(id, b);
        inputs.push({ batchId: id, cases: b.cases, expDate, date70: b.date70 });
      });

      const res = simulateFefoCoverage(inputs, drr, today);
      tInit += res.initialAbove70Cases;
      tCons += res.consumedAbove70Cases;
      tTrans += res.transitionedCases;
      tBelow += res.alreadyBelow70Cases;
      tDrr += drr;

      perSku.push({
        sku: m.sku,
        name: m.name,
        category: m.category,
        drr: round1(drr),
        initialAbove70Cases: round1(res.initialAbove70Cases),
        consumedAbove70Cases: round1(res.consumedAbove70Cases),
        transitionedCases: round1(res.transitionedCases),
        effectiveCoverageDays: finiteOrNull(round1(res.effectiveCoverageDays)),
        coverageEndDate: isoDate(res.coverageEndDate),
        batches: res.batches.map((fb) => {
          const meta = metaById.get(fb.batchId);
          return {
            sku: m.sku,
            batchNo: meta?.batchNo ?? "",
            location: meta?.location ?? "",
            mfd: isoDate(meta?.mfd ?? null),
            date70: isoDate(fb.date70),
            initialCases: fb.initialCases,
            fefoPriority: fb.fefoPriority,
            consumedAbove70: fb.consumedAbove70,
            transitionedBelow70: fb.transitionedBelow70,
            status: fb.status,
          };
        }),
      });
    }

    const effDays = tDrr > 0 ? tCons / tDrr : Infinity;
    return {
      basis,
      totalDrr: round1(tDrr),
      initialAbove70Cases: round1(tInit),
      consumedAbove70Cases: round1(tCons),
      transitionedCases: round1(tTrans),
      alreadyBelow70Cases: round1(tBelow),
      effectiveCoverageDays: finiteOrNull(round1(effDays)),
      coverageEndDate: tDrr > 0 ? isoDate(addDays(today, Math.floor(effDays))) : null,
      perSku,
    };
  };

  // Totals of stock set aside (summed across all source tabs).
  const sumExcluded = (code: string) =>
    issues
      .filter((i) => i.code === code)
      .reduce(
        (a, i) => ({ cases: a.cases + (i.cases ?? 0), batches: a.batches + (i.count ?? 0) }),
        { cases: 0, batches: 0 }
      );
  const excluded = {
    nonSellable: sumExcluded("EXCLUDED_NON_SELLABLE"),
    expired: sumExcluded("EXCLUDED_EXPIRED"),
  };

  return {
    generatedAt: new Date().toISOString(),
    today: isoDate(today)!,
    month: { label: month.monthLabel, elapsedDays: month.elapsedDays, daysInMonth: month.daysInMonth },
    config: { thresholdPct: 70, coverageScope: "JWL only" },
    kpis,
    excluded,
    categories,
    skus,
    batches,
    coverage: { sales: buildCoverage("SALES"), demand: buildCoverage("DEMAND") },
    dataQuality: dedupeIssues(issues),
  };
}

function dedupeIssues(issues: DataQualityIssue[]): DataQualityIssue[] {
  const seen = new Set<string>();
  const out: DataQualityIssue[] = [];
  for (const i of issues) {
    const key = `${i.code}|${i.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}
