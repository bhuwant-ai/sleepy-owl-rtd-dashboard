/**
 * Reads/writes the dashboard's normalized data in Supabase.
 * All functions here run on the server with the service-role client.
 */
import { getSupabaseAdmin } from "./client";
import { SKU_MASTER } from "../constants";
import type { DashboardInput } from "../calc/dashboard";
import type { InventoryBatch, SalesMtd, DemandPlanEntry, DataQualityIssue } from "../types";

function parseISO(d: string | null): Date | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}
function toISO(d: Date | null): string | null {
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Ensure the SKU master rows exist (static reference data). */
export async function upsertSkuMaster(): Promise<void> {
  const sb = getSupabaseAdmin();
  const rows = SKU_MASTER.map((m) => ({
    sku: m.sku,
    root: m.root,
    name: m.name,
    category: m.category,
    units_per_case: m.unitsPerCase,
  }));
  const { error } = await sb.from("sku_master").upsert(rows, { onConflict: "sku" });
  if (error) throw new Error(`sku_master upsert failed: ${error.message}`);
}

/** Replace the inventory/sales/demand snapshots with a fresh pull. */
export async function replaceAll(raw: DashboardInput): Promise<{ batchRows: number }> {
  const sb = getSupabaseAdmin();

  // Clear existing snapshot rows.
  const del1 = await sb.from("inventory_batches").delete().gt("id", -1);
  if (del1.error) throw new Error(`clear inventory_batches: ${del1.error.message}`);
  const del2 = await sb.from("sales_mtd").delete().neq("sku", "__none__");
  if (del2.error) throw new Error(`clear sales_mtd: ${del2.error.message}`);
  const del3 = await sb.from("demand_plan").delete().neq("sku", "__none__");
  if (del3.error) throw new Error(`clear demand_plan: ${del3.error.message}`);

  const batchRows = raw.batches.map((b) => ({
    sku: b.sku,
    root_code: b.rootCode,
    name: b.name,
    category: b.category,
    location_type: b.locationType,
    source: b.source,
    location: b.location,
    batch_no: b.batchNo,
    mfd: toISO(b.mfd),
    exp: toISO(b.exp),
    total_shelf_life_days: b.totalShelfLifeDays,
    cases: b.cases,
  }));
  if (batchRows.length) {
    const { error } = await sb.from("inventory_batches").insert(batchRows);
    if (error) throw new Error(`insert inventory_batches: ${error.message}`);
  }

  if (raw.sales.length) {
    const { error } = await sb.from("sales_mtd").insert(raw.sales.map((s) => ({ sku: s.sku, cases: s.cases })));
    if (error) throw new Error(`insert sales_mtd: ${error.message}`);
  }
  if (raw.demand.length) {
    const { error } = await sb
      .from("demand_plan")
      .insert(raw.demand.map((d) => ({ sku: d.sku, root_code: d.rootCode, category: d.category, cases: d.cases })));
    if (error) throw new Error(`insert demand_plan: ${error.message}`);
  }

  return { batchRows: batchRows.length };
}

export async function writeSyncLog(
  status: string,
  batchRows: number,
  issues: DataQualityIssue[],
  note: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("sync_log").insert({ status, batch_rows: batchRows, issues, note });
  if (error) throw new Error(`sync_log insert: ${error.message}`);
}

/** Load the current snapshot back out of the database for the dashboard. */
export async function loadRaw(): Promise<DashboardInput> {
  const sb = getSupabaseAdmin();
  const [b, s, d, log] = await Promise.all([
    sb.from("inventory_batches").select("*"),
    sb.from("sales_mtd").select("*"),
    sb.from("demand_plan").select("*"),
    sb.from("sync_log").select("issues").order("ran_at", { ascending: false }).limit(1),
  ]);
  if (b.error) throw new Error(b.error.message);
  if (s.error) throw new Error(s.error.message);
  if (d.error) throw new Error(d.error.message);

  const batches: InventoryBatch[] = (b.data ?? []).map((r) => ({
    sku: r.sku,
    rootCode: r.root_code,
    name: r.name,
    category: r.category,
    locationType: r.location_type,
    source: r.source,
    location: r.location ?? "",
    batchNo: r.batch_no ?? "",
    mfd: parseISO(r.mfd),
    exp: parseISO(r.exp),
    totalShelfLifeDays: r.total_shelf_life_days,
    cases: Number(r.cases),
  }));
  const sales: SalesMtd[] = (s.data ?? []).map((r) => ({ sku: r.sku, cases: Number(r.cases) }));
  const demand: DemandPlanEntry[] = (d.data ?? []).map((r) => ({
    sku: r.sku,
    rootCode: r.root_code,
    category: r.category,
    cases: Number(r.cases),
  }));
  const issues: DataQualityIssue[] = (log.data?.[0]?.issues as DataQualityIssue[]) ?? [];

  return { batches, sales, demand, issues };
}

/** Timestamp of the most recent successful sync (or null). */
export async function latestSyncAt(): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("sync_log")
    .select("ran_at")
    .eq("status", "success")
    .order("ran_at", { ascending: false })
    .limit(1);
  return data?.[0]?.ran_at ?? null;
}
