"use client";
import { useState } from "react";
import type { SkuRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtNum, fmtDays } from "@/lib/format";
import { cn } from "./ui";

type Col = {
  key: keyof SkuRow;
  label: string;
  render: (r: SkuRow) => string;
  numeric?: boolean;
};

const COLS: Col[] = [
  { key: "sku", label: "SKU", render: (r) => r.sku },
  { key: "category", label: "Category", render: (r) => r.category },
  { key: "jwlCases", label: "JWL", render: (r) => fmtInt(r.jwlCases), numeric: true },
  { key: "above70Cases", label: ">75%", render: (r) => fmtInt(r.above70Cases), numeric: true },
  { key: "between5070Cases", label: "50–75%", render: (r) => fmtInt(r.between5070Cases), numeric: true },
  { key: "below50Cases", label: "<50%", render: (r) => fmtInt(r.below50Cases), numeric: true },
  { key: "vendorCases", label: "Vendor", render: (r) => fmtInt(r.vendorCases), numeric: true },
  { key: "mtdSalesCases", label: "MTD Sales", render: (r) => fmtInt(r.mtdSalesCases), numeric: true },
  { key: "salesDrr", label: "Sales DRR", render: (r) => fmtNum(r.salesDrr), numeric: true },
  { key: "demandCases", label: "Demand", render: (r) => fmtInt(r.demandCases), numeric: true },
  { key: "demandDrr", label: "Demand DRR", render: (r) => fmtNum(r.demandDrr), numeric: true },
  { key: "salesDoh", label: "Sales DOH", render: (r) => fmtDays(r.salesDoh), numeric: true },
  { key: "demandDoh", label: "Demand DOH", render: (r) => fmtDays(r.demandDoh), numeric: true },
];

export function SkuTable({ rows }: { rows: SkuRow[] }) {
  const [sortKey, setSortKey] = useState<keyof SkuRow>("jwlCases");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return dir === "asc" ? cmp : -cmp;
  });

  const clickSort = (key: keyof SkuRow) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(typeof rows[0]?.[key] === "number" ? "desc" : "asc");
    }
  };

  const stickyFirst = "sticky left-0 z-[1] bg-[var(--card)] shadow-[7px_0_12px_-10px_rgba(15,23,42,0.25)]";

  return (
    <div className="scroll-x rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[920px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-[var(--card)]">
            {COLS.map((c, ci) => (
              <th
                key={String(c.key)}
                onClick={() => clickSort(c.key)}
                className={cn(
                  "sticky top-0 z-[2] cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)] bg-[var(--card)]",
                  c.numeric ? "text-right" : "text-left",
                  ci === 0 && "left-0 z-[3] shadow-[7px_0_12px_-10px_rgba(15,23,42,0.25)]"
                )}
              >
                {c.label}
                {sortKey === c.key && <span className="ml-1 text-[var(--primary)]">{dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.sku} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--hover)] transition-colors">
              {COLS.map((c, ci) => (
                <td
                  key={String(c.key)}
                  className={cn(
                    "whitespace-nowrap px-3 py-2.5",
                    c.numeric ? "text-right tabnum" : "text-left",
                    ci === 0 && cn(stickyFirst, "font-medium")
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="px-3 py-6 text-center text-[var(--muted)]">
                No SKUs match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
