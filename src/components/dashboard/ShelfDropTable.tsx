"use client";
import type { BatchRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtDate } from "@/lib/format";

/** Whole-day difference todayIso -> iso (positive = in the future). */
function daysFromToday(todayIso: string, iso: string): number {
  const [ay, am, ad] = todayIso.split("-").map(Number);
  const [by, bm, bd] = iso.split("-").map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000
  );
}

/**
 * "Stock crossing below 75%" — the aging schedule.
 *
 * Lists stock that is CURRENTLY above 75% remaining shelf life (bucket
 * ABOVE_70) and the date each batch first drops to <=75% (its `date70`).
 * Rows are summed by SKU + drop-date + source and sorted soonest-first, so you
 * can see exactly how much good stock ages out and when — which is the reason
 * the FEFO "usable" figure is lower than the raw on-hand 75%+ quantity.
 */
export function ShelfDropTable({ batches, today }: { batches: BatchRow[]; today: string }) {
  const map = new Map<
    string,
    { sku: string; name: string; source: string; date70: string; cases: number }
  >();
  for (const b of batches) {
    if (b.bucket !== "ABOVE_70" || !b.date70) continue; // only stock that will still cross
    const source = b.locationType === "VENDOR" ? "Vendor" : "JWL";
    const key = `${b.sku}|${b.date70}|${source}`;
    const prev = map.get(key);
    if (prev) prev.cases += b.cases;
    else map.set(key, { sku: b.sku, name: b.name, source, date70: b.date70, cases: b.cases });
  }
  const rows = [...map.values()].sort((a, b) =>
    a.date70 === b.date70 ? a.sku.localeCompare(b.sku) : a.date70.localeCompare(b.date70)
  );
  const total = rows.reduce((a, r) => a + r.cases, 0);
  const within14 = rows.filter((r) => daysFromToday(today, r.date70) <= 14).reduce((a, r) => a + r.cases, 0);

  const th =
    "sticky top-0 z-[1] bg-[var(--card)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)]";
  const stickyFirst = "sticky left-0 z-[1] bg-[var(--card)] shadow-[7px_0_12px_-10px_rgba(15,23,42,0.25)]";

  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--muted)]">
        No stock is currently above 75% for the selected SKUs — nothing left to cross the threshold.
      </p>
    );
  }

  return (
    <div>
      <div className="scroll-x rounded-xl border border-[var(--hairline)]">
        <table className="w-full min-w-[680px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${th} ${stickyFirst} left-0 z-[2] text-left`}>SKU</th>
              <th className={`${th} text-left`}>Source</th>
              <th className={`${th} text-right`}>Cases</th>
              <th className={`${th} text-left`}>Drops ≤75% on</th>
              <th className={`${th} text-right`}>In (days)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = daysFromToday(today, r.date70);
              const soon = d <= 14;
              return (
                <tr
                  key={i}
                  className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors"
                >
                  <td className={`${stickyFirst} px-3 py-2.5`}>
                    <div className="font-medium leading-tight">{r.name}</div>
                    <div className="text-[10px] text-[var(--muted)]">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2.5">{r.source}</td>
                  <td className="px-3 py-2.5 text-right tabnum font-medium">{fmtInt(r.cases)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabnum">{fmtDate(r.date70)}</td>
                  <td
                    className="px-3 py-2.5 text-right tabnum"
                    style={{ color: soon ? "var(--warn)" : "var(--muted)" }}
                  >
                    {d}d
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-semibold">
              <td
                className={`${stickyFirst} px-3 py-2.5`}
                style={{ background: "color-mix(in oklab, var(--primary) 7%, var(--card))" }}
              >
                Total 75%+ stock
              </td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right tabnum">{fmtInt(total)}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Only stock <strong className="text-[var(--foreground)]">currently above 75%</strong> is listed — each row is the date that batch first drops to ≤75% remaining shelf life (MFD + 25% of total shelf life), summed by SKU, source and date. ·{" "}
        <strong style={{ color: "var(--warn)" }}>{fmtInt(within14)}</strong> cases cross within 14 days (amber). Stock already at ≤75% sits in the 50–75% / below-50% buckets in the batch table below.
      </p>
    </div>
  );
}
