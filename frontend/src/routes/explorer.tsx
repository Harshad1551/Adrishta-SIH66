import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { fetchRealTimeseries, fetchRealArgoFloats, type RealArgoFloatItem } from "@/lib/ocean/api";
import type { SeriesPoint } from "@/lib/ocean/data";
import {
  Compass,
  Layers,
  Sparkles,
  Download,
  Box,
  Map as MapIcon,
  ShieldAlert,
  Thermometer,
} from "lucide-react";
import { OceanMap } from "@/components/ocean/OceanMap";
import { Ocean3D } from "@/components/ocean/Ocean3D";
import { ProfileChart, SeriesChart } from "@/components/ocean/charts";
import {
  DateControl,
  DepthSelector,
  RangeTabs,
  RegionControl,
  VariableSelector,
} from "@/components/ocean/controls";
import { KeyValue, MockNote, Panel, Pill } from "@/components/ocean/primitives";
import { fmtCoord, useOcean } from "@/lib/ocean/state";
import {
  DEPTHS,
  type Depth,
} from "@/lib/ocean/data";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Ocean Explorer · ADRISHTA: Subsurface Ocean AI" },
      {
        name: "description",
        content:
          "Depth-resolved exploration of the reconstructed North Indian Ocean: interactive 2D map and 3D vertical profile.",
      },
    ],
  }),
  component: Explorer,
});

const LAYERS = ["Temperature field", "ARGO coverage", "Bathymetric mask"];
const RANGES = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: 365, label: "1Y" },
];

