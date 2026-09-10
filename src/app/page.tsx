import { getDashboard } from "@/lib/data/source";
import { Dashboard } from "@/components/dashboard/Dashboard";

// Always read the live sheets on each request (no caching) so the dashboard
// reflects the current source of truth.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  try {
    const data = await getDashboard();
    return <Dashboard data={data} />;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h1 className="text-lg font-bold text-[var(--bad)]">Couldn’t load the dashboard data</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            The dashboard reads directly from your Google Sheets. This error usually means a sheet
            isn’t shared as “Anyone with the link”, a tab was renamed, or there’s no internet
            connection.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-black/[0.04] p-3 text-xs text-[var(--foreground)]">
            {message}
          </pre>
          <p className="mt-4 text-sm text-[var(--muted)]">Fix the issue above, then reload this page.</p>
        </div>
      </div>
    );
  }
}
