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
    "sticky top-0 z-[1] bg-[var(--card)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)]";
  const stickyFirst = "sticky left-0 z-[1] bg-[var(--card)] shadow-[7px_0_12px_-10px_rgba(15,23,42,0.25)]";
  const shortColor = (v: number) => (v > 0 ? "var(--bad)" : "var(--good)");

  return (
    <div>
      <div className="scroll-x rounded-xl border border-[var(--hairline)]">
        <table className="w-full min-w-[1120px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${th} ${stickyFirst} left-0 z-[2] text-left`}>SKU</th>
              <th className={`${th} text-right`}>Demand (this mo)</th>
              <th className={`${th} text-right`}>75%+ JWL</th>
              <th className={`${th} text-right`}>Vendor</th>
              <th className={`${th} text-right`}>Usable (FEFO)</th>
              <th className={`${th} text-right`}>MTD sales</th>
              <th className={`${th} text-right`}>Next-mo opening</th>
              <th className={`${th} text-right`}>Shortage (this mo)</th>
              <th className={`${th} text-right`}>Shortage (next mo)</th>
              <th className={`${th} text-left`}>Stock-out (sales DRR)</th>
              <th className={`${th} text-right`}>No. of batches</th>
              <th className={`${th} text-right`}>Prod plan</th>
            </tr>
          </thead>
          <tbody>
            {computed.map(({ s, usable, nextOpening, shortageCurr, shortageNext, nb, prod }) => (
              <tr key={s.sku} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors">
                <td className={`${stickyFirst} px-3 py-2.5`}>
                  <div className="font-medium leading-tight">{s.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">{s.sku}</div>
                </td>
                <td className="px-3 py-2.5 text-right tabnum">{fmtInt(s.demandCases)}</td>
                <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--good)" }}>{fmtInt(s.above70Cases)}</td>
                <td className="px-3 py-2.5 text-right tabnum">{fmtInt(s.vendorCases)}</td>
                <td
                  className="px-3 py-2.5 text-right tabnum font-semibold"
                  title={`On hand (75%+ JWL + vendor): ${fmtInt(s.above70Cases + s.vendorCases)} · ages below 75% before sale: ${fmtInt(s.agesOutInclVendorCases)}`}
                >
                  {fmtInt(usable)}
                </td>
                <td className="px-3 py-2.5 text-right tabnum">{fmtInt(s.mtdSalesCases)}</td>
                <td className="px-3 py-2.5 text-right tabnum">{fmtInt(nextOpening)}</td>
                <td className="px-3 py-2.5 text-right tabnum font-medium" style={{ color: shortColor(shortageCurr) }}>
                  {shortageCurr > 0 ? fmtInt(shortageCurr) : "0"}
                </td>
                <td className="px-3 py-2.5 text-right tabnum font-medium" style={{ color: shortColor(shortageNext) }}>
                  {shortageNext > 0 ? fmtInt(shortageNext) : "0"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {s.stockoutInclVendorDate ? (
                    <>
                      <span className="tabnum">{fmtDate(s.stockoutInclVendorDate)}</span>
                      {s.stockoutInclVendorDays != null && (
                        <span className="ml-1 text-[11px] text-[var(--muted)] tabnum">({Math.floor(s.stockoutInclVendorDays)}d)</span>
                      )}
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">— (no sales)</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={nb === 0 ? "" : nb}
                    onChange={(e) => setBatch(s.sku, e.target.value)}
                    placeholder="0"
                    aria-label={`Batches for ${s.sku}`}
                    className="w-16 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-right text-[12.5px] tabnum text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:bg-transparent"
                  />
                </td>
                <td className="px-3 py-2.5 text-right tabnum font-semibold" style={{ color: prod > 0 ? "var(--primary)" : "var(--muted)" }}>
                  {fmtInt(prod)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-semibold">
              <td className={`${stickyFirst} px-3 py-2.5`} style={{ background: "color-mix(in oklab, var(--primary) 7%, var(--card))" }}>Total</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.demand)}</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.above70)}</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.vendor)}</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.usable)}</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.mtd)}</td>
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(T.opening)}</td>
              <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--bad)" }}>{fmtInt(T.shortC)}</td>
              <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--bad)" }}>{fmtInt(T.shortN)}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--primary)" }}>{fmtInt(T.prod)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">Usable (FEFO)</strong> = 75%+ stock (JWL + vendor) you can actually sell before it drops below 75%, from the same FEFO simulation as the stock-out date — the rest ages out (hover for the on-hand vs aged-out split). ·{" "}
        <strong className="text-[var(--foreground)]">Next-mo opening</strong> = Usable − Sales&nbsp;DRR × {daysToNext} days to {fmtDate(nextStart)} (floored at 0). ·{" "}
        <strong className="text-[var(--foreground)]">Shortage (this mo)</strong> = (Demand − MTD sales) − Usable. ·{" "}
        <strong className="text-[var(--foreground)]">Shortage (next mo)</strong> = Demand (same as this month) − Next-mo opening. ·{" "}
        <strong className="text-[var(--foreground)]">Stock-out</strong> = FEFO 75%+ (incl. vendor) at Sales DRR. ·{" "}
        <strong className="text-[var(--foreground)]">Prod plan</strong> = No. of batches × cases-per-batch (400 Cold Brew Black, 800 bottles, 646 other cans; edit the batch count — saved in your browser). Red = shortage, green = covered.
      </p>
    </div>
  );
}
