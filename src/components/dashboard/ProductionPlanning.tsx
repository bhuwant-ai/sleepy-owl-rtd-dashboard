"use client";
import { useEffect, useState } from "react";
import type { SkuRow, BatchRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtDate } from "@/lib/format";
import { SKU_MASTER } from "@/lib/constants";

/** Production batch size (cases) per SKU — from the SKU master. */
const BATCH_SIZE: Record<string, number> = Object.fromEntries(
  SKU_MASTER.map((m) => [m.sku, m.casesPerBatch])
);
const DEFAULT_BATCH = 646;
const STORE_KEY = "sleepyowl.prodBatches";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Display order: regular cans first, then Cold Brew Black, then RTD bottles.
function orderKey(s: SkuRow): number {
  if (s.sku === "CCC-BLK-230-CAN-C24") return 1;
  if (s.category === "RTD Bottles") return 2;
  return 0;
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 1st of the month AFTER the given ISO date's month. */
function firstOfNextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number); // m is 1-based -> JS month index m == next month
  return isoOf(new Date(y, m, 1));
}
function monthShort(iso: string): string {
  return MONTHS[Number(iso.split("-")[1]) - 1];
}
/** "2026-10-07" -> "07 Oct" */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}
function daysBetweenIso(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000);
}

/** Per-SKU list of currently-75%+ batches (JWL + vendor) with the date each drops to <=75%. */
function buildDropSchedule(batches: BatchRow[]): Map<string, Array<{ date: string; cases: number }>> {
  const acc = new Map<string, Map<string, number>>();
  for (const b of batches) {
    if (b.bucket !== "ABOVE_70" || !b.date70) continue; // only stock currently above 75%
    let byDate = acc.get(b.sku);
    if (!byDate) {
      byDate = new Map();
      acc.set(b.sku, byDate);
    }
    byDate.set(b.date70, (byDate.get(b.date70) ?? 0) + b.cases);
  }
  const out = new Map<string, Array<{ date: string; cases: number }>>();
  for (const [sku, byDate] of acc) {
    out.set(
      sku,
      [...byDate.entries()].map(([date, cases]) => ({ date, cases })).sort((a, b) => a.date.localeCompare(b.date))
    );
  }
  return out;
}

/**
 * Production planning table — dense, sized to fit one screen without scrolling.
 * Rendered full-height on the dedicated /production page.
 *
 * Columns are framed around the demand month (the month after `today`, i.e.
 * October when planning at end-September) and the following month (November).
 */
