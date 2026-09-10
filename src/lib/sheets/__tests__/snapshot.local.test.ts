/**
 * Local validation against real-data snapshots.
 *
 * This does NOT run in normal CI: it only executes when SNAPSHOT_DIR points to
 * a folder containing CSV exports of the source tabs. It lets us validate the
 * whole parse + compute pipeline against numbers we verified by hand, without
 * committing any business data to the repo.
 *
 * Run with (PowerShell):
 *   $env:SNAPSHOT_DIR="<dir>"; $env:DASHBOARD_TODAY="2026-09-10"; npm test
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInventoryTab, parseVendorLotus, parseSales, parseDemand } from "../parse";
import { JWL_FIELDS, LOW_SHELF_FIELDS } from "../../data/source";
import { computeDashboard } from "../../calc/dashboard";

const DIR = process.env.SNAPSHOT_DIR;
const FILES = {
  jwl: "inv_jwl.csv",
  low: "inv_lowshelf.csv",
  lotus: "inv_lotus.csv",
  sales: "inv_mtdsales.csv",
  demand: "demand_sep26.csv",
};
const ready = !!DIR && Object.values(FILES).every((f) => existsSync(join(DIR!, f)));
// Guard against DIR being undefined: describe.skip still runs the callback
// body during collection, so read() must not throw when we're skipping.
const read = (f: string) => (DIR ? readFileSync(join(DIR, f), "utf8") : "");

(ready ? describe : describe.skip)("real-data snapshot validation", () => {
  const jwl = parseInventoryTab(read(FILES.jwl), "JWL_RACKS", "JWL", JWL_FIELDS);
  const low = parseInventoryTab(read(FILES.low), "LOW_SHELF_LIFE", "JWL", LOW_SHELF_FIELDS);
  const lotus = parseVendorLotus(read(FILES.lotus));
  const sales = parseSales(read(FILES.sales));
  const demand = parseDemand(read(FILES.demand));

  const sum = (arr: { cases: number }[]) => arr.reduce((a, b) => a + b.cases, 0);

  it("JWL Racks parses to ~8,355 cases (matches manual check)", () => {
    const total = sum(jwl.data);
    console.log("JWL Racks cases:", total, "| rows:", jwl.data.length);
    expect(total).toBeGreaterThanOrEqual(8300);
    expect(total).toBeLessThanOrEqual(8600);
  });

  it("Vendor (Lotus) parses to 8,752 cases", () => {
    console.log("Vendor cases:", sum(lotus.data), "| batches:", lotus.data.length);
    expect(sum(lotus.data)).toBe(8752);
  });

  it("Sales are read per SKU (CCC-HAZ = 1078)", () => {
    const haz = sales.data.find((s) => s.sku === "CCC-HAZ-230-CAN-C24");
    expect(haz?.cases).toBe(1078);
    expect(sales.data.length).toBe(12);
  });

  it("Demand is read in CASES from the correct section (CCC-HAZ=3055, RTD-CLA=867)", () => {
    const haz = demand.data.find((d) => d.sku === "CCC-HAZ-230-CAN-C24");
    const cla = demand.data.find((d) => d.sku === "RTD-CLA-200-BTL-C12");
    expect(haz?.cases).toBe(3055);
    expect(cla?.cases).toBe(867);
  });

  it("computes a coherent full dashboard", () => {
    const data = computeDashboard(
      {
        batches: [...jwl.data, ...low.data, ...lotus.data],
        sales: sales.data,
        demand: demand.data,
        issues: [...jwl.issues, ...low.issues, ...lotus.issues, ...sales.issues, ...demand.issues],
      },
      new Date(2026, 8, 10)
    );

    console.log("=== DASHBOARD SUMMARY (today = 10-Sep-2026) ===");
    console.log("JWL total cases     :", data.kpis.jwlTotalCases);
    console.log("Vendor total cases  :", data.kpis.vendorTotalCases);
    console.log(
      "Buckets  >70 / 50-70 / <50 :",
      `${data.kpis.above70Cases} (${data.kpis.above70Pct}%)`,
      `/ ${data.kpis.between5070Cases} (${data.kpis.between5070Pct}%)`,
      `/ ${data.kpis.below50Cases} (${data.kpis.below50Pct}%)`
    );
    console.log("Unknown-shelf cases :", data.kpis.unknownShelfCases);
    console.log(
      "SALES coverage  : init70+=",
      data.coverage.sales.initialAbove70Cases,
      "consumed=",
      data.coverage.sales.consumedAbove70Cases,
      "transitioned=",
      data.coverage.sales.transitionedCases,
      "days=",
      data.coverage.sales.effectiveCoverageDays,
      "end=",
      data.coverage.sales.coverageEndDate
    );
    console.log(
      "DEMAND coverage : init70+=",
      data.coverage.demand.initialAbove70Cases,
      "consumed=",
      data.coverage.demand.consumedAbove70Cases,
      "transitioned=",
      data.coverage.demand.transitionedCases,
      "days=",
      data.coverage.demand.effectiveCoverageDays,
      "end=",
      data.coverage.demand.coverageEndDate
    );
    console.table(
      data.skus.map((s) => ({
        sku: s.sku,
        cat: s.category,
        jwl: s.jwlCases,
        "70+": s.above70Cases,
        vendor: s.vendorCases,
        mtd: s.mtdSalesCases,
        sDRR: s.salesDrr,
        dem: s.demandCases,
        sDOH: s.salesDoh,
      }))
    );

    expect(data.skus.length).toBe(12);
    expect(data.kpis.jwlTotalCases).toBeGreaterThan(8000);
    expect(data.kpis.vendorTotalCases).toBe(8752);
    // Buckets + unknown should reconcile with the JWL total.
    const recon =
      data.kpis.above70Cases +
      data.kpis.between5070Cases +
      data.kpis.below50Cases +
      data.kpis.unknownShelfCases;
    expect(recon).toBe(data.kpis.jwlTotalCases);
    // Coverage conservation: initial 70%+ = consumed + transitioned.
    const c = data.coverage.sales;
    expect(Math.round(c.consumedAbove70Cases + c.transitionedCases)).toBe(
      Math.round(c.initialAbove70Cases)
    );
  });
});
