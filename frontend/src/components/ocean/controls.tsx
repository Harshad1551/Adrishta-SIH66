import { DEPTHS, VARIABLES, REGIONS, type VariableId, type RegionId } from "@/lib/ocean/data";
import { useOcean } from "@/lib/ocean/state";
import { cn } from "@/lib/utils";

export function DepthSelector({ compact = false }: { compact?: boolean }) {
  const { depth, setDepth } = useOcean();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-xs">Depth level</span>
        <span className="numeric text-xs text-primary">{depth} m</span>
      </div>
      <div className={cn("flex flex-wrap gap-1", compact && "gap-0.5")}>
        {DEPTHS.map((d) => (
          <button
            key={d}
            onClick={() => setDepth(d)}
            className={cn(
              "numeric rounded border px-2 py-1 text-[11px] transition-colors",
              d === depth
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VariableSelector() {
  const { variable, setVariable } = useOcean();
  return (
    <div>
      <div className="label-xs mb-2">Variable</div>
      <div className="grid grid-cols-2 gap-1">
        {VARIABLES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVariable(v.id as VariableId)}
            className={cn(
              "rounded border px-2 py-1.5 text-left text-[11px] leading-tight transition-colors",
              v.id === variable
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DateControl({ label = "Date" }: { label?: string }) {
  const { date, setDate, dataMode } = useOcean();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-xs">{label}</span>
        {dataMode === "real" && (
          <span className="rounded border border-teal/30 bg-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-teal">
            2024–2026 Synoptic Store
          </span>
        )}
      </div>
      <input
        type="date"
        value={date}
        min="2024-01-07"
        max="2026-10-03" suppressHydrationWarning
        onChange={(e) => e.target.value && setDate(e.target.value)}
        className="numeric w-full rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
      />
      {dataMode === "real" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <span className="font-medium text-muted-foreground/80">Multi-Year Presets:</span>
          {[
            { label: "'24 Heatwave", d: "2024-05-12" },
            { label: "'25 Winter", d: "2025-01-19" },
            { label: "'25 Upwelling", d: "2025-07-20" },
            { label: "'26 Sep", d: "2026-09-27" },
            { label: "'26 Oct 01", d: "2026-10-01" },
            { label: "'26 Latest (03 Oct)", d: "2026-10-03" },
          ].map(({ label, d }) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                date === d ? "bg-primary/20 text-primary font-semibold" : "bg-muted/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegionControl() {
  const { region, setRegion } = useOcean();
  return (
    <div>
      <div className="label-xs mb-2">Region</div>
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value as RegionId)}
        className="w-full rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
      >
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RangeTabs<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            o.value === value
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
