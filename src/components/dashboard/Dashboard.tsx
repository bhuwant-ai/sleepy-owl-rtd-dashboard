"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Warehouse,
  ShieldCheck,
  Clock3,
  AlertTriangle,
  Truck,
  Coffee,
  RefreshCw,
  RotateCcw,
  Sun,
  Moon,
} from "lucide-react";
import type { DashboardData, CoverageView } from "@/lib/calc/dashboard";
import type { Category } from "@/lib/types";
import { fmtInt, fmtPct, addDaysIso } from "@/lib/format";
import { StatCard, SectionCard, Card, Badge, IconButton, cn } from "./ui";
import { ShelfChart } from "./ShelfChart";
import { SkuTable } from "./SkuTable";
import { BatchTable } from "./BatchTable";
import { CoverageCards } from "./CoverageCards";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<"all" | Category>("all");
  const [sku, setSku] = useState<"all" | string>("all");

  // --- presentational-only theme toggle (light/dark) ---
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleTheme = () => {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };

  const skuOptions = data.skus.filter((s) => category === "all" || s.category === category);

  const filteredSkus = useMemo(
    () =>
      data.skus
        .filter((s) => category === "all" || s.category === category)
        .filter((s) => sku === "all" || s.sku === sku),
    [data.skus, category, sku]
  );
  const allowed = useMemo(() => new Set(filteredSkus.map((s) => s.sku)), [filteredSkus]);

  // KPIs recomputed from the filtered SKU set.
  const k = useMemo(() => {
    const sum = (f: (r: (typeof filteredSkus)[number]) => number) => filteredSkus.reduce((a, r) => a + f(r), 0);
    const jwl = sum((r) => r.jwlCases);
    const above = sum((r) => r.above70Cases);
    const between = sum((r) => r.between5070Cases);
    const below = sum((r) => r.below50Cases);
    const pct = (n: number) => (jwl > 0 ? round1((n / jwl) * 100) : 0);
    return {
      jwl,
      vendor: sum((r) => r.vendorCases),
      above,
      between,
      below,
      unknown: Math.max(0, jwl - above - between - below),
      abovePct: pct(above),
      betweenPct: pct(between),
      belowPct: pct(below),
    };
  }, [filteredSkus]);

  const batchesFiltered = useMemo(
    () => data.batches.filter((b) => allowed.has(b.sku)),
    [data.batches, allowed]
  );

  const salesCov = useMemo(() => recomputeCoverage(data.coverage.sales, allowed, data.today), [data, allowed]);
  const demandCov = useMemo(() => recomputeCoverage(data.coverage.demand, allowed, data.today), [data, allowed]);

  const refresh = async () => {
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Refresh failed: ${body?.error ?? res.statusText}`);
        return;
      }
    } catch (e) {
      alert(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    startTransition(() => router.refresh());
  };

  const selCls =
    "rounded-lg glass px-2.5 py-1.5 text-[12px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

  const filtered = category !== "all" || sku !== "all";

  const kpis = [
    { label: "Total JWL", value: fmtInt(k.jwl), sub: "Racks + Low Shelf Life", accent: "var(--primary)", icon: <Warehouse className="h-4 w-4" /> },
    { label: "Above 70%", value: fmtInt(k.above), sub: `${fmtPct(k.abovePct)} of JWL`, accent: "var(--good)", icon: <ShieldCheck className="h-4 w-4" /> },
    { label: "50–70%", value: fmtInt(k.between), sub: `${fmtPct(k.betweenPct)} of JWL`, accent: "var(--warn)", icon: <Clock3 className="h-4 w-4" /> },
    { label: "Below 50%", value: fmtInt(k.below), sub: `${fmtPct(k.belowPct)} of JWL`, accent: "var(--bad)", icon: <AlertTriangle className="h-4 w-4" /> },
    { label: "At Vendor", value: fmtInt(k.vendor), sub: "Lotus (separate)", accent: "var(--brand-sky)", icon: <Truck className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-full">
      {/* Sticky glass header */}
      <header className="no-print sticky top-0 z-30 border-b border-[var(--hairline)] bg-background/85 backdrop-blur-xl anim-in-header">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-indigo)] via-[var(--brand-violet)] to-[var(--brand-sky)] text-white shadow-sm">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="ping-dot" />
                <span className="eyebrow">RTD Inventory · Live</span>
              </div>
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">Sleepy Owl RTD Dashboard</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">{data.month.label}</span>
                <span aria-hidden>·</span>
                <span className="tabnum">Updated {new Date(data.generatedAt).toLocaleString("en-IN")}</span>
                <span aria-hidden>·</span>
                <span>Source: Google Sheets → Supabase</span>
              </div>
            </div>
          </div>

          {/* Filters + actions, pinned right */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className={selCls}
              aria-label="Category filter"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as typeof category);
                setSku("all");
              }}
            >
              <option value="all">All categories</option>
              <option value="RTD Cans">RTD Cans</option>
              <option value="RTD Bottles">RTD Bottles</option>
            </select>
            <select className={selCls} aria-label="SKU filter" value={sku} onChange={(e) => setSku(e.target.value)}>
              <option value="all">All SKUs</option>
              {skuOptions.map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.sku}
                </option>
              ))}
            </select>
            {filtered && (
              <IconButton label="Reset filters" onClick={() => { setCategory("all"); setSku("all"); }}>
                <RotateCcw className="h-4 w-4" />
              </IconButton>
            )}
            <button
              onClick={refresh}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--primary-foreground)] press hover:opacity-90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
              {pending ? "Refreshing…" : "Refresh"}
            </button>
            <IconButton label="Toggle light / dark theme" onClick={toggleTheme}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 space-y-6">
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Coverage &amp; DOH use <strong className="text-[var(--foreground)]">JWL only</strong>; “70%+” means strictly above 70% remaining shelf life.
        </p>

        {/* Section 1 — Inventory overview */}
        <section>
          <div className="eyebrow mb-2.5">Inventory overview</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((c, i) => (
              <div key={c.label} className="anim-in" style={{ animationDelay: `${0.05 * i}s` }}>
                <StatCard label={c.label} value={c.value} unit="cases" sub={c.sub} accent={c.accent} icon={c.icon} />
              </div>
            ))}
          </div>
        </section>

        {/* Section 2 — shelf-life split + coverage */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="anim-in" style={{ animationDelay: "0.1s" }}>
            <SectionCard title="Inventory by shelf life" subtitle="Share of JWL stock by remaining shelf life">
              <ShelfChart above70={k.above} between={k.between} below={k.below} total={k.jwl} />
            </SectionCard>
          </div>
          <div className="xl:col-span-2 anim-in" style={{ animationDelay: "0.15s" }}>
            <SectionCard
              title="70%+ stock coverage (FEFO)"
              subtitle="How long JWL stock above 70% shelf life lasts, accounting for batches that age out"
            >
              <CoverageCards sales={salesCov} demand={demandCov} />
            </SectionCard>
          </div>
        </div>

        {/* Section 3 — SKU table */}
        <div className="anim-in" style={{ animationDelay: "0.2s" }}>
          <SectionCard title="SKU inventory & metrics" subtitle="JWL by shelf-life bucket, vendor, sales, demand, DRR and DOH">
            <SkuTable rows={filteredSkus} />
          </SectionCard>
        </div>

        {/* Section 4 — batch table */}
        <div className="anim-in" style={{ animationDelay: "0.25s" }}>
          <SectionCard title="Batch / vendor inventory" subtitle="Every batch × location with shelf-life status and 70% date">
            <BatchTable rows={batchesFiltered} />
          </SectionCard>
        </div>

        {/* Data quality */}
        <div className="anim-in" style={{ animationDelay: "0.3s" }}>
          <SectionCard
            title="Data quality"
            subtitle="Issues detected while reading the sheets"
            right={
              <Badge
                bg={data.dataQuality.length ? "var(--warn-bg)" : "var(--good-bg)"}
                color={data.dataQuality.length ? "var(--warn)" : "var(--good)"}
              >
                {data.dataQuality.length} issues
              </Badge>
            }
          >
            {data.dataQuality.length === 0 ? (
              <p className="text-[13px] text-[var(--muted)]">No data-quality issues detected.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.dataQuality.map((i, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--hover)] px-3 py-2 text-[12px]"
                  >
                    <span
                      className={cn(
                        "mt-1 inline-block h-2 w-2 rounded-full shrink-0",
                        i.severity === "error" ? "bg-[var(--bad)]" : i.severity === "warning" ? "bg-[var(--warn)]" : "bg-[var(--muted)]"
                      )}
                    />
                    <span>
                      <span className="eyebrow mr-1 align-middle">{i.context || i.code}</span>
                      <span className="text-[var(--foreground)]">{i.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <footer className="no-print py-4 text-center text-[11px] text-[var(--muted)]">
          Sleepy Owl RTD Dashboard · {data.month.label} · {data.month.elapsedDays} elapsed days · {data.month.daysInMonth}-day month
        </footer>
      </main>
    </div>
  );
}

/** Recompute a coverage view for a filtered set of SKUs (client-side). */
function recomputeCoverage(view: CoverageView, allowed: Set<string>, todayIso: string): CoverageView {
  const per = view.perSku.filter((s) => allowed.has(s.sku));
  const sum = (f: (s: (typeof per)[number]) => number) => per.reduce((a, s) => a + f(s), 0);
  const tCons = sum((s) => s.consumedAbove70Cases);
  const tDrr = sum((s) => s.drr);
  const below = per.reduce(
    (a, s) => a + s.batches.filter((b) => b.status === "ALREADY_BELOW_70").reduce((x, b) => x + b.initialCases, 0),
    0
  );
  const days = tDrr > 0 ? tCons / tDrr : null;
  return {
    ...view,
    perSku: per,
    totalDrr: round1(tDrr),
    initialAbove70Cases: round1(sum((s) => s.initialAbove70Cases)),
    consumedAbove70Cases: round1(tCons),
    transitionedCases: round1(sum((s) => s.transitionedCases)),
    alreadyBelow70Cases: round1(below),
    effectiveCoverageDays: days != null ? round1(days) : null,
    coverageEndDate: days != null ? addDaysIso(todayIso, Math.floor(days)) : null,
  };
}
