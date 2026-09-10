/** Small presentational building blocks shared across the dashboard. */
import type { ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--card)] border-[var(--border)] shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  accent?: string; // css color for the value
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {unit && <span className="text-sm text-[var(--muted)]">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </Card>
  );
}

export function Badge({
  children,
  bg,
  color,
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: bg || "#eef2f6", color: color || "#334155" }}
    >
      {children}
    </span>
  );
}
