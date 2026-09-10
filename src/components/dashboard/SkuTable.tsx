"use client";
import { useState } from "react";
import type { SkuRow } from "@/lib/calc/dashboard";
import { fmtInt, fmtNum, fmtDays } from "@/lib/format";
import { cn } from "./ui";

type Col = {
  key: keyof SkuRow;
  label: string;
  render: (r: SkuRow) => string;
  align?: "left" | "right";
  numeric?: boolean;
};

const COLS: Col[] = [
  { key: "sku", label: "SKU", render: (r) => r.sku, align: "left" },
  { key: "category", label: "Category", render: (r) => r.category, align: "left" },
  { key: "jwlCases", label: "JWL", render: (r) => fmtInt(r.jwlCases), numeric: true },
  { key: "above70Cases", label: ">70%", render: (r) => fmtInt(r.above70Cases), numeric: true },
  { key: "between5070Cases", label: "50–70%", render: (r) => fmtInt(r.between5070Cases), numeric: true },
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

  return (
    <div className="scroll-x -mx-1">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {COLS.map((c) => (
              <th
                key={String(c.key)}
                onClick={() => clickSort(c.key)}
                className={cn(
                  "cursor-pointer select-none px-2.5 py-2 font-semibold text-[var(--muted)] whitespace-nowrap",
                  c.numeric ? "text-right" : "text-left"
                )}
              >
                {c.label}
                {sortKey === c.key && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.sku} className="border-b border-[var(--border)] last:border-0 hover:bg-black/[0.02]">
              {COLS.map((c) => (
                <td
                  key={String(c.key)}
                  className={cn(
                    "px-2.5 py-2 whitespace-nowrap tabular-nums",
                    c.numeric ? "text-right" : "text-left",
                    c.key === "sku" && "font-medium"
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="px-2.5 py-6 text-center text-[var(--muted)]">
                No SKUs match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
