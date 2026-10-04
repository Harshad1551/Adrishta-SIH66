import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Radar,
  Flame,
  Droplets,
  Layers,
  TriangleAlert,
  ArrowRight,
  TrendingUp,
  MapPin,
  Calendar,
  ShieldCheck,
  Download,
} from "lucide-react";
import { OceanMap } from "@/components/ocean/OceanMap";
import { ProfileChart, SeriesChart } from "@/components/ocean/charts";
import { Panel, Pill, KeyValue, MockNote, SectionTitle } from "@/components/ocean/primitives";
import { useOcean, fmtCoord } from "@/lib/ocean/state";
import {
  fetchDerivedPhysics,
  fetchMarineHeatwaves,
  fetchObservationGaps,
  type RealDerivedPhysicsResponse,
  type RealMhwResponse,
  type RealGapsResponse,
} from "@/lib/ocean/api";
import { useEffect } from "react";
import {
  EVENTS,
  DOMAIN,
  anomalyAt,
  gapPriority,
  gapScore,
  isLand,
  mhwIndex,
  mhwStatus,
  obsDensity,
  profileAt,
  regionalStats,
  surfaceTemp,
  tempAtDepth,
  thermoclineDepth,
  timeSeries,
  uncertaintyAt,
  type OceanEvent,
} from "@/lib/ocean/data";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Ocean Intelligence & Anomalies — ADRISHTA: Subsurface Ocean AI" },
      {
        name: "description",
        content:
          "Advanced oceanographic intelligence: marine heatwaves, subsurface thermal anomalies, thermocline detection, and sensor observation gap priorities.",
      },
    ],
  }),
  component: IntelligencePage,
});

const defaultEvent: OceanEvent = {
  id: "mhw-2026-07",
  name: "Central Arabian Sea Marine Heatwave",
  status: "Active",
  start: "2026-08-18",
  durationDays: 40,
  peakAnomaly: 2.4,
  affectedDepth: "0–75 m",
  heatContent: 1.42,
  lat: 17.5,
  lon: 64.5,
  isSynthetic: true,
};

