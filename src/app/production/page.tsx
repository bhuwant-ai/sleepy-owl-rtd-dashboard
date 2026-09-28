import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDashboard } from "@/lib/data/source";
import { ProductionPlanning } from "@/components/dashboard/ProductionPlanning";
import { fmtDate } from "@/lib/format";

// Read the live snapshot on each request, same as the dashboard.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProductionPage() {
  let data;
  try {
    data = await getDashboard();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h1 className="text-lg font-bold text-[var(--bad)]">Couldn’t load the production plan</h1>
          <pre className="mt-4 overflow-x-auto rounded-md bg-black/[0.04] p-3 text-xs text-[var(--foreground)]">{message}</pre>
          <Link href="/" className="mt-4 inline-block text-sm text-[var(--primary)] underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--hairline)] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg glass px-2.5 py-1.5 text-[12px] font-medium press focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="min-w-0">
            <div className="eyebrow">Production planning</div>
            <h1 className="text-[18px] font-bold leading-tight tracking-tight">Demand vs usable stock → batch plan</h1>
          </div>
          <div className="ml-auto text-right text-[11px] text-[var(--muted)]">
            <div className="font-medium text-[var(--foreground)]">{data.month.label}</div>
            <div className="tabnum">as of {fmtDate(data.today)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-4 sm:px-6 py-4">
        <ProductionPlanning rows={data.skus} batches={data.batches} today={data.today} />
      </main>
    </div>
  );
}
