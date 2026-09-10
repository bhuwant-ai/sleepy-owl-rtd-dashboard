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
      {/* basis toggle */}
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-0.5 mb-4">
        {(["SALES", "DEMAND"] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBasis(b)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition",
              basis === b ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {b === "SALES" ? "Sales-based" : "Demand-plan"}
          </button>
        ))}
      </div>

      {/* the flow */}
      <div className="flex flex-wrap items-stretch gap-2 mb-4">
        <Flow label="Initial 70%+ stock" value={`${fmtInt(view.initialAbove70Cases)}`} unit="cases" />
        <Op>−</Op>
        <Flow label="Ages below 70% first" value={fmtInt(view.transitionedCases)} unit="cases" tone="warn" />
        <Op>=</Op>
        <Flow label="Effective usable 70%+" value={fmtInt(view.consumedAbove70Cases)} unit="cases" tone="good" />
        <Op>÷</Op>
        <Flow label={basis === "SALES" ? "Sales DRR" : "Demand DRR"} value={fmtNum(view.totalDrr)} unit="cases/day" />
        <Op>=</Op>
        <Flow label="Coverage" value={fmtDays(view.effectiveCoverageDays)} unit="days" tone="brand" />
      </div>
      <p className="text-sm text-[var(--muted)] mb-4">
        Estimated 70%+ stock runs out around{" "}
        <span className="font-semibold text-[var(--foreground)]">{fmtDate(view.coverageEndDate)}</span>{" "}
        (JWL only, FEFO consumption). Naïve “inventory ÷ DRR” would overstate this by counting the{" "}
        {fmtInt(view.transitionedCases)} cases that age below 70% before they can be sold.
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
    tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "brand" ? "var(--brand)" : "var(--foreground)";
  return (
    <div className="flex-1 min-w-[130px] rounded-lg border border-[var(--border)] bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color }}>
        {value} <span className="text-xs font-normal text-[var(--muted)]">{unit}</span>
      </div>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center text-lg font-bold text-[var(--muted)] px-0.5">{children}</div>;
}

function PerSkuTable({ view }: { view: CoverageView }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (sku: string) => {
    const n = new Set(open);
    n.has(sku) ? n.delete(sku) : n.add(sku);
    setOpen(n);
  };

  return (
    <div className="scroll-x">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
            <th className="px-2.5 py-2 text-left font-semibold">SKU</th>
            <th className="px-2.5 py-2 text-right font-semibold">DRR</th>
            <th className="px-2.5 py-2 text-right font-semibold">Initial 70%+</th>
            <th className="px-2.5 py-2 text-right font-semibold">Effective usable</th>
            <th className="px-2.5 py-2 text-right font-semibold">Ages out</th>
            <th className="px-2.5 py-2 text-right font-semibold">Coverage days</th>
            <th className="px-2.5 py-2 text-left font-semibold">Runs out</th>
          </tr>
        </thead>
        <tbody>
          {view.perSku.map((s) => {
            const isOpen = open.has(s.sku);
            const activeBatches = s.batches.filter((b) => b.initialCases > 0);
            return (
              <Fragment key={s.sku}>
                <tr
                  className="border-b border-[var(--border)] hover:bg-black/[0.02] cursor-pointer"
                  onClick={() => toggle(s.sku)}
                >
                  <td className="px-2.5 py-2 font-medium whitespace-nowrap">
                    <span className="inline-block w-4 text-[var(--muted)]">{isOpen ? "▾" : "▸"}</span>
                    {s.sku}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmtNum(s.drr)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmtInt(s.initialAbove70Cases)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums" style={{ color: "var(--good)" }}>
                    {fmtInt(s.consumedAbove70Cases)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums" style={{ color: s.transitionedCases > 0 ? "var(--warn)" : undefined }}>
                    {fmtInt(s.transitionedCases)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{fmtDays(s.effectiveCoverageDays)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(s.coverageEndDate)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-black/[0.015]">
                    <td colSpan={7} className="px-4 py-3">
                      {activeBatches.length === 0 ? (
                        <div className="text-xs text-[var(--muted)]">No 70%+ batches for this SKU at JWL.</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[var(--muted)]">
                              <th className="px-2 py-1 text-left font-medium">FEFO #</th>
                              <th className="px-2 py-1 text-left font-medium">Batch</th>
                              <th className="px-2 py-1 text-left font-medium">Mfg</th>
                              <th className="px-2 py-1 text-left font-medium">Drops ≤70%</th>
                              <th className="px-2 py-1 text-right font-medium">Cases</th>
                              <th className="px-2 py-1 text-right font-medium">Sold &gt;70%</th>
                              <th className="px-2 py-1 text-right font-medium">Aged out</th>
                              <th className="px-2 py-1 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeBatches
                              .sort((a, b) => (a.fefoPriority ?? 99) - (b.fefoPriority ?? 99))
                              .map((b, i) => (
                                <tr key={i} className="border-t border-[var(--border)]">
                                  <td className="px-2 py-1">{b.fefoPriority ?? "—"}</td>
                                  <td className="px-2 py-1">{b.batchNo || "—"}</td>
                                  <td className="px-2 py-1">{fmtDate(b.mfd)}</td>
                                  <td className="px-2 py-1">{fmtDate(b.date70)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{fmtInt(b.initialCases)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ color: "var(--good)" }}>{fmtInt(b.consumedAbove70)}</td>
                                  <td className="px-2 py-1 text-right tabular-nums" style={{ color: b.transitionedBelow70 > 0 ? "var(--warn)" : undefined }}>{fmtInt(b.transitionedBelow70)}</td>
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
