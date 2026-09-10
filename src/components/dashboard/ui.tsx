"use client";
/** Shared presentational building blocks (design.md component recipes). */
import type { ReactNode, MouseEvent } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Cursor-follow spotlight: set --mx/--my as % of the element. */
export function spotlightMove(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

/** Canonical surface: glass + floating elevation + large radius. */
export function Card({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      onMouseMove={interactive ? spotlightMove : undefined}
      className={cn(
        "rounded-[20px] glass elev",
        interactive && "relative overflow-hidden elev-hover spotlight",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A titled panel: canonical card with a header row (title / subtitle / action). */
export function SectionCard({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">{title}</h2>
          {subtitle && <p className="text-[12px] text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

/** KPI card: accent icon chip · uppercase label · big tabular value · subtitle. */
export function StatCard({
  label,
  value,
  unit,
  sub,
  accent = "var(--primary)",
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <Card interactive className="p-4">
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="eyebrow">{label}</span>
          {icon && (
            <span
              className="grid h-8 w-8 place-items-center rounded-lg"
              style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
            >
              {icon}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[22px] font-bold leading-none tabnum" style={{ color: accent }}>
            {value}
          </span>
          {unit && <span className="text-[12px] text-[var(--muted)]">{unit}</span>}
        </div>
        {sub && <div className="mt-1.5 text-[11px] text-[var(--muted)]">{sub}</div>}
      </div>
    </Card>
  );
}

/** Small status pill (12%-tint background + full-strength text). */
export function Badge({ children, bg, color }: { children: ReactNode; bg?: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg || "var(--surface-muted)", color: color || "var(--muted)" }}
    >
      {children}
    </span>
  );
}

/** Ghost glass icon button (top-right cluster: refresh, theme, …). */
export function IconButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg glass press text-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
