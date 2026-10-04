import { useMemo, useState, useEffect } from "react";
import {
  ARGO_FLOATS,
  DOMAIN,
  VARIABLES,
  colorFor,
  fieldGrid,
  variableRange,
  type VariableId,
} from "@/lib/ocean/data";
import { fetchRealGridSlice, type RealGridPoint, type RealGridResponse } from "@/lib/ocean/api";
import { useOcean } from "@/lib/ocean/state";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2 } from "lucide-react";

const W = 1200;
const H = 500;

function projX(lon: number) {
  return ((lon - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin)) * W;
}
function projY(lat: number) {
  return ((DOMAIN.latMax - lat) / (DOMAIN.latMax - DOMAIN.latMin)) * H;
}

export type MapMarker = {
  lat: number;
  lon: number;
  label: string;
  tone?: "hot" | "cool" | "warm";
};

export function OceanMap({
  variable,
  depth,
  date,
  selected,
  onSelect,
  showArgo = true,
  onArgoClick,
  markers = [],
  onMarkerClick,
  step = 2,
  model = "physics",
  height = 460,
  className,
}: {
  variable: VariableId;
  depth: number;
  date: string;
  selected?: { lat: number; lon: number };
  onSelect?: (lat: number, lon: number) => void;
  showArgo?: boolean;
  onArgoClick?: (id: string, lat: number, lon: number) => void;
  markers?: MapMarker[];
  onMarkerClick?: (m: MapMarker) => void;
  step?: number;
  model?: "physics" | "baseline";
  height?: number;
  className?: string;
}) {
  const { dataMode } = useOcean();
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    lat: number;
    lon: number;
    v: number;
  } | null>(null);

  const [realGrid, setRealGrid] = useState<RealGridResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch real grid prediction field from FastAPI backend
  useEffect(() => {
    if (dataMode !== "real") {
      setRealGrid(null);
      setErrorMsg(null);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setErrorMsg(null);

    const apiVar = variable === "anomaly" ? "anomaly" : variable === "uncertainty" ? "uncertainty" : "temp";

    fetchRealGridSlice(depth, date, apiVar, step, model)
      .then((res) => {
        if (!mounted) return;
        setRealGrid(res);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("OceanMap grid fetch failed:", err);
        setErrorMsg(err.message || "Failed to load real model prediction field.");
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [dataMode, depth, date, variable, step, model]);

  // Demo fallback cells (ONLY evaluated in explicit demo mode)
  const demoCells = useMemo(() => {
    if (dataMode === "real") return [];
    return fieldGrid(variable, depth, date, step);
  }, [dataMode, variable, depth, date, step]);

  const meta = VARIABLES.find((v) => v.id === variable) ?? VARIABLES[0];
  const [min, max] = variableRange(variable, depth);
  const cw = (step / (DOMAIN.lonMax - DOMAIN.lonMin)) * W;
  const ch = (step / (DOMAIN.latMax - DOMAIN.latMin)) * H;

  function toGeo(evt: React.MouseEvent<SVGSVGElement>) {
    const rect = evt.currentTarget.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const py = ((evt.clientY - rect.top) / rect.height) * H;
    const lon = DOMAIN.lonMin + (px / W) * (DOMAIN.lonMax - DOMAIN.lonMin);
    const lat = DOMAIN.latMax - (py / H) * (DOMAIN.latMax - DOMAIN.latMin);
    return { lat, lon, px, py };
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-[#050b14] select-none shadow-inner",
        className,
      )}
      style={{ height }}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs font-mono text-muted-foreground">Running Neural Model Inference...</span>
        </div>
      )}

      {/* Fail-Closed Error Display */}
      {dataMode === "real" && errorMsg && !isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 p-6 text-center gap-2">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div className="font-semibold text-foreground text-sm">REAL DATA UNAVAILABLE</div>
          <p className="text-xs text-muted-foreground max-w-md">{errorMsg}</p>
          <div className="text-[10px] font-mono text-muted-foreground/60 mt-2">
            Fail-closed invariant: Real mode will never substitute synthetic values.
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full cursor-crosshair"
        preserveAspectRatio="none"
        onClick={(e) => {
          const { lat, lon } = toGeo(e);
          onSelect?.(Math.round(lat * 4) / 4, Math.round(lon * 4) / 4);
        }}
        onMouseMove={(e) => {
          const { lat, lon, px, py } = toGeo(e);
          let v = NaN;
          if (dataMode === "real" && realGrid) {
            const nearest = realGrid.points.find(
              (p) => Math.abs(p.lat - lat) < step * 0.75 && Math.abs(p.lon - lon) < step * 0.75,
            );
            if (nearest) v = nearest.value;
          } else if (dataMode === "demo") {
            const cell = demoCells.find(
              (c) => Math.abs(c.lat - lat) < step * 0.75 && Math.abs(c.lon - lon) < step * 0.75,
            );
            if (cell) v = cell.value;
          }
          setHover({ x: px, y: py, lat, lon, v });
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <radialGradient id="oceanGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="#030712" />
        <rect width={W} height={H} fill="url(#oceanGlow)" />

        {/* Real Mode Grid Points */}
        {dataMode === "real" &&
          realGrid?.points.map((pt) => {
            const x = projX(pt.lon) - cw / 2;
            const y = projY(pt.lat) - ch / 2;
            return (
              <rect
                key={`${pt.lat}-${pt.lon}`}
                x={x}
                y={y}
                width={cw}
                height={ch}
                fill={colorFor(variable, pt.value, min, max)}
                opacity={0.88}
              />
            );
          })}

        {/* Demo Mode Grid Cells */}
        {dataMode === "demo" &&
          demoCells.map((c) => {
            const x = projX(c.lon) - cw / 2;
            const y = projY(c.lat) - ch / 2;
            return (
              <rect
                key={`${c.lat}-${c.lon}`}
                x={x}
                y={y}
                width={cw}
                height={ch}
                fill={colorFor(variable, c.value, min, max)}
                opacity={0.88}
              />
            );
          })}

        {/* Grid latitude lines */}
        {[10, 15, 20, 25].map((la) => (
          <line
            key={`lat-${la}`}
            x1={0}
            y1={projY(la)}
            x2={W}
            y2={projY(la)}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Grid longitude lines */}
        {[50, 60, 70, 80, 90, 100].map((lo) => (
          <line
            key={`lon-${lo}`}
            x1={projX(lo)}
            y1={0}
            x2={projX(lo)}
            y2={H}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Selected target reticle */}
        {selected && (
          <g>
            <circle
              cx={projX(selected.lon)}
              cy={projY(selected.lat)}
              r={12}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <circle cx={projX(selected.lon)} cy={projY(selected.lat)} r={3} fill="#38bdf8" />
          </g>
        )}
      </svg>

      {/* Hover Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur"
          style={{
            left: `calc(${(hover.x / W) * 100}% + 12px)`,
            top: `calc(${(hover.y / H) * 100}% + 12px)`,
          }}
        >
          <div className="numeric text-foreground">
            {hover.lat.toFixed(2)}°N, {hover.lon.toFixed(2)}°E
          </div>
          <div className="numeric text-primary font-bold">
            {Number.isNaN(hover.v) ? "land / masked" : `${hover.v.toFixed(2)} ${meta.unit}`}
          </div>
        </div>
      )}

      {/* Color Scale Legend */}
      <div className="absolute bottom-3 right-3 rounded-md border border-border bg-popover/90 px-3 py-2 backdrop-blur shadow-md">
        <div className="label-xs mb-1 font-semibold">{meta.label}</div>
        <div
          className="h-2 w-40 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${Array.from({ length: 12 }, (_, i) =>
              colorFor(variable, min + ((max - min) * i) / 11, depth),
            ).join(",")})`,
          }}
        />
        <div className="numeric mt-1 flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>{min} {meta.unit}</span>
          <span>{max} {meta.unit}</span>
        </div>
      </div>

      {/* Operational Provenance Badges (Top Left) */}
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-border bg-popover/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur shadow-sm">
          Depth <span className="numeric text-primary font-bold">{depth} m</span>
        </span>
        <span className="rounded border border-border bg-popover/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur shadow-sm">
          Date <span className="numeric text-foreground font-mono">{date}</span>
        </span>
        {dataMode === "real" && realGrid && (
          <span className="rounded border border-teal/40 bg-teal/10 px-2.5 py-1 text-[11px] text-teal backdrop-blur font-mono shadow-sm">
            Snapshot: {realGrid.matched_snapshot_date} (Δt: {realGrid.delta_hours}h)
          </span>
        )}
        <span className="rounded border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary backdrop-blur font-mono shadow-sm">
          {model === "physics" ? "Physics-Constrained" : "Baseline CNN"}
        </span>
      </div>
    </div>
  );
}
