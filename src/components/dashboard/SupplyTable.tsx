"use client";
import type { SkuRow, BatchRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtNum, fmtDate, addDaysIso } from "@/lib/format";

/** First day of the month AFTER the given ISO date (ISO month is 1-based, and
 *  JS Date(y, m, 1) with that 1-based month lands on the next month's 1st). */
function nextMonthStartIso(todayIso: string): string {
  const [y, m] = todayIso.split("-").map(Number);
  const d = new Date(y, m, 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-01`;
}
function daysBetweenIso(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000);
}

export function SupplyTable({ rows, batches, today }: { rows: SkuRow[]; batches: BatchRow[]; today: string }) {
  const nextStart = nextMonthStartIso(today);
  const daysToNext = Math.max(0, daysBetweenIso(today, nextStart));

  const vendorBySku = new Map<string, BatchRow[]>();
  for (const b of batches) {
    if (b.locationType !== "VENDOR") continue;
    if (!vendorBySku.has(b.sku)) vendorBySku.set(b.sku, []);
    vendorBySku.get(b.sku)!.push(b);
  }

  const th =
    "sticky top-0 z-[1] bg-[var(--card)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)]";
  const stickyFirst = "sticky left-0 z-[1] bg-[var(--card)] shadow-[7px_0_12px_-10px_rgba(15,23,42,0.25)]";

  return (
    <div>
      <div className="scroll-x rounded-xl border border-[var(--hairline)]">
        <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${th} ${stickyFirst} left-0 z-[2] text-left`}>SKU</th>
              <th className={`${th} text-right`}>Warehouse (JWL)</th>
              <th className={`${th} text-right`}>&gt;70% (JWL)</th>
              <th className={`${th} text-right`}>Sales DRR</th>
              <th className={`${th} text-left`}>Vendor (by mfg date)</th>
              <th className={`${th} text-right`}>70%+ incl. vendor</th>
              <th className={`${th} text-right`}>Proj. opening {fmtDate(nextStart)}</th>
              <th className={`${th} text-left`}>Stock-out (70%+ incl. vendor)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const vb = (vendorBySku.get(s.sku) || [])
                .slice()
                .sort((a, b) => (a.mfd || "").localeCompare(b.mfd || ""));
              const vendorAbove70 = vb
                .filter((x) => x.bucket === "ABOVE_70")
                .reduce((a, x) => a + x.cases, 0);
              const total70incl = s.above70Cases + vendorAbove70;
              const totalPhysical = s.jwlCases + s.vendorCases;
              const opening = Math.max(0, Math.round(totalPhysical - s.salesDrr * daysToNext));
              const days = s.salesDrr > 0 ? total70incl / s.salesDrr : null;
              const stockoutDate = days != null ? addDaysIso(today, Math.floor(days)) : null;

              return (
                <tr key={s.sku} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors align-top">
                  <td className={`${stickyFirst} whitespace-nowrap px-3 py-2.5 font-medium`}>{s.sku}</td>
                  <td className="px-3 py-2.5 text-right tabnum">{fmtInt(s.jwlCases)}</td>
                  <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--good)" }}>{fmtInt(s.above70Cases)}</td>
                  <td className="px-3 py-2.5 text-right tabnum">{fmtNum(s.salesDrr)}</td>
                  <td className="px-3 py-2.5">
                    {s.vendorCases > 0 ? (
                      <div>
                        <div className="font-medium tabnum">{fmtInt(s.vendorCases)}</div>
                        {vb.map((x, i) => (
                          <div key={i} className="text-[11px] text-[var(--muted)] tabnum whitespace-nowrap">
                            {fmtInt(x.cases)} · {fmtDate(x.mfd)}
                            {x.bucket && x.bucket !== "ABOVE_70" ? " (≤70%)" : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabnum font-semibold">{fmtInt(total70incl)}</td>
                  <td className="px-3 py-2.5 text-right tabnum">{fmtInt(opening)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {stockoutDate ? (
                      <>
                        <span className="tabnum">{fmtDate(stockoutDate)}</span>
                        <span className="ml-1 text-[11px] text-[var(--muted)] tabnum">({Math.floor(days!)}d)</span>
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">— (no sales)</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[var(--muted)]">
                  No SKUs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">Warehouse (JWL)</strong> = current sellable JWL stock (excludes non-sellable/expired). ·{" "}
        <strong className="text-[var(--foreground)]">Vendor</strong> listed per manufacturing date (Lotus). ·{" "}
        <strong className="text-[var(--foreground)]">70%+ incl. vendor</strong> = JWL &gt;70% + vendor &gt;70%. ·{" "}
        <strong className="text-[var(--foreground)]">Proj. opening</strong> = (JWL + vendor) − Sales&nbsp;DRR × {daysToNext} days to {fmtDate(nextStart)}, floored at 0. ·{" "}
        <strong className="text-[var(--foreground)]">Stock-out</strong> = today + (70%+ incl. vendor ÷ Sales&nbsp;DRR). All based on Sales DRR.
      </p>
    </div>
  );
}
