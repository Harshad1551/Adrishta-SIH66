import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  right,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel flex flex-col", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: "default" | "warm" | "hot" | "cool" | "teal";
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    warm: "text-warm",
    hot: "text-hot",
    cool: "text-cool",
    teal: "text-primary",
  }[tone];
  return (
    <div className="panel relative overflow-hidden px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-xs">{label}</span>
        {icon && <span className="text-primary/70">{icon}</span>}
      </div>
      <div
        className={cn("numeric mt-2 flex items-baseline gap-1 text-2xl font-semibold", toneClass)}
      >
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const pillTones = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  info: "border-primary/40 bg-primary/10 text-primary",
  ok: "border-teal/40 bg-teal/10 text-teal",
  warm: "border-warm/40 bg-warm/10 text-warm",
  hot: "border-hot/50 bg-hot/10 text-hot",
  cool: "border-cool/40 bg-cool/10 text-cool",
} as const;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof pillTones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        pillTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function KeyValue({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium text-foreground", mono && "numeric")}>{value}</span>
    </div>
  );
}

export function Meter({
  value,
  tone = "teal",
}: {
  value: number;
  tone?: "teal" | "warm" | "hot" | "cool";
}) {
  const bg = {
    teal: "bg-primary",
    warm: "bg-warm",
    hot: "bg-hot",
    cool: "bg-cool",
  }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all duration-500", bg)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function MockNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-muted-foreground/80", className)}>
      Prototype visualization using mock data.
    </p>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-foreground">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
