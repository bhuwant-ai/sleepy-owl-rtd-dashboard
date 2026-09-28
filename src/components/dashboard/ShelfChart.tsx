import { fmtInt, fmtPct } from "@/lib/format";

export interface ShelfChartProps {
  above70: number;
  between: number;
  below: number;
  total: number;
}

/**
 * Dependency-free donut (inline SVG) beside a ranked legend with mini bars,
 * following the donut+legend recipe. Colours are semantic (green/amber/red =
 * meaning) and theme-aware via CSS variables.
 */
export function ShelfChart({ above70, between, below, total }: ShelfChartProps) {
  if (total <= 0) {
    return <div className="text-[13px] text-[var(--muted)] py-10 text-center">No inventory to chart.</div>;
  }

  const segments = [
    { key: "above", label: "Above 75%", value: above70, color: "var(--good)" },
    { key: "between", label: "50–75%", value: between, color: "var(--warn)" },
    { key: "below", label: "Below 50%", value: below, color: "var(--bad)" },
  ].filter((s) => s.value > 0);

  let start = 0;
  const abovePct = (above70 / total) * 100;
  const maxVal = Math.max(...segments.map((s) => s.value), 1);

  return (
    <div className="flex flex-col items-center gap-5 py-1 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 120 120" width="172" height="172" role="img" aria-label="Shelf-life split">
          <circle cx="60" cy="60" r="45" fill="none" stroke="var(--surface-muted)" strokeWidth="16" />
          {segments.map((s) => {
            const pct = (s.value / total) * 100;
            const el = (
              <circle
                key={s.key}
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${Math.max(pct - 1.5, 0.5)} ${100 - Math.max(pct - 1.5, 0.5)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
              />
            );
            start += pct;
            return el;
          })}
          <text x="60" y="56" textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: "var(--good)" }} className="tabnum">
            {fmtPct(abovePct, 0)}
          </text>
          <text x="60" y="72" textAnchor="middle" style={{ fontSize: 7.5, fill: "var(--muted)", letterSpacing: "0.12em" }}>
            ABOVE 75%
          </text>
        </svg>
      </div>

      <ul className="w-full space-y-3">
        {segments.map((s) => (
          <li key={s.key}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1 text-[var(--foreground)]">{s.label}</span>
              <span className="tabnum font-semibold">{fmtInt(s.value)}</span>
              <span className="tabnum text-[var(--muted)] w-14 text-right">{fmtPct((s.value / total) * 100)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--surface-muted)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(s.value / maxVal) * 100}%`, background: s.color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