export function ProductionPlanning({
  rows,
  batches,
  today,
}: {
  rows: SkuRow[];
  batches: BatchRow[];
  today: string;
}) {
  const octStart = firstOfNextMonth(today); // 1st of the demand month (e.g. 1 Oct)
  const novStart = firstOfNextMonth(octStart); // 1st of the following month (e.g. 1 Nov)
  const sepLabel = monthShort(today); // "Sep"
  const octLabel = monthShort(octStart); // "Oct"
  const novLabel = monthShort(novStart); // "Nov"
  const scheduleBySku = buildDropSchedule(batches);

  // Editable per-SKU batch counts, persisted in the browser.
  const [batchCounts, setBatchCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s) setBatchCounts(JSON.parse(s));
    } catch {}
  }, []);
  const setBatch = (sku: string, raw: string) => {
    setBatchCounts((prev) => {
      const next = { ...prev };
      const n = Math.max(0, Math.floor(Number(raw)));
      if (!raw || !Number.isFinite(n) || n === 0) delete next[sku];
      else next[sku] = n;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const computed = [...rows]
    .sort((a, b) => orderKey(a) - orderKey(b))
    .map((s) => {
      const schedule = scheduleBySku.get(s.sku) ?? [];
      const totalStock = s.above70Cases + s.vendorCases; // 75%+ JWL + all vendor
      // Current 75%+ stock still >=75% at the start of the demand month.
      const opening75 = schedule.filter((x) => x.date >= octStart).reduce((a, x) => a + x.cases, 0);
      // Of that, the cases that cross below 75% DURING the demand month, by date.
      const octDrops = schedule.filter((x) => x.date >= octStart && x.date < novStart);
      const goingOct = octDrops.reduce((a, x) => a + x.cases, 0);
      // Usable = FEFO 75%+ stock (incl vendor) sellable before it ages below 75%.
      const usable = s.usableInclVendorCases;
      const octShort = Math.max(0, Math.round(s.demandCases - usable));
      const novOpening = Math.max(0, Math.round(usable - s.demandCases)); // usable left after Oct demand
      const novShort = Math.max(0, Math.round(s.demandCases - novOpening)); // Nov demand assumed = Oct
      const nb = batchCounts[s.sku] ?? 0;
      const prod = nb * (BATCH_SIZE[s.sku] ?? DEFAULT_BATCH);
      return { s, totalStock, opening75, goingOct, octDrops, octShort, novShort, nb, prod };
    });

  const T = computed.reduce(
    (a, r) => ({
      sep: a.sep + r.s.mtdSalesCases,
      dem: a.dem + r.s.demandCases,
      jwl: a.jwl + r.s.above70Cases,
      vendor: a.vendor + r.s.vendorCases,
      total: a.total + r.totalStock,
      opening: a.opening + r.opening75,
      going: a.going + r.goingOct,
      octShort: a.octShort + r.octShort,
      novShort: a.novShort + r.novShort,
      prod: a.prod + r.prod,
    }),
    { sep: 0, dem: 0, jwl: 0, vendor: 0, total: 0, opening: 0, going: 0, octShort: 0, novShort: 0, prod: 0 }
  );

  const th =
    "sticky top-0 z-[1] bg-[var(--card)] px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] leading-tight text-[var(--muted)] border-b border-[var(--border)] align-bottom";
  const td = "px-2 py-1 tabnum";
  const shortColor = (v: number) => (v > 0 ? "var(--bad)" : "var(--good)");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--hairline)]">
        <table className="w-full table-fixed border-collapse text-[11.5px]">
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "5.5%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "6.5%" }} />
            <col style={{ width: "8.5%" }} />
            <col style={{ width: "5.5%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${th} text-left`}>SKU</th>
              <th className={`${th} text-right`}>{sepLabel} MTD sales</th>
              <th className={`${th} text-right`}>{octLabel} demand</th>
              <th className={`${th} text-right`}>75%+ JWL</th>
              <th className={`${th} text-right`}>Vendor</th>
              <th className={`${th} text-right`}>Total stock</th>
              <th className={`${th} text-right`}>Opening 75%+ · 1 {octLabel}</th>
              <th className={`${th} text-right`}>Going ≤75% ({octLabel})</th>
              <th className={`${th} text-left`}>Dates ≤75% ({octLabel})</th>
              <th className={`${th} text-right`}>Short ({octLabel})</th>
              <th className={`${th} text-right`}>Short ({novLabel})</th>
              <th className={`${th} text-left`}>Stock-out</th>
              <th className={`${th} text-right`}>Batches</th>
              <th className={`${th} text-right`}>Prod plan</th>
            </tr>
          </thead>
          <tbody>
            {computed.map(({ s, totalStock, opening75, goingOct, octDrops, octShort, novShort, nb, prod }) => {
              const dropTip = octDrops.map((x) => `${shortDate(x.date)}: ${fmtInt(x.cases)}`).join(" · ");
              const datesText = octDrops.map((x) => shortDate(x.date)).join(" · ");
              return (
                <tr key={s.sku} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors">
                  <td className="px-2 py-1">
                    <div className="truncate font-medium leading-tight" title={s.name}>{s.name}</div>
                    <div className="text-[9px] leading-tight text-[var(--muted)]">{s.sku}</div>
                  </td>
                  <td className={`${td} text-right`}>{fmtInt(s.mtdSalesCases)}</td>
                  <td className={`${td} text-right`}>{fmtInt(s.demandCases)}</td>
                  <td className={`${td} text-right`} style={{ color: "var(--good)" }}>{fmtInt(s.above70Cases)}</td>
                  <td className={`${td} text-right`}>{fmtInt(s.vendorCases)}</td>
                  <td className={`${td} text-right font-semibold`}>{fmtInt(totalStock)}</td>
                  <td className={`${td} text-right`}>{fmtInt(opening75)}</td>
                  <td className={`${td} text-right font-medium`} style={{ color: goingOct > 0 ? "var(--warn)" : "var(--muted)" }} title={dropTip}>
                    {goingOct > 0 ? fmtInt(goingOct) : "0"}
                  </td>
                  <td className="px-2 py-1 leading-tight" title={dropTip}>
                    {datesText ? <span className="tabnum">{datesText}</span> : <span className="text-[var(--muted)]">—</span>}
                  </td>
                  <td className={`${td} text-right font-medium`} style={{ color: shortColor(octShort) }}>
                    {octShort > 0 ? fmtInt(octShort) : "0"}
                  </td>
                  <td className={`${td} text-right font-medium`} style={{ color: shortColor(novShort) }}>
                    {novShort > 0 ? fmtInt(novShort) : "0"}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap leading-tight">
                    {s.stockoutInclVendorDate ? (
                      <>
                        <span className="tabnum">{fmtDate(s.stockoutInclVendorDate)}</span>
                        {s.stockoutInclVendorDays != null && (
                          <span className="ml-1 text-[10px] text-[var(--muted)] tabnum">({Math.floor(s.stockoutInclVendorDays)}d)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={nb === 0 ? "" : nb}
                      onChange={(e) => setBatch(s.sku, e.target.value)}
                      placeholder="0"
                      aria-label={`Batches for ${s.sku}`}
                      className="w-14 rounded-md border border-[var(--border)] bg-white px-1.5 py-0.5 text-right text-[11.5px] tabnum text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:bg-transparent"
                    />
                  </td>
                  <td className={`${td} text-right font-semibold`} style={{ color: prod > 0 ? "var(--primary)" : "var(--muted)" }}>
                    {fmtInt(prod)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-semibold">
              <td className="px-2 py-1.5">Total</td>
              <td className={`${td} text-right`}>{fmtInt(T.sep)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.dem)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.jwl)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.vendor)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.total)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.opening)}</td>
              <td className={`${td} text-right`} style={{ color: "var(--warn)" }}>{fmtInt(T.going)}</td>
              <td className="px-2 py-1.5" />
              <td className={`${td} text-right`} style={{ color: "var(--bad)" }}>{fmtInt(T.octShort)}</td>
              <td className={`${td} text-right`} style={{ color: "var(--bad)" }}>{fmtInt(T.novShort)}</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5" />
              <td className={`${td} text-right`} style={{ color: "var(--primary)" }}>{fmtInt(T.prod)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 shrink-0 text-[10.5px] leading-snug text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">{sepLabel} MTD sales</strong> = month-to-date sales · <strong className="text-[var(--foreground)]">{octLabel} demand</strong> = demand plan. ·{" "}
        <strong className="text-[var(--foreground)]">Total stock</strong> = 75%+ JWL + all vendor. ·{" "}
        <strong className="text-[var(--foreground)]">Opening 75%+ · 1 {octLabel}</strong> = current 75%+ stock (JWL + vendor) still ≥75% on 1 {octLabel}. ·{" "}
        <strong className="text-[var(--foreground)]">Going ≤75% ({octLabel})</strong> = of that, cases crossing below 75% during {octLabel} (hover for the by-date split); <strong className="text-[var(--foreground)]">Dates</strong> lists those dates. ·{" "}
        <strong className="text-[var(--foreground)]">Short ({octLabel})</strong> = {octLabel} demand − 75%+ stock sellable before it ages (FEFO). ·{" "}
        <strong className="text-[var(--foreground)]">Short ({novLabel})</strong> = {octLabel} demand − usable stock left after {octLabel} (assumes {novLabel} demand = {octLabel}). ·{" "}
        <strong className="text-[var(--foreground)]">Prod plan</strong> = Batches × size (400 Cold Brew Black · 800 bottles · 646 other cans). Red = shortage.
      </p>
    </div>
  );
}
