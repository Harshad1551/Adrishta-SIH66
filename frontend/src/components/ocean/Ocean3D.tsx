import { useState, useRef, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import {
  DEPTHS,
  colorFor,
  tempAtDepth,
  uncertaintyAt,
  thermoclineDepth,
  type Depth,
} from "@/lib/ocean/data";
import { exportGridSliceCSV } from "@/lib/ocean/export/exportService";
import { useOcean } from "@/lib/ocean/state";
import { cn } from "@/lib/utils";
import {
  Rotate3d,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Compass,
  Play,
  Pause,
  Thermometer,
  Layers,
  Sparkles,
  Download,
} from "lucide-react";
import { toast } from "sonner";

interface Ocean3DProps {
  lat: number;
  lon: number;
  date: string;
  depth: Depth;
  onDepthChange: (d: Depth) => void;
}

/**
 * 3D Vertical Temperature Profile
 * Physical visualization of discrete standard depth tiers (0 to 1000 m)
 * reconstructed by OceanEmbed at the selected geographic coordinate.
 */
export function Ocean3D({ lat, lon, date, depth, onDepthChange }: Ocean3DProps) {
  const { setExplainOpen, dataMode, realProfileData, exportData } = useOcean();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotate, setRotate] = useState(-32);
  const [tilt, setTilt] = useState(58);
  const [zoom, setZoom] = useState(1.0);
  const [spacing, setSpacing] = useState(24);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [hoveredDepth, setHoveredDepth] = useState<Depth | null>(null);

  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const depthIdx = useMemo(() => {
    return DEPTHS.indexOf(depth);
  }, [depth]);

  const tc = useMemo(() => {
    if (dataMode === "real") {
      return realProfileData?.thermocline_depth_m ?? null;
    }
    return thermoclineDepth(lat, lon, date);
  }, [dataMode, realProfileData, lat, lon, date]);

  const currentTemp = useMemo(() => {
    if (dataMode === "real") {
      if (realProfileData?.predicted_temperature) {
        const val = realProfileData.predicted_temperature[depthIdx];
        if (typeof val === "number") return val;
      }
      return null;
    }
    return tempAtDepth(lat, lon, depth, date);
  }, [dataMode, realProfileData, depthIdx, lat, lon, depth, date]);

  const currentUnc = useMemo(() => {
    if (dataMode === "real") {
      if (realProfileData?.uncertainty_degC) {
        const val = realProfileData.uncertainty_degC[depthIdx];
        if (typeof val === "number") return val;
      }
      return null;
    }
    return uncertaintyAt(lat, lon, depth, date);
  }, [dataMode, realProfileData, depthIdx, lat, lon, depth, date]);

  // Derived Physical Parameters (UNESCO / TEOS-10 formulations from real backend)
  const densityKgM3 = useMemo(() => {
    if (dataMode === "real") {
      if (realProfileData?.potential_density) {
        const d = realProfileData.potential_density[depthIdx];
        if (typeof d === "number") return d.toFixed(2);
      }
      return null;
    }
    return currentTemp !== null ? (1027.85 - currentTemp * 0.22 + (depth / 1000) * 4.45).toFixed(2) : null;
  }, [dataMode, realProfileData, depthIdx, currentTemp, depth]);

  const soundSpeedMs = useMemo(() => {
    if (dataMode === "real") {
      if (realProfileData?.sound_speed) {
        const s = realProfileData.sound_speed[depthIdx];
        if (typeof s === "number") return s.toFixed(1);
      }
      return null;
    }
    return currentTemp !== null ? (1449.2 + 4.6 * currentTemp - 0.055 * Math.pow(currentTemp, 2) + 0.016 * depth).toFixed(1) : null;
  }, [dataMode, realProfileData, depthIdx, currentTemp, depth]);

  // Layer CSV export handler
  const handleExportLayerCSV = () => {
    const csv = exportGridSliceCSV(depth, date);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oceanembed_${depth}m_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${depth} m 0.25° grid slice as CSV`);
  };

  // ESC handler for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Orbit Effect
  useEffect(() => {
    if (!isOrbiting) return;
    const interval = setInterval(() => {
      setRotate((r) => (r >= 180 ? -180 : r + 0.35));
    }, 40);
    return () => clearInterval(interval);
  }, [isOrbiting]);

  // Mouse Wheel / Trackpad Pinch Zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.0018;
      setZoom((z) => Math.max(0.45, Math.min(2.4, Number((z + delta).toFixed(3)))));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse Orbit Handlers
  const handleMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setRotate((r) => {
      let next = r + dx * 0.45;
      if (next > 180) next -= 360;
      if (next < -180) next += 360;
      return next;
    });

    setTilt((t) => Math.max(15, Math.min(85, t - dy * 0.35)));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const setPreset = (preset: "iso" | "profile" | "top" | "exploded") => {
    setIsOrbiting(false);
    if (preset === "iso") {
      setRotate(-32);
      setTilt(58);
      setZoom(isFullscreen ? 1.25 : 1.0);
      setSpacing(isFullscreen ? 30 : 24);
    } else if (preset === "profile") {
      setRotate(0);
      setTilt(85);
      setZoom(isFullscreen ? 1.3 : 1.05);
      setSpacing(isFullscreen ? 32 : 26);
    } else if (preset === "top") {
      setRotate(0);
      setTilt(18);
      setZoom(isFullscreen ? 1.35 : 1.1);
      setSpacing(14);
    } else if (preset === "exploded") {
      setRotate(-28);
      setTilt(62);
      setZoom(isFullscreen ? 1.15 : 0.92);
      setSpacing(isFullscreen ? 44 : 36);
    }
  };

  // Clean Scientific Depth Slices Styling
  const getOceanLayerStyle = (d: number, isActive: boolean, isHovered: boolean) => {
    if (d <= 50) {
      return {
        bg: "linear-gradient(135deg, rgba(14, 165, 233, 0.75) 0%, rgba(2, 132, 199, 0.8) 100%)",
        border: isActive ? "border-cyan-300 ring-2 ring-cyan-400" : isHovered ? "border-cyan-400" : "border-cyan-500/40",
        shadow: isActive ? "0 0 25px rgba(56,189,248,0.5)" : "none",
      };
    }
    if (d <= 150) {
      return {
        bg: "linear-gradient(135deg, rgba(20, 184, 166, 0.7) 0%, rgba(3, 105, 161, 0.8) 100%)",
        border: isActive ? "border-teal-300 ring-2 ring-teal-400" : isHovered ? "border-teal-400" : "border-teal-600/40",
        shadow: isActive ? "0 0 25px rgba(45,212,191,0.5)" : "none",
      };
    }
    if (d <= 500) {
      return {
        bg: "linear-gradient(135deg, rgba(3, 105, 161, 0.75) 0%, rgba(12, 74, 110, 0.85) 100%)",
        border: isActive ? "border-blue-300 ring-2 ring-blue-400" : isHovered ? "border-blue-400" : "border-blue-700/40",
        shadow: isActive ? "0 0 25px rgba(2,132,199,0.45)" : "none",
      };
    }
    return {
      bg: "linear-gradient(135deg, rgba(8, 47, 73, 0.85) 0%, rgba(15, 23, 42, 0.92) 100%)",
      border: isActive ? "border-indigo-300 ring-2 ring-indigo-400" : isHovered ? "border-indigo-400" : "border-slate-700/50",
      shadow: isActive ? "0 0 25px rgba(99,102,241,0.4)" : "none",
    };
  };

  const depthClass = depth <= 200 ? "Epipelagic (0–200 m)" : "Mesopelagic (200–1000 m)";

  return (
    <div
      className={cn(
        "transition-all duration-300",
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-[#01040e]/98 p-4 md:p-6 backdrop-blur-2xl overflow-y-auto"
          : "space-y-4",
      )}
    >
      {/* 1. Camera & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 p-3 backdrop-blur shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mr-1">
            <Compass className="h-3.5 w-3.5 text-primary" />
            Camera Presets:
          </span>
          <button
            onClick={() => setPreset("iso")}
            className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
          >
            Isometric
          </button>
          <button
            onClick={() => setPreset("profile")}
            className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
          >
            Vertical Profile
          </button>
          <button
            onClick={() => setPreset("top")}
            className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
          >
            Plan View
          </button>
          <button
            onClick={() => setPreset("exploded")}
            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          >
            Expanded Slices
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Buttons */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.15).toFixed(2))))}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono text-[10px] font-bold text-muted-foreground select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-l border-border/50 ml-0.5"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          <button
            onClick={() => setIsOrbiting(!isOrbiting)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              isOrbiting
                ? "border-primary bg-primary text-primary-foreground shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            {isOrbiting ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isOrbiting ? "Pause Orbit" : "Auto Orbit"}
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-1.5 rounded-md border border-cyan-500/50 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-400 hover:bg-cyan-500/25 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen Profile"}</span>
          </button>
        </div>
      </div>

      {/* 2. Main 3D Ocean Stack & Layer Inspector */}
      <div
        className={cn(
          "grid gap-4",
          isFullscreen ? "flex-1 lg:grid-cols-[minmax(0,1.3fr)_380px]" : "lg:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
        {/* Left: 3D Render Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={cn(
            "relative select-none cursor-grab active:cursor-grabbing overflow-hidden rounded-xl border border-border bg-gradient-to-b from-[#020a16] via-[#010611] to-[#000206] shadow-2xl flex items-center justify-center",
            isFullscreen ? "h-[640px]" : "h-[500px]",
          )}
          style={{ perspective: "1500px" }}
        >
          {/* Depth Axis Indicator on Left */}
          <div className="pointer-events-none absolute left-3 top-4 bottom-4 z-20 flex flex-col justify-between border-l-2 border-cyan-500/30 pl-3 font-mono text-[10px] text-muted-foreground">
            <div>
              <div className="text-xs font-bold text-cyan-400">0 m</div>
              <div>Surface Interface</div>
            </div>
            <div>
              <div className="text-xs font-bold text-teal-400">200 m</div>
              <div>Thermocline Base</div>
            </div>
            <div>
              <div className="text-xs font-bold text-indigo-400">1000 m</div>
              <div>Lower Bound</div>
            </div>
          </div>

          {/* 3D Vertical Temperature Stack */}
          <div
            className="relative transition-transform duration-100 ease-out"
            style={{
              transformStyle: "preserve-3d",
              transform: `scale(${zoom}) rotateX(${tilt}deg) rotateZ(${rotate}deg)`,
            }}
          >
            {/* Base Reference Grid (1000 m boundary) */}
            <div
              className="absolute left-1/2 top-1/2 h-72 w-92 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-700/60 bg-[#02050e]"
              style={{
                transform: `translateZ(${-(DEPTHS.length) * spacing - 18}px)`,
                backgroundImage:
                  "radial-gradient(circle, rgba(14,165,233,0.15) 1px, transparent 1px), linear-gradient(to right, rgba(30,41,59,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,41,59,0.3) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            >
              <div className="absolute bottom-2 right-3 text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                1000 m Base Level
              </div>
            </div>

            {/* Vertical Sounding Axis */}
            <div
              className="absolute pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                height: "2px",
                width: "2px",
                transformStyle: "preserve-3d",
              }}
            >
              <div
                className="w-0.5 bg-gradient-to-b from-cyan-400 via-teal-500 to-transparent shadow-[0_0_10px_#38bdf8]"
                style={{
                  height: `${DEPTHS.length * spacing + 35}px`,
                  transform: "rotateX(-90deg)",
                  transformOrigin: "top",
                }}
              />
            </div>

            {/* 15 Physical Depth Layers */}
            {DEPTHS.map((d, i) => {
              const t = dataMode === "real"
                ? (realProfileData?.predicted_temperature?.[i] ?? null)
                : tempAtDepth(lat, lon, d, date);
              const unc = dataMode === "real"
                ? (realProfileData?.uncertainty_degC?.[i] ?? null)
                : uncertaintyAt(lat, lon, d, date);
              const isActive = d === depth;
              const isHovered = d === hoveredDepth;
              const isTc = tc !== null && Math.abs(d - tc) <= 25;
              const zOffset = -i * spacing;
              const oceanStyle = getOceanLayerStyle(d, isActive, isHovered);

              return (
                <div
                  key={d}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDepthChange(d);
                    const label = t !== null && typeof t === "number" ? `${t.toFixed(2)} °C` : "N/A";
                    toast.info(`Selected Depth: ${d} m (${label})`);
                  }}
                  onMouseEnter={() => setHoveredDepth(d)}
                  onMouseLeave={() => setHoveredDepth(null)}
                  className={cn(
                    "group absolute left-1/2 top-1/2 h-64 w-88 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-xl border transition-all duration-200 backdrop-blur-xs",
                    oceanStyle.border,
                    isActive ? "z-30 scale-[1.03]" : isHovered ? "z-20 scale-[1.01]" : "",
                  )}
                  style={{
                    transform: `translateZ(${zOffset}px) ${isActive ? "translateZ(10px)" : ""}`,
                    background: oceanStyle.bg,
                    boxShadow: oceanStyle.shadow,
                  }}
                >
                  {/* Thermocline Indicator */}
                  {isTc && (
                    <div className="absolute -top-3 left-4 rounded bg-amber-500/90 px-2 py-0.5 text-[9px] font-mono font-bold text-black shadow-md flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-black animate-pulse" />
                      THERMOCLINE LAYER (~{tc} m)
                    </div>
                  )}

                  {/* Depth Badge */}
                  <div
                    className={cn(
                      "absolute -left-2 top-2 rounded px-2.5 py-1 text-[10px] font-mono font-bold tracking-tight transition-all shadow",
                      isActive
                        ? "bg-cyan-300 text-black font-black shadow-[0_0_12px_#38bdf8]"
                        : isHovered
                          ? "bg-teal-300 text-black"
                          : "bg-slate-900/90 text-cyan-200 border border-slate-700",
                    )}
                  >
                    {d} m
                  </div>

                  {/* Center Sounding Coordinate */}
                  <div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
                    style={{
                      width: isActive ? "12px" : "8px",
                      height: isActive ? "12px" : "8px",
                      backgroundColor: isActive ? "#38bdf8" : "#2dd4bf",
                      boxShadow: isActive ? "0 0 12px #38bdf8" : "none",
                    }}
                  />

                  {/* Temperature & Uncertainty on Right Corner */}
                  <div className="absolute right-3 bottom-2 flex items-center gap-2 font-mono text-[10px]">
                    <span className="font-bold text-white drop-shadow">
                      {t !== null && typeof t === "number" ? `${t.toFixed(2)} °C` : "Loading..."}
                    </span>
                    {unc !== null && typeof unc === "number" && (
                      <span className="text-white/80 text-[9px]">
                        ±{unc.toFixed(2)} °C
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top Operational Status */}
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 font-mono text-[11px] bg-slate-950/85 px-3 py-1.5 rounded-lg border border-border/70 backdrop-blur z-20">
            <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-400 font-semibold">
              {dataMode === "real" ? "OceanEmbed 3D Profile" : "Demo Profile Slices"}
            </span>
            {dataMode === "real" && realProfileData?.matched_snapshot_date && (
              <span className="text-muted-foreground">
                Snapshot: {realProfileData.matched_snapshot_date}
              </span>
            )}
          </div>

          {/* Bottom Navigation Helper */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border/70 bg-slate-950/85 px-3 py-2 text-[11px] backdrop-blur z-20">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Rotate3d className="h-3.5 w-3.5 text-primary" />
              <span>Drag to orbit · Scroll / Pinch to zoom · Click depth layer</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Location: {lat.toFixed(2)}°N, {lon.toFixed(2)}°E · 15 Discrete Depth Slices
            </div>
          </div>
        </div>

        {/* Right: Layer Inspector & 15-Depth Elevator */}
        <div className="flex flex-col rounded-xl border border-border bg-card/90 p-4 backdrop-blur space-y-3.5">
          {/* Active Layer Metric Card */}
          <div className="rounded-lg border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-background to-background p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="rounded bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-400">
                SELECTED DEPTH: {depth} m
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                Index {depthIdx + 1}/15
              </span>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-bold font-mono text-foreground flex items-center gap-1.5">
                  <Thermometer className="h-5 w-5 text-cyan-400" />
                  {currentTemp !== null && typeof currentTemp === "number"
                    ? `${currentTemp.toFixed(2)} °C`
                    : "Loading..."}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {currentUnc !== null ? (
                    <span className="font-mono text-cyan-300">
                      Uncertainty: ±{currentUnc.toFixed(2)} °C (1σ)
                    </span>
                  ) : (
                    <span>Real model output</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block rounded px-2 py-0.5 text-[9px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {depthClass}
                </span>
                {tc !== null && (
                  <div className="text-[10px] font-mono text-amber-400/90 mt-1">
                    Thermocline: ~{tc} m
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Derived Physical Parameters (if available) */}
          {(densityKgM3 !== null || soundSpeedMs !== null) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border/70 bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">Potential Density (σ_θ)</span>
                <span className="font-mono font-bold text-foreground text-[11px]">{densityKgM3 ?? "--"} kg/m³</span>
              </div>
              <div className="rounded border border-border/70 bg-muted/20 p-2">
                <span className="text-[10px] text-muted-foreground block">Sound Velocity (c)</span>
                <span className="font-mono font-bold text-foreground text-[11px]">{soundSpeedMs ?? "--"} m/s</span>
              </div>
            </div>
          )}

          {/* 15 Depth Layers Clickable List */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground mb-1.5">
              <span>Standard Depths (Click to Inspect):</span>
            </div>

            <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
              {DEPTHS.map((d, i) => {
                const t = dataMode === "real"
                  ? (realProfileData?.predicted_temperature?.[i] ?? null)
                  : tempAtDepth(lat, lon, d, date);
                const isActive = d === depth;
                const isHovered = d === hoveredDepth;
                const isTc = tc !== null && Math.abs(d - tc) <= 25;

                return (
                  <button
                    key={d}
                    onClick={() => {
                      onDepthChange(d);
                      toast.info(`Switched to depth: ${d} m`);
                    }}
                    onMouseEnter={() => setHoveredDepth(d)}
                    onMouseLeave={() => setHoveredDepth(null)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1 text-[11px] transition-all",
                      isActive
                        ? "bg-cyan-500/20 border border-cyan-400 text-foreground font-bold shadow-sm"
                        : isHovered
                          ? "bg-muted/70 border border-border text-foreground"
                          : "bg-muted/15 border border-transparent text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: t !== null ? colorFor("temp", t, d) : "#0ea5e9" }}
                      />
                      <span className="font-mono font-bold">{d} m</span>
                      {isTc && (
                        <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 text-[8px]">
                          TC
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-foreground font-semibold">
                      {t !== null && typeof t === "number" ? `${t.toFixed(2)} °C` : "--"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={() =>
                exportData(
                  `oceanembed_layer_${depth}m_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                  "PDF Profile",
                )
              }
              className="flex-1 flex items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
              title={`Export PDF with graph and scientific analysis for ${depth} m`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export {depth} m PDF</span>
            </button>
            <button
              onClick={handleExportLayerCSV}
              className="flex-1 flex items-center justify-center gap-1 rounded-md border border-border bg-muted/40 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => setExplainOpen(true)}
              className="flex items-center justify-center gap-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              <span>Details</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Orbit Sliders Footer */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-border bg-card/40 p-3 backdrop-blur">
        <Slider
          label="Azimuth Rotation"
          value={Math.round(rotate)}
          min={-180}
          max={180}
          onChange={setRotate}
          suffix="°"
        />
        <Slider
          label="Polar Elevation"
          value={Math.round(tilt)}
          min={15}
          max={85}
          onChange={setTilt}
          suffix="°"
        />
        <Slider
          label="Vertical Tier Spacing"
          value={spacing}
          min={12}
          max={46}
          step={2}
          onChange={setSpacing}
          suffix=" px"
        />
        <Slider
          label="Perspective Zoom"
          value={zoom}
          min={0.6}
          max={1.6}
          step={0.05}
          onChange={setZoom}
          suffix="×"
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px] font-bold text-primary">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-lg bg-slate-800 accent-cyan-400 cursor-pointer"
      />
    </label>
  );
}
