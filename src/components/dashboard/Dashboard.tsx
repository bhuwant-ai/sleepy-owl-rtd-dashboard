"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData, CoverageView } from "@/lib/calc/dashboard";
import type { Category } from "@/lib/types";
import { fmtInt, fmtPct, fmtDays, fmtDate, addDaysIso } from "@/lib/format";
import { StatCard, SectionCard, Card, Badge, cn } from "./ui";
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
  const selCls = "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

  return (
    <div className="min-h-full">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[var(--brand)] text-white grid place-items-center text-lg">☕</div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Sleepy Owl — RTD Inventory Dashboard</h1>
              <p className="text-xs text-[var(--muted)]">RTD Cans &amp; Bottles · JWL warehouse &amp; vendor</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted)]">
            <div className="text-right">
              <div className="font-semibold text-[var(--foreground)]">{data.month.label}</div>
              <div>Data as of {new Date(data.generatedAt).toLocaleString("en-IN")}</div>
            </div>
            <button
              onClick={refresh}
              disabled={pending}
              className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Refreshing…" : "↻ Refresh data"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 space-y-5">
        {/* Filters */}
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)] mr-1">Filters:</span>
          <select
            className={selCls}
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
          <select className={selCls} value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="all">All SKUs</option>
            {skuOptions.map((s) => (
              <option key={s.sku} value={s.sku}>
                {s.sku}
              </option>
            ))}
          </select>
          {(category !== "all" || sku !== "all") && (
            <button
              onClick={() => {
                setCategory("all");
                setSku("all");
              }}
              className="text-xs text-[var(--brand)] underline"
            >
              Reset
            </button>
          )}
          <span className="ml-auto text-xs text-[var(--muted)]">
            Coverage &amp; DOH use <strong>JWL only</strong>; 70%+ means strictly above 70%.
          </span>
        </Card>

        {/* Section 1 — Inventory overview */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">Inventory overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Total JWL" value={fmtInt(k.jwl)} unit="cases" sub="Racks + Low Shelf Life" />
            <StatCard label="Above 70%" value={fmtInt(k.above)} unit="cases" sub={fmtPct(k.abovePct) + " of JWL"} accent="var(--good)" />
            <StatCard label="50–70%" value={fmtInt(k.between)} unit="cases" sub={fmtPct(k.betweenPct) + " of JWL"} accent="var(--warn)" />
            <StatCard label="Below 50%" value={fmtInt(k.below)} unit="cases" sub={fmtPct(k.belowPct) + " of JWL"} accent="var(--bad)" />
            <StatCard label="At Vendor" value={fmtInt(k.vendor)} unit="cases" sub="Lotus (separate)" accent="var(--brand-2)" />
          </div>
        </section>

        {/* Section 2 — shelf-life split + coverage headline */}
        <div className="grid lg:grid-cols-3 gap-5">
          <SectionCard title="Inventory by shelf life" subtitle="Share of JWL stock by remaining shelf life">
            <ShelfChart above70={k.above} between={k.between} below={k.below} total={k.jwl} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard
              title="70%+ stock coverage (FEFO)"
              subtitle="How long JWL stock above 70% shelf life lasts, accounting for batches that age out"
            >
              <CoverageCards sales={salesCov} demand={demandCov} />
            </SectionCard>
          </div>
        </div>

        {/* Section 3 — SKU table */}
        <SectionCard title="SKU inventory & metrics" subtitle="JWL by shelf-life bucket, vendor, sales, demand, DRR and DOH">
          <SkuTable rows={filteredSkus} />
        </SectionCard>

        {/* Section 4 — batch table */}
        <SectionCard title="Batch / vendor inventory" subtitle="Every batch × location with shelf-life status and 70% date">
          <BatchTable rows={batchesFiltered} />
        </SectionCard>

        {/* Data quality */}
        <SectionCard
          title="Data quality"
          subtitle="Issues detected while reading the sheets"
          right={<Badge bg={data.dataQuality.length ? "var(--warn-bg)" : "var(--good-bg)"} color={data.dataQuality.length ? "var(--warn)" : "var(--good)"}>{data.dataQuality.length} issues</Badge>}
        >
          {data.dataQuality.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No data-quality issues detected. ✅</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.dataQuality.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 inline-block h-2 w-2 rounded-full shrink-0",
                      i.severity === "error" ? "bg-[var(--bad)]" : i.severity === "warning" ? "bg-[var(--warn)]" : "bg-slate-400"
                    )}
                  />
                  <span>
                    <span className="text-[var(--muted)]">[{i.context || i.code}]</span> {i.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <footer className="py-4 text-center text-xs text-[var(--muted)]">
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
