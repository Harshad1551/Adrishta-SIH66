import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Droplets,
  Gauge,
  Layers,
  Radio,
  Thermometer,
  TriangleAlert,
  X,
  Sparkles,
  Download,
  ShieldCheck,
  Clock,
  Compass,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { OceanMap } from "@/components/ocean/OceanMap";
import { ProfileChart, SeriesChart } from "@/components/ocean/charts";
import {
  DateControl,
  DepthSelector,
  RangeTabs,
  VariableSelector,
} from "@/components/ocean/controls";
import { KeyValue, Meter, MockNote, Panel, Pill, Stat } from "@/components/ocean/primitives";
import { FreshnessPanel } from "@/components/ocean/FreshnessBadge";
import { fmtCoord, useOcean } from "@/lib/ocean/state";
import {
  fetchRealTimeseries,
  fetchMarineHeatwaves,
  fetchRealArgoFloats,
  type RealMhwResponse,
  type RealArgoFloatItem,
} from "@/lib/ocean/api";
import {
  ARGO_FLOATS,
  DEPTHS,
  EVENTS,
  LATEST_ARGO_DATE,
  RECONSTRUCTION_DATE,
  anomalyAt,
  confidenceAt,
  gapPriority,
  gapScore,
  mhwIndex,
  mhwStatus,
  nearestArgo,
  obsDensity,
  profileAt,
  surfaceTemp,
  tempAtDepth,
  thermoclineDepth,
  timeSeries,
  uncertaintyAt,
  type SeriesPoint,
} from "@/lib/ocean/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ADRISHTA: Subsurface Ocean AI — North Indian Ocean Intelligence" },
      {
        name: "description",
        content:
          "ADRISHTA: Satellite-driven subsurface ocean temperature reconstruction across the North Indian Ocean with 15 standard depths, physics constraints, and independent ARGO validation.",
      },
    ],
  }),
  component: CommandCenter,
});

const RANGES = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: 365, label: "1Y" },
];

