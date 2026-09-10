/**
 * Server-side Supabase client (uses the service-role key).
 *
 * This must ONLY ever be imported from server code (server components, route
 * handlers) — never from a "use client" component — because the service-role
 * key bypasses Row Level Security and must never reach the browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }
  if (!cached) {
    // Accept a URL pasted with a trailing "/rest/v1/" (a common mistake) and
    // normalize it to the base project URL the library expects.
    const url = process.env
      .SUPABASE_URL!.trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/i, "");
    cached = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