function Explorer() {
  const {
    dataMode,
    date,
    depth,
    variable,
    lat,
    lon,
    setLocation,
    setDepth,
    locationRegion,
    activeProfile: profile,
    realProfileData,
    setExplainOpen,
    exportData,
  } = useOcean();
  const [layer, setLayer] = useState(LAYERS[0]);
  const [range, setRange] = useState(30);
  const [viewMode, setViewMode] = useState<"map" | "3d">("map");
  const [realSeries, setRealSeries] = useState<SeriesPoint[] | null>(null);
  const [realFloats, setRealFloats] = useState<RealArgoFloatItem[]>([]);

  // Fetch real floats for coordinate-specific distance calculation
  useEffect(() => {
    fetchRealArgoFloats("forward_20260928")
      .then((res) => {
        if (res && res.floats) setRealFloats(res.floats);
      })
      .catch(() => {});
  }, []);

  // Fetch genuine 142-week neural timeseries
  useEffect(() => {
    if (dataMode !== "real") {
      setRealSeries(null);
      return;
    }
    let active = true;
    fetchRealTimeseries(lat, lon, depth)
      .then((res) => {
        if (!active) return;
        const pts: SeriesPoint[] = res.series.map((item) => ({
          date: item.date,
          label: item.date.slice(5),
          temp: item.temperature,
          anomaly: item.anomaly,
          event: null,
        }));
        setRealSeries(pts);
      })
      .catch(() => {
        if (active) setRealSeries(null);
      });
    return () => {
      active = false;
    };
  }, [dataMode, lat, lon, depth]);

  const activeSeries = realSeries ?? [];

  // Compute true distance from selected coordinate to closest actual ARGO float
  const nearestRealFloat = useMemo(() => {
    if (realFloats.length === 0) return null;
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
  }, [realFloats, lat, lon]);

  const argoDisplayLabel = nearestRealFloat
    ? (nearestRealFloat.distKm <= 300
        ? `${nearestRealFloat.distKm.toFixed(1)} km (WMO ${nearestRealFloat.float.wmoId})`
        : "No nearby float (<300 km)")
    : "18 QC Floats (Regional)";

  const depthIdx = DEPTHS.indexOf(depth);
  const activeDepthPoint = profile.find((p) => p.depth === depth);

  const subTemp =
    dataMode === "real" && realProfileData?.predicted_temperature
      ? realProfileData.predicted_temperature[depthIdx >= 0 ? depthIdx : 7]
      : (activeDepthPoint?.temp ?? null);

  const unc =
    dataMode === "real" && realProfileData?.uncertainty_degC
      ? realProfileData.uncertainty_degC[depthIdx >= 0 ? depthIdx : 7]
      : (activeDepthPoint ? +(activeDepthPoint.hi - activeDepthPoint.temp).toFixed(2) : null);

  const sst =
    dataMode === "real" && realProfileData?.surface_inputs?.sst !== undefined
      ? realProfileData.surface_inputs.sst
      : (realProfileData?.predicted_temperature?.[0] ?? null);

  const tc =
    dataMode === "real" && realProfileData?.thermocline_depth_m !== undefined
      ? realProfileData.thermocline_depth_m
      : null;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-primary font-semibold">SPATIAL FIELD EXPLORER</span>
            <span className="text-xs text-muted-foreground">· Depth-Resolved Subsurface Structure</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              0.25° × 0.25° Grid
            </span>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">Ocean Explorer</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Depth-resolved exploration of reconstructed subsurface layers across 0–1000 m. Toggle
            between 2D gridded map and 3D vertical temperature profile.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-border bg-muted/30 p-1 text-xs">
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-all ${
                viewMode === "map"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              2D Field Map
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-all ${
                viewMode === "3d"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              3D Vertical Profile
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                exportData(
                  `oceanembed_layer_${depth}m_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                  "PDF Profile",
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
              title={`Export publication PDF for ${depth} m layer with graph and scientific analysis`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export {depth} m PDF</span>
            </button>
            <button
              onClick={() => exportData(`oceanembed_grid_slice_${depth}m_${date}.csv`, "Grid CSV")}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              title="Download 0.25° grid slice at selected depth as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Export Grid CSV
            </button>
          </div>
        </div>
      </div>

      {/* 3-Column Layout: Controls, Main Visualization, Selected Point Analysis */}
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Left Filter & Controls Panel */}
        <aside className="space-y-4">
          <Panel title="Exploration Controls" bodyClassName="p-4 space-y-4">
            <RegionControl />
            <DateControl />
            <VariableSelector />
            <DepthSelector compact />

            <div className="pt-2 border-t border-border/60">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Display Overlay Layer
              </div>
              <div className="space-y-1.5">
                {LAYERS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLayer(l)}
                    className={`w-full rounded border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                      l === layer
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Export buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={() =>
                  exportData(
                    `oceanembed_layer_${depth}m_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                    "PDF Profile",
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export {depth} m Layer PDF</span>
              </button>
              <button
                onClick={() => exportData(`explorer_${lat}_${lon}_${depth}m.csv`, "CSV")}
                className="w-full flex items-center justify-center gap-1.5 rounded border border-border bg-muted/40 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export Profile CSV
              </button>
            </div>
          </Panel>
        </aside>

        {/* Center Main Visualization Column */}
        <div className="space-y-4">
          {viewMode === "map" ? (
            <Panel
              title="Reconstructed Ocean Field Map"
              subtitle={`Variable: ${variable.toUpperCase()} · Depth: ${depth} m · Layer: ${layer}`}
              bodyClassName="p-3"
              right={<Pill tone="info">{depth} m tier</Pill>}
            >
              <OceanMap
                variable={variable}
                depth={depth}
                date={date}
                selected={{ lat, lon }}
                onSelect={setLocation}
                showArgo={layer !== "Temperature field"}
                height={400}
              />
            </Panel>
          ) : (
            <Panel
              title="3D Vertical Temperature Profile"
              subtitle="Rotatable & tiltable 15-tier vertical column · Click any depth slab to inspect layer"
              bodyClassName="p-4"
              right={<Pill tone="ok">15-Depth Profile Stack</Pill>}
            >
              <Ocean3D
                lat={lat}
                lon={lon}
                date={date}
                depth={depth}
                onDepthChange={(d) => setDepth(d as Depth)}
              />
            </Panel>
          )}

          {/* Profile & Timeseries under main visualization */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <Panel
              title="Vertical Temperature Profile"
              subtitle={`${fmtCoord(lat, lon)} · Depths 0 to 1000 m`}
            >
              <ProfileChart data={profile} thermocline={tc} />
            </Panel>

            <Panel
              title="Weekly Synoptic Time Series"
              subtitle={`Operational reconstruction history at ${depth} m`}
              right={<RangeTabs options={RANGES} value={range} onChange={setRange} />}
            >
              <SeriesChart data={activeSeries} />
            </Panel>
          </div>
        </div>

        {/* Right Inspection Panel */}
        <aside className="space-y-4">
          <Panel title="Selected Coordinate" bodyClassName="p-4 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="font-mono text-xs font-bold text-foreground">
                {fmtCoord(lat, lon)}
              </span>
              <span className="text-[10px] font-mono font-bold text-teal">
                {locationRegion}
              </span>
            </div>

            <KeyValue
              label="Surface SST"
              value={sst !== null ? `${sst.toFixed(2)} °C` : "--"}
            />
            <KeyValue
              label={`Temp @ ${depth} m`}
              value={subTemp !== null ? `${subTemp.toFixed(2)} °C` : "--"}
            />
            <KeyValue
              label="Prediction Uncertainty"
              value={unc !== null ? `±${unc.toFixed(2)} °C` : "--"}
            />
            <KeyValue
              label="Thermocline Depth"
              value={tc !== null ? `${tc} m` : "--"}
            />
            <KeyValue
              label="Nearest ARGO"
              value={argoDisplayLabel}
            />
            <KeyValue
              label="Model State"
              value="OceanEmbedNet (Physics)"
              mono={false}
            />

            <div className="pt-2">
              <button
                onClick={() => setExplainOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Model Details & Inputs
              </button>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
