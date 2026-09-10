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

  const ctrl =
    "rounded-lg glass px-2.5 py-1.5 text-[12px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";
  const th = "sticky top-0 z-[1] bg-[var(--card)] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU / batch / location…"
          className={ctrl + " min-w-[210px] flex-1 sm:flex-none"}
        />
        <select value={loc} onChange={(e) => setLoc(e.target.value as typeof loc)} className={ctrl} aria-label="Location">
          <option value="all">All locations</option>
          <option value="JWL">JWL</option>
          <option value="VENDOR">Vendor</option>
        </select>
        <select value={bucket} onChange={(e) => setBucket(e.target.value as typeof bucket)} className={ctrl} aria-label="Shelf-life bucket">
          <option value="all">All shelf-life</option>
          <option value="ABOVE_70">Above 70%</option>
          <option value="BETWEEN_50_70">50–70%</option>
          <option value="BELOW_50">Below 50%</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <span className="ml-auto text-[11px] text-[var(--muted)] tabnum">{filtered.length} batches</span>
      </div>

      <div className="scroll-x max-h-[520px] overflow-y-auto rounded-xl border border-[var(--hairline)]">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={th + " text-left"}>SKU</th>
              <th className={th + " text-left"}>Location</th>
              <th className={th + " text-left"}>Batch</th>
              <th className={th + " text-left"}>Mfg date</th>
              <th className={th + " text-right"}>Cases</th>
              <th className={th + " text-right"}>Shelf life</th>
              <th className={th + " text-left"}>70% date</th>
              <th className={th + " text-left"}>Bucket</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const meta = r.bucket ? BUCKET_META[r.bucket] : null;
              const isVendor = r.locationType === "VENDOR";
              return (
                <tr key={i} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">{r.sku}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Badge
                      bg={isVendor ? "color-mix(in oklab, var(--brand-sky) 15%, transparent)" : "color-mix(in oklab, var(--primary) 14%, transparent)"}
                      color={isVendor ? "var(--brand-sky)" : "var(--primary)"}
                    >
                      {isVendor ? "Vendor" : "JWL"}
                    </Badge>{" "}
                    <span className="text-[11px] text-[var(--muted)]">{r.location}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-[var(--muted)]">{r.batchNo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabnum">{fmtDate(r.mfd)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabnum">{fmtInt(r.cases)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabnum">{fmtPct(r.remainingPct)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabnum">{fmtDate(r.date70)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
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
                <td colSpan={8} className="px-3 py-6 text-center text-[var(--muted)]">
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
