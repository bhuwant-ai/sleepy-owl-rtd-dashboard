import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { runSync } from "@/lib/data/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync
 * - Supabase configured  -> pull the sheets into the database, return counts.
 * - Not configured       -> no-op (the dashboard already reads sheets live).
 */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      mode: "live",
      message: "Supabase not configured; the dashboard reads the sheets live, so no sync is needed.",
    });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, mode: "supabase", ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
