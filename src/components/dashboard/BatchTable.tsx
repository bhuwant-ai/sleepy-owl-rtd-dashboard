"use client";
import { useMemo, useState } from "react";
import type { BatchRow } from "@/lib/calc/dashboard";
import type { ShelfBucket } from "@/lib/calc/shelfLife";
import { fmtInt, fmtPct, fmtDate, BUCKET_META } from "@/lib/format";
import { Badge } from "./ui";

export function BatchTable({ rows }: { rows: BatchRow[] }) {
  const [loc, setLoc] = useState<"all" | "JWL" | "VENDOR">("all");
  const [bucket, setBucket] = useState<"all" | ShelfBucket | "UNKNOWN">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (loc === "all" ? true : r.locationType === loc))
      .filter((r) =>
        bucket === "all"
          ? true
          : bucket === "UNKNOWN"
            ? r.bucket === null
            : r.bucket === bucket
      )
      .filter((r) => {
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        return (
          r.sku.toLowerCase().includes(s) ||
          r.batchNo.toLowerCase().includes(s) ||
          r.location.toLowerCase().includes(s)
        );
      })
      .sort((a, b) => (a.remainingPct ?? 999) - (b.remainingPct ?? 999));
  }, [rows, loc, bucket, q]);

  const selCls =
    "rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--foreground)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU / batch / location…"
          className={selCls + " min-w-[200px]"}
        />
        <select value={loc} onChange={(e) => setLoc(e.target.value as typeof loc)} className={selCls}>
          <option value="all">All locations</option>
          <option value="JWL">JWL</option>
          <option value="VENDOR">Vendor</option>
        </select>
        <select value={bucket} onChange={(e) => setBucket(e.target.value as typeof bucket)} className={selCls}>
          <option value="all">All shelf-life</option>
          <option value="ABOVE_70">Above 70%</option>
          <option value="BETWEEN_50_70">50–70%</option>
          <option value="BELOW_50">Below 50%</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <span className="text-xs text-[var(--muted)] ml-auto">{filtered.length} batches</span>
      </div>

      <div className="scroll-x max-h-[520px] overflow-y-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 z-[1] bg-[var(--card)] border-b border-[var(--border)] text-[var(--muted)] shadow-[0_1px_0_var(--border)]">
              <th className="px-2.5 py-2 text-left font-semibold">SKU</th>
              <th className="px-2.5 py-2 text-left font-semibold">Location</th>
              <th className="px-2.5 py-2 text-left font-semibold">Batch</th>
              <th className="px-2.5 py-2 text-left font-semibold">Mfg date</th>
              <th className="px-2.5 py-2 text-right font-semibold">Cases</th>
              <th className="px-2.5 py-2 text-right font-semibold">Shelf life</th>
              <th className="px-2.5 py-2 text-left font-semibold">70% date</th>
              <th className="px-2.5 py-2 text-left font-semibold">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const meta = r.bucket ? BUCKET_META[r.bucket] : null;
              return (
                <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02]">
                  <td className="px-2.5 py-2 font-medium whitespace-nowrap">{r.sku}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <Badge bg={r.locationType === "VENDOR" ? "#ede9fe" : "#e0f2fe"} color={r.locationType === "VENDOR" ? "#6d28d9" : "#0369a1"}>
                      {r.locationType === "VENDOR" ? "Vendor" : "JWL"}
                    </Badge>{" "}
                    <span className="text-xs text-[var(--muted)]">{r.location}</span>
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-xs">{r.batchNo || "—"}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(r.mfd)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmtInt(r.cases)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmtPct(r.remainingPct)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(r.date70)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {meta ? (
                      <Badge bg={meta.bg} color={meta.text}>
                        {meta.label}
                      </Badge>
                    ) : (
                      <Badge>Unknown</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2.5 py-6 text-center text-[var(--muted)]">
                  No batches match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