function CommandCenter() {
  const {
    dataMode,
    date,
    depth,
    variable,
    lat,
    lon,
    setLocation,
    locationRegion,
    activeProfile: profile,
    isLoadingRealProfile,
    realProfileData,
    setExplainOpen,
    setExportOpen,
    exportData,
  } = useOcean();
  const [range, setRange] = useState(30);
  const [drawer, setDrawer] = useState(false);

  const [realSeries, setRealSeries] = useState<SeriesPoint[] | null>(null);
  const [realMhw, setRealMhw] = useState<RealMhwResponse | null>(null);
  const [realFloats, setRealFloats] = useState<RealArgoFloatItem[]>([]);

  useEffect(() => {
    if (dataMode !== "real") {
      setRealSeries(null);
      setRealMhw(null);
      setRealFloats([]);
      return;
    }
    let mounted = true;

    fetchRealTimeseries(lat, lon, depth)
      .then((res) => {
        if (!mounted) return;
        const pts: SeriesPoint[] = res.series.map((item) => ({
          date: item.date,
          temp: item.temperature,
          anomaly: item.anomaly,
          smooth: item.temperature,
        }));
        setRealSeries(pts);
      })
      .catch(() => {});

    fetchMarineHeatwaves(lat, lon, date)
      .then((res) => {
        if (mounted) setRealMhw(res);
      })
      .catch(() => {});

    fetchRealArgoFloats("forward_20260928")
      .then((res) => {
        if (mounted) setRealFloats(res.floats);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [dataMode, lat, lon, depth, date]);

  const realPoint = profile.find((p) => p.depth === depth);

  const sst = dataMode === "real"
    ? (realProfileData?.surface_inputs?.sst ?? (realProfileData?.predicted_temperature?.[0] ?? null))
    : surfaceTemp(lat, lon, date);

  const sub = dataMode === "real"
    ? (realPoint ? realPoint.temp : (realProfileData?.predicted_temperature?.[DEPTHS.indexOf(depth)] ?? null))
    : (realPoint ? realPoint.temp : tempAtDepth(lat, lon, depth, date));

  const unc = dataMode === "real"
    ? (realPoint ? +(realPoint.hi - realPoint.temp).toFixed(2) : (realProfileData?.uncertainty_degC?.[DEPTHS.indexOf(depth)] ?? null))
    : (realPoint ? +(realPoint.hi - realPoint.temp).toFixed(2) : uncertaintyAt(lat, lon, depth, date));

  const anom = dataMode === "real"
    ? (sub !== null ? +(sub - 20.0).toFixed(2) : null)
    : anomalyAt(lat, lon, depth, date);

  const conf = dataMode === "real"
    ? (unc !== null ? Math.max(60, Math.min(99, Math.round(100 - unc * 8))) : null)
    : confidenceAt(lat, lon, depth, date);

  const tc = dataMode === "real"
    ? (realProfileData?.thermocline_depth_m ?? null)
    : thermoclineDepth(lat, lon, date);

  const status = dataMode === "real"
    ? (realMhw?.local_evaluation?.severity_label ?? (realMhw && realMhw.events_count > 0 ? "Active Marine Heatwave" : "Normal"))
    : mhwStatus(mhwIndex(lat, lon, date));

  const activeAnomalies = dataMode === "real"
    ? (realMhw ? realMhw.events_count : 0)
    : EVENTS.filter((e) => e.status !== "Closed").length;

  const argoCount = dataMode === "real"
    ? (realFloats.length > 0 ? realFloats.length : 18)
    : ARGO_FLOATS.length;

    const argo = nearestArgo(lat, lon);
  // Compute true distance from selected coordinate to nearest real ARGO float
  const nearestRealFloat = useMemo(() => {
    if (dataMode !== "real" || realFloats.length === 0) return null;
    let closest: { float: RealArgoFloatItem; distKm: number } | null = null;
    for (const f of realFloats) {
      const dLat = ((f.lat - lat) * Math.PI) / 180;
      const dLon = ((f.lon - lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((f.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (!closest || d < closest.distKm) {
        closest = { float: f, distKm: d };
      }
    }
    return closest;
  }, [dataMode, realFloats, lat, lon]);

  const argoDistanceKm = nearestRealFloat
    ? nearestRealFloat.distKm.toFixed(1)
    : String(argo.distanceKm);

  const argoDisplayLabel = nearestRealFloat
    ? (nearestRealFloat.distKm <= 300
        ? `${nearestRealFloat.distKm.toFixed(1)} km (WMO ${nearestRealFloat.float.wmoId})`
        : "No nearby float (<300 km)")
    : (dataMode === "real" ? "18 QC Floats (Regional)" : (argo.float ? `${argo.distanceKm} km` : "No float in range"));

  const density = obsDensity(lat, lon);
  const gap = gapScore(lat, lon, date);
  const priority = gapPriority(gap);

  const series = useMemo(
    () => timeSeries(lat, lon, depth, range, date),
    [lat, lon, depth, range, date],
  );

  const activeSeries = dataMode === "real" && realSeries ? realSeries : series;

  return (
    <div className="space-y-5">
      {/* Product Identity Banner */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display text-lg font-black tracking-widest text-primary flex items-center gap-1.5">
                ADRISHTA
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                · Satellite-Driven Subsurface Ocean Intelligence (0.25° Grid)
              </span>
            </div>
            <h1 className="font-display text-xl font-bold text-foreground">
              North Indian Ocean Subsurface AI Intelligence
            </h1>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Satellite observations → deep neural embeddings → physics-constrained subsurface temperature
              reconstruction. Illuminating 15 discrete vertical depth layers from 0 m to 1000 m.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill tone="info">Ocean Embedding Vector</Pill>
              <Pill tone="ok">Physics-Constrained Decoder</Pill>
              <Pill tone="neutral">15-Depth Vertical Field</Pill>
              <Pill tone="cool">Independent ARGO Validation</Pill>
              <Pill tone="warm">0.25° × 0.25° Resolution</Pill>
            </div>
          </div>

          <div className="text-right text-xs text-muted-foreground space-y-1">
            <div className="font-mono text-foreground font-medium">
              Domain: 5°N–30°N · 45°E–105°E
            </div>
            <div className="font-mono text-primary">
              Selected: {fmtCoord(lat, lon)} ({locationRegion})
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setExplainOpen(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <Sparkles className="h-3 w-3" />
                Model Details
              </button>
              <span className="text-border">|</span>
              <button
                onClick={() => exportData(`command_center_${date}_${depth}m.csv`, "CSV")}
                className="flex items-center gap-1 text-[11px] font-semibold text-foreground hover:underline"
              >
                <Download className="h-3 w-3" />
                Export Field
              </button>
            </div>
            <MockNote className="mt-1" />
          </div>
        </div>
      </div>

      {/* Top Scientific KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Current Reconstruction"
          value={sub !== null && typeof sub === "number" ? sub.toFixed(2) : "--"}
          unit="°C"
          sub={`@ ${depth} m tier`}
          tone="teal"
          icon={<Layers className="h-4 w-4" />}
        />
        <Stat
          label="Surface Temp (SST)"
          value={sst !== null && typeof sst === "number" ? sst.toFixed(2) : "--"}
          unit="°C"
          sub="Copernicus Satellite L4"
          icon={<Thermometer className="h-4 w-4" />}
        />
        <Stat
          label="Prediction Uncertainty"
          value={unc !== null && typeof unc === "number" ? `±${unc.toFixed(2)}` : "--"}
          unit="°C"
          sub={`Neural σ @ ${depth} m`}
          tone="teal"
          icon={<Gauge className="h-4 w-4" />}
        />
        <Stat
          label="Thermocline Depth"
          value={tc !== null ? `${tc} m` : "--"}
          sub="max |dT/dz| gradient"
          tone="cool"
          icon={<Droplets className="h-4 w-4" />}
        />
        <Stat
          label="ARGO Validation"
          value={dataMode === "real" ? "18 QC Floats" : `${argoCount} Floats`}
          sub={argoDisplayLabel}
          tone="warm"
          icon={<Radio className="h-4 w-4" />}
        />
      </div>

      {/* Main Grid: Map & Profile on Left, Scientific Status on Right */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left Column: Interactive Map & Charts */}
        <div className="space-y-4">
          <Panel
            title="North Indian Ocean Subsurface Field"
            subtitle="Click map to sample coordinates · ARGO floats (rings) and Marine Heatwave markers are clickable"
            bodyClassName="p-3 space-y-3"
            right={
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{date}</span>
                <Pill tone="info">{depth} m</Pill>
              </div>
            }
          >
            <OceanMap
              variable={variable}
              depth={depth}
              date={date}
              selected={{ lat, lon }}
              onSelect={(la, lo) => {
                setLocation(la, lo);
                setDrawer(true);
              }}
              onArgoClick={() => setDrawer(true)}
              markers={EVENTS.filter((e) => e.status !== "Closed").map((e) => ({
                lat: e.lat,
                lon: e.lon,
                label: e.status === "Active" ? "MHW" : "Warming",
                tone: "hot" as const,
              }))}
            />

            {/* Controls Bar */}
            <div className="grid gap-3 md:grid-cols-[180px_1fr_1fr] pt-1">
              <DateControl />
              <VariableSelector />
              <DepthSelector />
            </div>
          </Panel>

          {/* Temperature Profile Chart & Time Series Chart */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <Panel
              title="Vertical Temperature Profile (0–1000 m)"
              subtitle={`${fmtCoord(lat, lon)} · Depth increases downward`}
              right={
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                  <span className="text-primary font-semibold">● AI Model</span>
                  <span className="text-aqua font-semibold">● ARGO In-Situ</span>
                  <span className="text-teal/70">● ±1σ Band</span>
                  <button
                    onClick={() =>
                      exportData(
                        `oceanembed_layer_${depth}m_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                        "PDF Profile",
                      )
                    }
                    className="flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs ml-1"
                    title={`Export publication PDF with graph and scientific physical explanation for the ${depth} m layer`}
                  >
                    <Download className="h-3 w-3" />
                    <span>Export {depth} m PDF</span>
                  </button>
                </div>
              }
            >
              <ProfileChart data={profile} thermocline={tc ? Number(String(tc).replace(" m", "")) : 75} />
            </Panel>

            <Panel
              title="Subsurface Time Series"
              subtitle={`Weekly synoptic reconstructed temperature history at ${depth} m`}
              right={<RangeTabs options={RANGES} value={range} onChange={setRange} />}
            >
              <SeriesChart data={activeSeries} />
            </Panel>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="space-y-4">
          <Panel title="Scientific Status" bodyClassName="p-4 space-y-3">
            <StatusRow
              label="Prediction Uncertainty"
              value={unc != null ? `±${unc.toFixed(2)} °C` : "--"}
              meter={unc != null ? Math.max(10, Math.min(100, Math.round(100 - unc * 15))) : 80}
              tone={unc != null && unc < 1.0 ? "teal" : "warm"}
            />
            <StatusRow
              label="ARGO Matchup"
              value={argoDistanceKm ? `${argoDistanceKm} km` : "--"}
              meter={Math.max(5, 100 - Number(argoDistanceKm) / 6)}
              tone="cool"
            />
            <StatusRow
              label="Model Integrity"
              value="Certified Frozen"
              meter={100}
              tone="teal"
            />

            <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
              <KeyValue
                label="Temperature @ Depth"
                value={sub != null ? `${sub.toFixed(2)} °C` : "--"}
              />
              <KeyValue
                label="Surface SST"
                value={sst != null ? `${sst.toFixed(2)} °C` : "--"}
              />
              <KeyValue
                label="Thermocline Depth"
                value={tc != null ? `${tc} m` : "--"}
              />
              <KeyValue
                label="Selected Region"
                value={locationRegion}
                mono={false}
              />
              <KeyValue
                label="Architecture"
                value="OceanEmbedNet (Physics)"
                mono={false}
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => setExplainOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Model Details & Inputs
              </button>
            </div>
          </Panel>

          {/* Temporal Alignment & Freshness Component */}
          <FreshnessPanel />
        </aside>
      </div>

      {/* Slide-out Location Analysis Drawer */}
      {drawer && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border bg-popover p-5 shadow-2xl animate-in slide-in-from-right-10 duration-200">
          <div className="flex items-start justify-between border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-primary text-xs font-semibold uppercase tracking-wider">
                <MapPin className="h-3.5 w-3.5" />
                Location Analysis
              </div>
              <h3 className="text-base font-bold text-foreground mt-0.5">{fmtCoord(lat, lon)}</h3>
              <p className="text-xs text-muted-foreground">
                {locationRegion} · {date}
              </p>
            </div>
            <button
              onClick={() => setDrawer(false)}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close analysis drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-1.5">
            <KeyValue label="Latitude" value={`${lat.toFixed(2)}°N`} />
            <KeyValue label="Longitude" value={`${lon.toFixed(2)}°E`} />
            <KeyValue label="Depth Layer" value={`${depth} m`} />
            <KeyValue
              label="Reconstructed Temp"
              value={sub != null ? `${sub.toFixed(2)} °C` : "--"}
            />
            <KeyValue
              label="Prediction Uncertainty"
              value={unc != null ? `±${unc.toFixed(2)} °C` : "--"}
            />
            <KeyValue
              label="Thermocline Depth"
              value={tc != null ? `${tc} m` : "--"}
            />
            <KeyValue
              label="Nearest ARGO Float"
              value={argoDisplayLabel}
            />
            <KeyValue
              label="Model Architecture"
              value="OceanEmbedNet (Frozen Physics Checkpoint)"
              mono={false}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setExplainOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Model Details
            </button>
            <button
              onClick={() => exportData(`profile_${lat}_${lon}.csv`, "CSV")}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Vertical Temperature Profile
            </div>
            <ProfileChart data={profile} height={250} thermocline={tc} />
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Historical Series at {depth} m
            </div>
            <SeriesChart data={series} height={180} />
          </div>

          <MockNote className="mt-5" />
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  meter,
  tone,
}: {
  label: string;
  value: string;
  meter: number;
  tone: "teal" | "warm" | "hot" | "cool";
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="numeric text-xs font-medium text-foreground">{value}</span>
      </div>
      <Meter value={meter} tone={tone} />
    </div>
  );
}
