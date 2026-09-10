/**
 * Syncs the Google Sheets into Supabase.
 *
 * Flow: read every source tab -> parse/clean -> replace the snapshot tables ->
 * write a sync_log row (with any data-quality issues). This is what the
 * "Refresh data" button triggers when Supabase is configured.
 */
import { loadRawFromSheets } from "./source";
import { replaceAll, upsertSkuMaster, writeSyncLog } from "../supabase/repository";

export interface SyncResult {
  batchRows: number;
  salesRows: number;
  demandRows: number;
  issues: number;
}

export async function runSync(): Promise<SyncResult> {
  const raw = await loadRawFromSheets();
  try {
    await upsertSkuMaster();
    const { batchRows } = await replaceAll(raw);
    await writeSyncLog(
      "success",
      batchRows,
      raw.issues ?? [],
      `${raw.sales.length} sales rows, ${raw.demand.length} demand rows`
    );
    return {
      batchRows,
      salesRows: raw.sales.length,
      demandRows: raw.demand.length,
      issues: (raw.issues ?? []).length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Best-effort failure log (don't mask the original error).
    try {
      await writeSyncLog("error", 0, raw.issues ?? [], msg);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
