import { Clock, ShieldCheck, Calendar, Info } from "lucide-react";
import { useOcean } from "@/lib/ocean/state";

export function FreshnessPanel({ className }: { className?: string }) {
  const { date, dataMode, realProfileData, validationMode, setValidationMode } = useOcean();

  const reqDate = realProfileData?.requested_date ?? date;
  const matchedSnapshot = realProfileData?.matched_snapshot_date ?? "2026-10-03";
  const deltaHours = realProfileData?.delta_hours ?? 0;
  const deltaDays = realProfileData?.synoptic_delta_days ?? 0;

  // Determine scientific temporal status label
  const temporalStatusLabel =
    deltaHours === 0
      ? "Synchronous Snapshot"
      : deltaHours === 24
        ? "Prospective Validation (+24 h)"
        : `Synoptic Match (+${deltaHours} h)`;

  return (
    <div className={`rounded-lg border border-border bg-card p-4 space-y-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="font-display text-xs font-semibold text-foreground tracking-wide">
            TEMPORAL ALIGNMENT & SYNOPTIC MATCH
          </span>
        </div>
        <span className="inline-flex items-center rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] font-mono font-medium text-teal">
          {temporalStatusLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 py-1 text-center">
        <div className="rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">
            Requested Date
          </div>
          <div className="font-mono text-xs font-semibold text-primary mt-0.5">
            {reqDate}
          </div>
          <div className="text-[9px] text-muted-foreground">User Selection</div>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">
            Surface Snapshot
          </div>
          <div className="font-mono text-xs font-semibold text-teal mt-0.5">
            {matchedSnapshot}
          </div>
          <div className="text-[9px] text-muted-foreground">Master Store Input</div>
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">Temporal Offset</div>
          <div className="font-mono text-xs font-semibold text-foreground mt-0.5">
            {deltaHours > 0 ? `+${deltaHours} h (${deltaDays} d)` : "0 h (Collocated)"}
          </div>
          <div className="text-[9px] text-teal">Operational Window</div>
        </div>
      </div>

      <div className="rounded border border-primary/20 bg-primary/5 p-2 text-[10px] leading-relaxed text-muted-foreground flex items-start gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <span>
          Weekly synoptic satellite snapshots (2024–2026) are colocated from Copernicus DUACS, NOAA OISST, and SMAP.
          Observation and inference timestamps are explicitly distinguished; requested dates are matched to the closest verified surface fields.
        </span>
      </div>
    </div>
  );
}
