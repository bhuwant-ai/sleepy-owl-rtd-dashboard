"use client";
import { useState, Fragment } from "react";
import type { CoverageView } from "@/lib/calc/dashboard";
import { fmtInt, fmtNum, fmtDays, fmtDate, COVERAGE_STATUS_LABEL } from "@/lib/format";
import { cn } from "./ui";

export function CoverageCards({ sales, demand }: { sales: CoverageView; demand: CoverageView }) {
  const [basis, setBasis] = useState<"SALES" | "DEMAND">("SALES");
  const view = basis === "SALES" ? sales : demand;

  return (
    <div>
      {/* sliding segmented toggle */}
      <div className="relative mb-4 inline-flex rounded-lg glass p-0.5 text-[12px] font-medium">
        <span
          className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-[var(--primary)] shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: basis === "SALES" ? "translateX(0)" : "translateX(100%)" }}
          aria-hidden
        />
        {(["SALES", "DEMAND"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBasis(b)}
            className={cn(
              "relative z-10 w-[120px] rounded-md px-3 py-1.5 transition-colors",
              basis === b ? "text-[var(--primary-foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {b === "SALES" ? "Sales-based" : "Demand-plan"}
          </button>
        ))}
      </div>

      {/* the flow */}
      <div className="flex flex-wrap items-stretch gap-2 mb-4">
        <Flow label="Initial 75%+ stock" value={fmtInt(view.initialAbove70Cases)} unit="cases" />
        <Op>−</Op>
        <Flow label="Ages below 75% first" value={fmtInt(view.transitionedCases)} unit="cases" tone="warn" />
        <Op>=</Op>
        <Flow label="Effective usable 75%+" value={fmtInt(view.consumedAbove70Cases)} unit="cases" tone="good" />
        <Op>÷</Op>
        <Flow label={basis === "SALES" ? "Sales DRR" : "Demand DRR"} value={fmtNum(view.totalDrr)} unit="cases/day" />
        <Op>=</Op>
        <Flow label="Coverage" value={fmtDays(view.effectiveCoverageDays)} unit="days" tone="brand" />
      </div>
      <p className="text-[13px] text-[var(--muted)] mb-4 leading-relaxed">
        Estimated 75%+ stock runs out around{" "}
        <span className="font-semibold text-[var(--foreground)]">{fmtDate(view.coverageEndDate)}</span> (JWL only, FEFO
        consumption). A naïve “inventory ÷ DRR” would overstate this by counting the{" "}
        <span className="tabnum font-medium text-[var(--warn)]">{fmtInt(view.transitionedCases)}</span> cases that age below
        75% before they can be sold.
      </p>

      <PerSkuTable view={view} />
    </div>
  );
}

function Flow({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "good" | "warn" | "brand";
}) {
  const color =
    tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "brand" ? "var(--primary)" : "var(--foreground)";
  return (
    <div className="flex-1 min-w-[128px] rounded-xl border border-[var(--hairline)] bg-[var(--hover)] px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[18px] font-bold leading-none tabnum" style={{ color }}>
        {value} <span className="text-[11px] font-normal text-[var(--muted)]">{unit}</span>
      </div>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center px-0.5 text-[16px] font-bold text-[var(--muted)]">{children}</div>;
}

function PerSkuTable({ view }: { view: CoverageView }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (sku: string) => {
    const n = new Set(open);
    n.has(sku) ? n.delete(sku) : n.add(sku);
    setOpen(n);
  };

  const th = "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] border-b border-[var(--border)]";

  return (
    <div className="scroll-x rounded-xl border border-[var(--hairline)]">
      <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-[var(--card)]">
            <th className={th + " text-left"}>SKU</th>
            <th className={th + " text-right"}>DRR</th>
            <th className={th + " text-right"}>Initial 75%+</th>
            <th className={th + " text-right"}>Effective usable</th>
            <th className={th + " text-right"}>Ages out</th>
            <th className={th + " text-right"}>Coverage days</th>
            <th className={th + " text-left"}>Runs out</th>
          </tr>
        </thead>
        <tbody>
          {view.perSku.map((s) => {
            const isOpen = open.has(s.sku);
            const activeBatches = s.batches.filter((b) => b.initialCases > 0);
            return (
              <Fragment key={s.sku}>
                <tr
                  className="border-b border-[var(--hairline)] hover:bg-[var(--hover)] cursor-pointer transition-colors"
                  onClick={() => toggle(s.sku)}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                    <span className="mr-1 inline-block w-3 text-[var(--muted)]">{isOpen ? "▾" : "▸"}</span>
                    {s.sku}
                  </td>
                  <td className="px-3 py-2.5 text-right tabnum">{fmtNum(s.drr)}</td>
                  <td className="px-3 py-2.5 text-right tabnum">{fmtInt(s.initialAbove70Cases)}</td>
                  <td className="px-3 py-2.5 text-right tabnum" style={{ color: "var(--good)" }}>
                    {fmtInt(s.consumedAbove70Cases)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabnum" style={{ color: s.transitionedCases > 0 ? "var(--warn)" : undefined }}>
                    {fmtInt(s.transitionedCases)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabnum font-semibold">{fmtDays(s.effectiveCoverageDays)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabnum">{fmtDate(s.coverageEndDate)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-[var(--hover)]">
                    <td colSpan={7} className="px-4 py-3">
                      {activeBatches.length === 0 ? (
                        <div className="text-[11px] text-[var(--muted)]">No 75%+ batches for this SKU at JWL.</div>
                      ) : (
                        <table className="w-full text-[11.5px]">
                          <thead>
                            <tr className="text-[var(--muted)]">
                              <th className="px-2 py-1 text-left font-medium">FEFO #</th>
                              <th className="px-2 py-1 text-left font-medium">Batch</th>
                              <th className="px-2 py-1 text-left font-medium">Mfg</th>
                              <th className="px-2 py-1 text-left font-medium">Drops ≤75%</th>
                              <th className="px-2 py-1 text-right font-medium">Cases</th>
                              <th className="px-2 py-1 text-right font-medium">Sold &gt;75%</th>
                              <th className="px-2 py-1 text-right font-medium">Aged out</th>
                              <th className="px-2 py-1 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeBatches
                              .sort((a, b) => (a.fefoPriority ?? 99) - (b.fefoPriority ?? 99))
                              .map((b, i) => (
                                <tr key={i} className="border-t border-[var(--hairline)]">
                                  <td className="px-2 py-1 tabnum">{b.fefoPriority ?? "—"}</td>
                                  <td className="px-2 py-1">{b.batchNo || "—"}</td>
                                  <td className="px-2 py-1 tabnum">{fmtDate(b.mfd)}</td>
                                  <td className="px-2 py-1 tabnum">{fmtDate(b.date70)}</td>
                                  <td className="px-2 py-1 text-right tabnum">{fmtInt(b.initialCases)}</td>
                                  <td className="px-2 py-1 text-right tabnum" style={{ color: "var(--good)" }}>{fmtInt(b.consumedAbove70)}</td>
                                  <td className="px-2 py-1 text-right tabnum" style={{ color: b.transitionedBelow70 > 0 ? "var(--warn)" : undefined }}>{fmtInt(b.transitionedBelow70)}</td>
                                  <td className="px-2 py-1">{COVERAGE_STATUS_LABEL[b.status] ?? b.status}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
