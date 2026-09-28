"use client";
import { useEffect, useState } from "react";
import type { SkuRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtDate } from "@/lib/format";
import { SKU_MASTER } from "@/lib/constants";

/** Production batch size (cases) per SKU — from the SKU master. */
const BATCH_SIZE: Record<string, number> = Object.fromEntries(
  SKU_MASTER.map((m) => [m.sku, m.casesPerBatch])
);
const DEFAULT_BATCH = 646;
const STORE_KEY = "sleepyowl.prodBatches";

// Display order: regular cans first, then Cold Brew Black, then RTD bottles.
function orderKey(s: SkuRow): number {
  if (s.sku === "CCC-BLK-230-CAN-C24") return 1;
  if (s.category === "RTD Bottles") return 2;
  return 0;
}

function nextMonthStartIso(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const d = new Date(y, m, 1); // ISO month is 1-based -> 1st of next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function daysBetweenIso(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000);
}

/**
 * Production planning table — dense, sized to fit one screen without scrolling.
 * Rendered full-height on the dedicated /production page (the parent supplies
 * the height via a flex container).
 */
export function ProductionPlanning({ rows, today }: { rows: SkuRow[]; today: string }) {
  const nextStart = nextMonthStartIso(today);
  const daysToNext = Math.max(0, daysBetweenIso(today, nextStart));

  // Editable per-SKU batch counts, persisted in the browser.
  const [batches, setBatches] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s) setBatches(JSON.parse(s));
    } catch {}
  }, []);
  const setBatch = (sku: string, raw: string) => {
    setBatches((prev) => {
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
      // Usable = FEFO stock sellable while still >75% (incl. vendor) at the sales
      // DRR — the SAME simulation that drives the stock-out date. Cases that age
      // below 75% before they can be sold are NOT counted (that gap is agesOut).
      const usable = s.usableInclVendorCases;
      const pending = Math.max(0, s.demandCases - s.mtdSalesCases); // pending sale this month
      const shortageCurr = Math.round(pending - usable); // + = shortage, - = surplus
      const nextOpening = Math.max(0, Math.round(usable - s.salesDrr * daysToNext));
      const shortageNext = Math.round(s.demandCases - nextOpening); // demand assumed same next month
      const nb = batches[s.sku] ?? 0;
      const batchSize = BATCH_SIZE[s.sku] ?? DEFAULT_BATCH;
      return { s, usable, nextOpening, shortageCurr, shortageNext, nb, prod: nb * batchSize };
    });

  const T = computed.reduce(
    (a, r) => ({
      demand: a.demand + r.s.demandCases,
      above70: a.above70 + r.s.above70Cases,
      vendor: a.vendor + r.s.vendorCases,
      usable: a.usable + r.usable,
      mtd: a.mtd + r.s.mtdSalesCases,
      opening: a.opening + r.nextOpening,
      shortC: a.shortC + Math.max(0, r.shortageCurr),
      shortN: a.shortN + Math.max(0, r.shortageNext),
      prod: a.prod + r.prod,
    }),
    { demand: 0, above70: 0, vendor: 0, usable: 0, mtd: 0, opening: 0, shortC: 0, shortN: 0, prod: 0 }
  );

  const th =
    "sticky top-0 z-[1] bg-[var(--card)] px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] leading-tight text-[var(--muted)] border-b border-[var(--border)] align-bottom";
  const td = "px-2 py-1 tabnum";
  const shortColor = (v: number) => (v > 0 ? "var(--bad)" : "var(--good)");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--hairline)]">
        <table className="w-full table-fixed border-collapse text-[11.5px]">
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${th} text-left`}>SKU</th>
              <th className={`${th} text-right`}>Demand</th>
              <th className={`${th} text-right`}>75%+ JWL</th>
              <th className={`${th} text-right`}>Vendor</th>
              <th className={`${th} text-right`}>Usable (FEFO)</th>
              <th className={`${th} text-right`}>MTD</th>
              <th className={`${th} text-right`}>Next open</th>
              <th className={`${th} text-right`}>Short (this mo)</th>
              <th className={`${th} text-right`}>Short (next mo)</th>
              <th className={`${th} text-left`}>Stock-out</th>
              <th className={`${th} text-right`}>Batches</th>
              <th className={`${th} text-right`}>Prod plan</th>
            </tr>
          </thead>
          <tbody>
            {computed.map(({ s, usable, nextOpening, shortageCurr, shortageNext, nb, prod }) => (
              <tr key={s.sku} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors">
                <td className="px-2 py-1">
                  <div className="truncate font-medium leading-tight" title={s.name}>{s.name}</div>
                  <div className="text-[9px] leading-tight text-[var(--muted)]">{s.sku}</div>
                </td>
                <td className={`${td} text-right`}>{fmtInt(s.demandCases)}</td>
                <td className={`${td} text-right`} style={{ color: "var(--good)" }}>{fmtInt(s.above70Cases)}</td>
                <td className={`${td} text-right`}>{fmtInt(s.vendorCases)}</td>
                <td
                  className={`${td} text-right font-semibold`}
                  title={`On hand (75%+ JWL + vendor): ${fmtInt(s.above70Cases + s.vendorCases)} · ages below 75% before sale: ${fmtInt(s.agesOutInclVendorCases)}`}
                >
                  {fmtInt(usable)}
                </td>
                <td className={`${td} text-right`}>{fmtInt(s.mtdSalesCases)}</td>
                <td className={`${td} text-right`}>{fmtInt(nextOpening)}</td>
                <td className={`${td} text-right font-medium`} style={{ color: shortColor(shortageCurr) }}>
                  {shortageCurr > 0 ? fmtInt(shortageCurr) : "0"}
                </td>
                <td className={`${td} text-right font-medium`} style={{ color: shortColor(shortageNext) }}>
                  {shortageNext > 0 ? fmtInt(shortageNext) : "0"}
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
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-semibold">
              <td className="px-2 py-1.5">Total</td>
              <td className={`${td} text-right`}>{fmtInt(T.demand)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.above70)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.vendor)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.usable)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.mtd)}</td>
              <td className={`${td} text-right`}>{fmtInt(T.opening)}</td>
              <td className={`${td} text-right`} style={{ color: "var(--bad)" }}>{fmtInt(T.shortC)}</td>
              <td className={`${td} text-right`} style={{ color: "var(--bad)" }}>{fmtInt(T.shortN)}</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5" />
              <td className={`${td} text-right`} style={{ color: "var(--primary)" }}>{fmtInt(T.prod)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 shrink-0 text-[10.5px] leading-snug text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">Usable (FEFO)</strong> = 75%+ stock (JWL + vendor) sellable before it drops below 75% — same sim as the stock-out date; the rest ages out (hover a Usable cell). ·{" "}
        <strong className="text-[var(--foreground)]">Next open</strong> = Usable − Sales&nbsp;DRR × {daysToNext}d to {fmtDate(nextStart)}. ·{" "}
        <strong className="text-[var(--foreground)]">Short (this mo)</strong> = (Demand − MTD) − Usable · <strong className="text-[var(--foreground)]">Short (next mo)</strong> = Demand − Next open. ·{" "}
        <strong className="text-[var(--foreground)]">Prod plan</strong> = Batches × size (400 Cold Brew Black · 800 bottles · 646 other cans). Red = shortage, green = covered.
      </p>
    </div>
  );
}
