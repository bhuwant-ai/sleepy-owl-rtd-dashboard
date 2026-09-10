import { fmtInt, fmtPct } from "@/lib/format";

export interface ShelfChartProps {
  above70: number;
  between: number;
  below: number;
  total: number;
}

/**
 * A simple, dependency-free donut drawn with inline SVG. We avoid a chart
 * library here because the 3-segment donut is trivial and this renders
 * deterministically (no client-measurement race, prints cleanly).
 */
export function ShelfChart({ above70, between, below, total }: ShelfChartProps) {
  if (total <= 0) {
    return <div className="text-sm text-[var(--muted)] py-10 text-center">No inventory to chart.</div>;
  }

  const segments = [
    { key: "above", label: "Above 70%", value: above70, color: "#15803d" },
    { key: "between", label: "50–70%", value: between, color: "#d97706" },
    { key: "below", label: "Below 50%", value: below, color: "#dc2626" },
  ].filter((s) => s.value > 0);

  let start = 0;
  const abovePct = (above70 / total) * 100;

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="relative">
        <svg viewBox="0 0 120 120" width="200" height="200" role="img" aria-label="Shelf-life split">
          {/* track */}
          <circle cx="60" cy="60" r="45" fill="none" stroke="#eef1f4" strokeWidth="18" />
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
                strokeWidth="18"
                pathLength={100}
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
              />
            );
            start += pct;
            return el;
          })}
          <text x="60" y="55" textAnchor="middle" className="fill-[var(--foreground)]" style={{ fontSize: 15, fontWeight: 700 }}>
            {fmtPct(abovePct, 0)}
          </text>
          <text x="60" y="72" textAnchor="middle" style={{ fontSize: 8, fill: "var(--muted)" }}>
            above 70%
          </text>
        </svg>
      </div>

      <ul className="w-full space-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-[var(--foreground)]">{s.label}</span>
            <span className="tabular-nums font-medium">{fmtInt(s.value)}</span>
            <span className="tabular-nums text-[var(--muted)] w-12 text-right">{fmtPct((s.value / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