function IntelligencePage() {
  const {
    dataMode,
    date,
    depth,
    lat,
    lon,
    setLocation,
    locationRegion,
    exportData,
    selectedEventId,
    setSelectedEventId,
  } = useOcean();
  const [activeTab, setActiveTab] = useState<"mhw" | "anomaly" | "thermocline" | "gaps">("mhw");

  const { realProfileData } = useOcean();
  const [realDerived, setRealDerived] = useState<RealDerivedPhysicsResponse | null>(null);
  const [realMhw, setRealMhw] = useState<RealMhwResponse | null>(null);
  const [realGaps, setRealGaps] = useState<RealGapsResponse | null>(null);
  const [loadingReal, setLoadingReal] = useState<boolean>(false);

  useEffect(() => {
    if (dataMode !== "real") return;
    let mounted = true;
    setLoadingReal(true);

    Promise.all([
      fetchDerivedPhysics(lat, lon, date).catch(() => null),
      fetchMarineHeatwaves(lat, lon, date).catch(() => null),
      fetchObservationGaps(4, date).catch(() => null),
    ]).then(([dRes, mRes, gRes]) => {
      if (!mounted) return;
      if (dRes) setRealDerived(dRes);
      if (mRes) setRealMhw(mRes);
      if (gRes) setRealGaps(gRes);
      setLoadingReal(false);
    });

    return () => {
      mounted = false;
    };
  }, [dataMode, lat, lon, date]);

  const sst = useMemo(() => {
    if (dataMode === "real") {
      return realProfileData?.surface_inputs?.sst ?? (realProfileData?.predicted_temperature?.[0] ?? 28.5);
    }
    return surfaceTemp(lat, lon, date);
  }, [dataMode, realProfileData, lat, lon, date]);

  const depthIdx = useMemo(() => {
    const depthsArr = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
    const idx = depthsArr.indexOf(depth);
    return idx >= 0 ? idx : 0;
  }, [depth]);

  const sub = useMemo(() => {
    if (dataMode === "real") {
      return realProfileData?.predicted_temperature?.[depthIdx] ?? 20.0;
    }
    return tempAtDepth(lat, lon, depth, date);
  }, [dataMode, realProfileData, depthIdx, lat, lon, depth, date]);

  const anom = useMemo(() => {
    if (dataMode === "real") {
      // In REAL mode, do not fabricate anomaly with fixed 20°C constant
      return null;
    }
    return anomalyAt(lat, lon, depth, date);
  }, [dataMode, lat, lon, depth, date]);

  const tc = useMemo(() => {
    if (dataMode === "real") {
      return realDerived?.thermocline?.depth_m ?? (realProfileData?.thermocline_depth_m ?? 75.0);
    }
    return thermoclineDepth(lat, lon, date);
  }, [dataMode, realDerived, realProfileData, lat, lon, date]);

  const mhw = useMemo(() => {
    if (dataMode === "real") {
      return realMhw?.local_evaluation?.intensity_ratio ?? 0.0;
    }
    return mhwIndex(lat, lon, date);
  }, [dataMode, realMhw, lat, lon, date]);

  const mhwLabel = useMemo(() => {
    if (dataMode === "real") {
      return realMhw?.local_evaluation?.severity_label ?? (mhw > 1.0 ? "Category I: Moderate" : "Normal / Non-Heatwave");
    }
    return mhwStatus(mhw);
  }, [dataMode, realMhw, mhw]);

  const selectedEvent = useMemo<OceanEvent>(
    () => EVENTS.find((e) => e.id === selectedEventId) ?? EVENTS[0] ?? defaultEvent,
    [selectedEventId],
  );

  const profile = useMemo(() => {
    if (dataMode === "real" && realProfileData?.predicted_temperature) {
      return realProfileData.depths_m.map((d, i) => {
        const t = realProfileData.predicted_temperature?.[i] ?? 20;
        const u = realProfileData.uncertainty_degC?.[i] ?? 0.25;
        return {
          depth: d,
          temp: +t.toFixed(2),
          lo: +(t - u).toFixed(2),
          hi: +(t + u).toFixed(2),
          band: [+(t - u).toFixed(2), +(t + u).toFixed(2)] as [number, number],
          argo: null,
        };
      });
    }
    return profileAt(lat, lon, date);
  }, [dataMode, realProfileData, lat, lon, date]);

  const series = useMemo(() => {
    return timeSeries(lat, lon, depth, 90, date);
  }, [lat, lon, depth, date]);

  // Top observation gaps from real data or demo fallback
  const topGaps = useMemo(() => {
    if (dataMode === "real" && realGaps && realGaps.recommendations?.length > 0) {
      return realGaps.recommendations.map((r) => ({
        lat: r.target_lat,
        lon: r.target_lon,
        score: r.score,
      }));
    }
    const list: Array<{ lat: number; lon: number; score: number }> = [];
    for (let la = DOMAIN.latMin + 1; la < DOMAIN.latMax; la += 2.5) {
      for (let lo = DOMAIN.lonMin + 1; lo < DOMAIN.lonMax; lo += 2.5) {
        if (isLand(la, lo)) continue;
        list.push({ lat: la, lon: lo, score: gapScore(la, lo, date) });
      }
    }
    return list.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [dataMode, realGaps, date]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-primary font-semibold">SUBSURFACE OCEAN INTELLIGENCE</span>
            <span className="text-xs text-muted-foreground">· Dynamic Risk & Anomaly Tracking</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              Subsurface Event Engine
            </span>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">
            Ocean Intelligence & Extreme Events
          </h1>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Subsurface anomaly detection, marine heatwave categorization, thermocline shoaling, and
            targeted autonomous sensor gap planning.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportData(`oceanembed_intelligence_dossier_${date}.pdf`, "PDF Intelligence")
            }
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-sm"
            title="Download publication-grade intelligence dossier as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF Dossier
          </button>
          <button
            onClick={() => exportData(`oceanembed_extreme_events_${date}.csv`, "Events CSV")}
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            title="Download marine heatwaves and thermal anomalies as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export Events CSV
          </button>
          <button
            onClick={() => exportData(`oceanembed_observation_gaps_${date}.csv`, "Gaps CSV")}
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            title="Download autonomous sampling priority scores as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export Gaps CSV
          </button>
        </div>
      </div>

      {/* Distinction Banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
        <TriangleAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-amber-200/90">
          <strong className="font-semibold text-amber-200 block mb-0.5">
            Observational vs Reconstructed Status
          </strong>
          Observed marine heatwave declarations and model-reconstructed subsurface thermal fields
          are maintained as independent operational layers. Anomaly thresholds are referenced
          against the 1993–2020 climatology.
        </div>
      </div>

      {/* Intelligence Modules Selector */}
      <div className="flex flex-wrap gap-2 border-b border-border/80 pb-3">
        {(
          [
            { id: "mhw", label: "Marine Heatwaves (MHW)", icon: Flame },
            { id: "anomaly", label: "Subsurface Anomaly Field", icon: TrendingUp },
            { id: "thermocline", label: "Thermocline Dynamics", icon: Droplets },
            { id: "gaps", label: "Observation Priority Zones", icon: Radar },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border/80 bg-muted/20 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab View */}
      {activeTab === "mhw" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            {/* Marine Heatwave Map */}
            <Panel
              title="Marine Heatwave Intensity Distribution (Hobday Categories)"
              subtitle="Shaded by MHW severity index · Click map to sample local heat content"
              bodyClassName="p-3"
              right={
                <Pill tone="hot">
                  MHW Index: {mhw.toFixed(2)} ({mhwLabel})
                </Pill>
              }
            >
              <OceanMap
                variable="mhw"
                depth={depth}
                date={date}
                selected={{ lat, lon }}
                onSelect={setLocation}
                markers={EVENTS.map((e) => ({
                  lat: e.lat,
                  lon: e.lon,
                  label: e.name.slice(0, 18),
                  tone: e.status === "Active" ? "hot" : "warm",
                }))}
                height={380}
              />
            </Panel>

            {/* Tracked Events List */}
            <Panel title="Monitored Marine Heatwave Events" bodyClassName="p-3 space-y-2.5">
              {EVENTS.map((e) => {
                const isSelected = selectedEvent.id === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedEventId(e.id);
                      setLocation(e.lat, e.lon);
                    }}
                    className={`w-full p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                        : "border-border/60 bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{e.name}</span>
                      <Pill
                        tone={
                          e.status === "Active"
                            ? "hot"
                            : e.status === "Declining"
                              ? "warm"
                              : "neutral"
                        }
                      >
                        {e.status}
                      </Pill>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground font-mono">
                      <div>
                        Peak Anomaly:{" "}
                        <span className="text-primary font-bold">+{e.peakAnomaly} °C</span>
                      </div>
                      <div>
                        Duration: <span className="text-foreground">{e.durationDays} days</span>
                      </div>
                      <div>
                        Depth Column: <span className="text-foreground">{e.affectedDepth}</span>
                      </div>
                      <div>
                        Heat Content:{" "}
                        <span className="text-warm font-semibold">{e.heatContent} GJ/m²</span>
                      </div>
                    </div>
                  </button>
                );
              })}

              <div className="rounded border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground mt-3">
                Selected Event Center:{" "}
                <span className="font-mono text-primary font-semibold">
                  {fmtCoord(selectedEvent.lat, selectedEvent.lon)}
                </span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "anomaly" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Panel
              title={`Subsurface Temperature Anomaly Field at ${depth} m`}
              subtitle="Climatological deviation (Diverging Scale: Blue Cool / Red Warm)"
              bodyClassName="p-3"
              right={
                <Pill tone={anom > 0 ? "hot" : "cool"}>
                  {anom > 0 ? "+" : ""}
                  {anom.toFixed(2)} °C Anomaly
                </Pill>
              }
            >
              <OceanMap
                variable="anomaly"
                depth={depth}
                date={date}
                selected={{ lat, lon }}
                onSelect={setLocation}
                height={380}
              />
            </Panel>

            <Panel title="Subsurface Physical State" bodyClassName="p-4 space-y-3">
              <KeyValue label="Reconstructed Temp" value={`${sub.toFixed(2)} °C`} />
              <KeyValue
                label="Prediction Uncertainty"
                value={unc !== null ? `±${unc.toFixed(2)} °C (1σ)` : "Calibrated"}
              />
              <KeyValue
                label="Temperature Anomaly"
                value={anom !== null ? `${anom > 0 ? "+" : ""}${anom.toFixed(2)} °C` : "Climatology reference required"}
              />
              <KeyValue label="Sea Surface SST" value={`${sst.toFixed(2)} °C`} />
              <KeyValue label="Thermocline Depth" value={`~${tc} m`} />
              <KeyValue label="Mixed Layer Depth" value={realDerived?.mixed_layer_depth_m ? `${realDerived.mixed_layer_depth_m} m` : "--"} />
              <KeyValue label="Domain Sub-region" value={locationRegion} mono={false} />

              <div className="pt-2 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                  90-Day Anomaly Evolution
                </div>
                <SeriesChart data={series} height={170} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "thermocline" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Panel
              title="Basin-Wide Thermocline Depth Field (m)"
              subtitle="Maximum temperature gradient dT/dz depth tier across the water column"
              bodyClassName="p-3"
              right={<Pill tone="cool">{tc} m Depth</Pill>}
            >
              <OceanMap
                variable="thermocline"
                depth={depth}
                date={date}
                selected={{ lat, lon }}
                onSelect={setLocation}
                height={380}
              />
            </Panel>

            <Panel title="Thermocline Profile & Gradient" bodyClassName="p-4 space-y-3">
              <div className="space-y-2">
                <KeyValue label="Estimated Depth" value={`${tc} m`} />
                <KeyValue label="Peak Gradient" value="~0.18 °C/m" />
                <KeyValue label="Upper Mixed Layer" value={`0–${Math.round(tc * 0.55)} m`} />
                <KeyValue label="Permanent Pycnocline" value={`${tc}–450 m`} />
              </div>

              <div className="pt-2 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  Vertical Gradient Profile
                </div>
                <ProfileChart data={profile} thermocline={tc} height={230} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "gaps" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Panel
              title="Observation Priority Zones (Where New Observations Add Most Value)"
              subtitle="High gap scores indicate regions with high uncertainty, strong gradients and float sparsity"
              bodyClassName="p-3"
              right={<Pill tone="hot">Target Priority Map</Pill>}
            >
              <OceanMap
                variable="gap"
                depth={depth}
                date={date}
                selected={{ lat, lon }}
                onSelect={setLocation}
                height={380}
              />
            </Panel>

            <Panel title="Top Sensor Deployment Targets" bodyClassName="p-3 space-y-2">
              <div className="text-xs text-muted-foreground mb-1">
                Highest priority deployment coordinates:
              </div>
              {topGaps.map((g) => {
                const p = gapPriority(g.score);
                return (
                  <button
                    key={`${g.lat}-${g.lon}`}
                    onClick={() => setLocation(g.lat, g.lon)}
                    className="flex w-full items-center justify-between rounded border border-border bg-muted/20 px-3 py-2 text-left transition-colors hover:border-primary/50 group"
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {fmtCoord(g.lat, g.lon)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Gap Score: {g.score.toFixed(2)}
                      </div>
                    </div>
                    <Pill tone={p === "High" ? "hot" : p === "Medium" ? "warm" : "neutral"}>
                      {p} Priority
                    </Pill>
                  </button>
                );
              })}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
