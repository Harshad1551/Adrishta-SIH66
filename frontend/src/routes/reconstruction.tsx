import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BrainCircuit,
  Database,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Info,
  ShieldCheck,
  Download,
  Sliders,
  Sparkles,
} from "lucide-react";
import { Panel, Pill, KeyValue, MockNote } from "@/components/ocean/primitives";
import { useOcean, fmtCoord } from "@/lib/ocean/state";
import {
  DEPTHS,
  surfaceInputs,
  tempAtDepth,
  uncertaintyAt,
  TRAINING_CURVE,
} from "@/lib/ocean/data";
import { VERSION_CONFIG, DATASET_CONFIG } from "@/lib/ocean/config";
import type { ChannelId } from "@/lib/ocean/data/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const Route = createFileRoute("/reconstruction")({
  head: () => ({
    meta: [
      { title: "AI Reconstruction Pipeline — ADRISHTA: Subsurface Ocean AI" },
      {
        name: "description",
        content:
          "End-to-end deep learning reconstruction pipeline: 7 satellite inputs, quality control, 256-d ocean embeddings, physics loss constraints, and 15-tier vertical output.",
      },
    ],
  }),
  component: ReconstructionPage,
});

const PIPELINE_STAGES = [
  { id: 1, name: "Surface Inputs", desc: "7 Satellite Channels" },
  { id: 2, name: "QC / Harmonization", desc: "Range Check & Flagging" },
  { id: 3, name: "0.25° Regridding", desc: "North Indian Ocean Mesh" },
  { id: 4, name: "Daily Alignment", desc: "00:00 UTC Temporal Anchor" },
  { id: 5, name: "Ocean Embedding", desc: "256-D Latent Tensor" },
  { id: 6, name: "Physics Decoder", desc: "Hydrostatic Constraints" },
  { id: 7, name: "15 Depth Output", desc: "0–1000 m Profiles" },
];

function ReconstructionPage() {
  const {
    dataMode,
    date,
    lat,
    lon,
    activeProfile,
    exportData,
    simulatedMissingChannel,
    setSimulatedMissingChannel,
  } = useOcean();
  const [activeStage, setActiveStage] = useState(5);

  const { realProfileData } = useOcean();

  // In REAL mode: strictly use 7 surface channels returned from FastAPI /reconstruction/profile
  const inputs = (dataMode === "real" && realProfileData?.surface_inputs)
    ? [
        { id: "sst", label: "Sea Surface Temp (SST)", value: realProfileData.surface_inputs.sst, unit: "°C", source: "NOAA OISST v2.1", qc: "GOOD" as const },
        { id: "sss", label: "Sea Surface Salinity (SSS)", value: realProfileData.surface_inputs.sss, unit: "PSU", source: "SMAP Level-3 SSS", qc: "GOOD" as const },
        { id: "ssh", label: "Sea Surface Height (SSH)", value: realProfileData.surface_inputs.ssh, unit: "m", source: "Copernicus DUACS Altimetry", qc: "GOOD" as const },
        { id: "cu", label: "Zonal Current (U)", value: realProfileData.surface_inputs.current_u, unit: "m/s", source: "OSCAR Satellite Currents", qc: "GOOD" as const },
        { id: "cv", label: "Meridional Current (V)", value: realProfileData.surface_inputs.current_v, unit: "m/s", source: "OSCAR Satellite Currents", qc: "GOOD" as const },
        { id: "wu", label: "Zonal Wind (U)", value: realProfileData.surface_inputs.wind_u, unit: "m/s", source: "CCMP v3.1 Cross-Calibrated Wind", qc: "GOOD" as const },
        { id: "wv", label: "Meridional Wind (V)", value: realProfileData.surface_inputs.wind_v, unit: "m/s", source: "CCMP v3.1 Cross-Calibrated Wind", qc: "GOOD" as const },
      ]
    : surfaceInputs(lat, lon, date);

  const missingCount = inputs.filter((i) => i.qc === "FLAGGED").length;
  const isDegraded = missingCount > 0;

  // Generate 15-depth vertical outputs directly from real model prediction in REAL mode
  const outputs = DEPTHS.map((d, i) => {
    if (dataMode === "real" && realProfileData?.predicted_temperature) {
      const predT = realProfileData.predicted_temperature[i] ?? 20.0;
      const uncT = realProfileData.uncertainty_degC?.[i] ?? 0.25;
      const surfT = realProfileData.predicted_temperature[0] ?? predT;
      return {
        depth: d,
        temp: predT,
        unc: uncT,
        grad: d === 0 ? "0.000" : (-(predT - surfT) / d).toFixed(3),
      };
    }
    const pt = activeProfile[i] ?? { temp: tempAtDepth(lat, lon, d, date), lo: 0, hi: 0 };
    const baseT = pt.temp;
    const baseU = +(pt.hi - pt.temp).toFixed(2) || uncertaintyAt(lat, lon, d, date);
    const unc = isDegraded ? +(baseU + missingCount * 0.18).toFixed(2) : baseU;
    const surfT = activeProfile[0]?.temp ?? tempAtDepth(lat, lon, 0, date);
    return {
      depth: d,
      temp: baseT,
      unc,
      grad: d === 0 ? "0.000" : (-(baseT - surfT) / d).toFixed(3),
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-primary font-semibold">RECONSTRUCTION</span>
            <span className="text-xs text-muted-foreground">? Vertical Subsurface Profiles</span>
            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              15 Standard Depths
            </span>
          </div>
          <h1 className="font-display text-xl font-bold text-foreground">
            Subsurface Temperature Reconstruction
          </h1>
          <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
            A satellite embedding-based deep learning framework reconstructing subsurface ocean
            temperature profiles from 7 surface observation channels with physics-constrained loss
            terms.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              exportData(
                `oceanembed_reconstruction_report_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
                "PDF Profile",
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-sm"
            title="Download full 15-depth vertical reconstruction and physics loss report as PDF"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF Report
          </button>
          <button
            onClick={() =>
              exportData(
                `oceanembed_vertical_profile_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.csv`,
                "CSV Profile",
              )
            }
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            title="Download 15-depth temperature and uncertainty array as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export Profile CSV
          </button>
          <MockNote />
        </div>
      </div>

      {/* Horizontal Pipeline Stages */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reconstruction Pipeline Flow (Click stage to inspect)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {PIPELINE_STAGES.map((s) => {
            const isActive = activeStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStage(s.id)}
                className={`relative flex flex-col p-3 rounded-lg border text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/15 ring-1 ring-primary/40 shadow-sm"
                    : "border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] font-bold text-primary">0{s.id}</span>
                  {isActive && <span className="h-2 w-2 rounded-full bg-teal animate-ping" />}
                </div>
                <div className="text-xs font-semibold text-foreground leading-tight">{s.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: Surface Inputs (7 channels) & Missing Channel Testing Bar */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">
              1. Surface Inputs (7 Observation Channels at {fmtCoord(lat, lon)})
            </h2>
          </div>

          {/* Missing-Input / Low Confidence Simulator */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Sliders className="h-3 w-3 text-primary" />
              Simulate Missing Channel:
            </span>
            <select
              value={simulatedMissingChannel}
              onChange={(e) => setSimulatedMissingChannel(e.target.value as ChannelId | "none")}
              className="rounded border border-border bg-popover px-2 py-0.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
            >
              <option value="none">None (All 7 Channels Available)</option>
              <option value="wind_u">Wind U/V Unavailable (Flagged)</option>
              <option value="sss">SSS Satellite Masked (Flagged)</option>
              <option value="ssh">SSH Altimetry Stale (Flagged)</option>
            </select>
          </div>
        </div>

        {/* Low Confidence Warning Banner if a channel is missing */}
        {isDegraded && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-3 animate-in fade-in-50">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-200">
              <strong className="font-semibold text-amber-200 block mb-0.5">
                Low Confidence Prediction Warning: Missing/Flagged Ingestion Feed
              </strong>
              One or more required surface channels ({simulatedMissingChannel}) failed QC or is
              unavailable. Prediction remains available with degraded confidence score and expanded
              uncertainty envelope (±1σ).
            </div>
          </div>
        )}

        {/* 7 Channels Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {inputs.map((inp) => (
            <div
              key={inp.id}
              className={`rounded-lg border p-3.5 space-y-2 flex flex-col justify-between transition-all ${
                inp.qc === "PASS"
                  ? "border-border bg-card"
                  : "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/30"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary">{inp.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                      inp.qc === "PASS"
                        ? "bg-teal/15 text-teal"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    }`}
                  >
                    {inp.qc}
                  </span>
                </div>
                <div className="mt-2 font-mono text-base font-bold text-foreground">
                  {inp.qc === "PASS" ? inp.value : "—"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{inp.unit}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50 text-[10px] space-y-0.5 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Source:</span>
                  <span className="font-mono font-semibold text-foreground">{inp.source}</span>
                </div>
                <div className="flex justify-between">
                  <span>QC Status:</span>
                  <span
                    className={
                      inp.qc === "PASS" ? "text-teal font-medium" : "text-amber-400 font-medium"
                    }
                  >
                    {inp.qc === "PASS" ? "Verified" : "Missing / Flagged"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2 & 3: Data Quality & Embedding */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Data Quality Card */}
        <Panel
          title="2. Preprocessing Harmonization & Mesh Alignment"
          bodyClassName="p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase font-medium">
                QC Status
              </div>
              <div className="font-mono font-bold text-teal mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isDegraded ? "Degraded Stream" : "100% Validated"}
              </div>
            </div>
            <div className="rounded border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase font-medium">
                Spatial Mesh
              </div>
              <div className="font-mono font-bold text-foreground mt-0.5">
                0.25° × 0.25° Regular
              </div>
            </div>
            <div className="rounded border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase font-medium">
                Bathymetric Mask
              </div>
              <div className="font-mono font-bold text-foreground mt-0.5">GEBCO 15-arcsec</div>
            </div>
            <div className="rounded border border-border bg-muted/20 p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase font-medium">
                Normalization
              </div>
              <div className="font-mono font-bold text-foreground mt-0.5">
                Z-Score (Climatology)
              </div>
            </div>
          </div>
          <div className="rounded border border-border/80 bg-surface/40 p-3 text-xs leading-relaxed text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Spatial & Temporal Alignment Rules:</div>
            <div>
              • All orbital swaths projected onto North Indian Ocean grid (5°N–30°N, 45°E–105°E)
            </div>
            <div>• Temporal window centered at 00:00 UTC daily</div>
          </div>
        </Panel>

        {/* Ocean Embedding Card */}
        <Panel
          title="3. Ocean Embedding Vector (Latent Representation)"
          bodyClassName="p-4 space-y-3"
        >
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-primary">
                Ocean Embedding Vector (z in R^256)
              </span>
              <Pill tone="info">256-D Latent Tensor</Pill>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Spatial feature maps from the 7 surface channels are encoded through a deep residual
              convolutional backbone into a dense 256-dimensional compact embedding vector capturing
              mesoscale circulation, Rossby waves, and heat content.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-border bg-muted/20 p-2">
              <div className="text-[10px] text-muted-foreground uppercase">Encoder</div>
              <div className="font-mono font-bold text-foreground mt-0.5">CNN ResNet-34</div>
            </div>
            <div className="rounded border border-border bg-muted/20 p-2">
              <div className="text-[10px] text-muted-foreground uppercase">Latent Dim</div>
              <div className="font-mono font-bold text-primary mt-0.5">
                {VERSION_CONFIG.embeddingDimension} Float32
              </div>
            </div>
            <div className="rounded border border-border bg-muted/20 p-2">
              <div className="text-[10px] text-muted-foreground uppercase">Target Superv.</div>
              <div className="font-mono font-bold text-teal mt-0.5">GLORYS12V1</div>
            </div>
          </div>
        </Panel>
      </div>



      {/* SECTION 5: 15-Depth Reconstructed Output Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">
            4. Reconstructed Output: 15-Tier Vertical Temperature Column
          </h2>
          <span className="text-xs font-mono text-primary font-medium">{fmtCoord(lat, lon)}</span>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-4 text-left">Depth Tier (m)</th>
                <th className="py-2.5 px-4 text-left">Reconstructed Temp (°C)</th>
                <th className="py-2.5 px-4 text-left">Uncertainty (±1σ)</th>
                <th className="py-2.5 px-4 text-left">Vertical Gradient (°C/m)</th>
                <th className="py-2.5 px-4 text-left">Oceanic Layer</th>
                <th className="py-2.5 px-4 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {outputs.map((o) => {
                const layer =
                  o.depth <= 30
                    ? "Surface Mixed Layer"
                    : o.depth <= 150
                      ? "Thermocline Zone"
                      : o.depth <= 500
                        ? "Mesopelagic"
                        : "Bathypelagic Abyss";
                return (
                  <tr key={o.depth} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-4 font-bold text-foreground">{o.depth} m</td>
                    <td className="py-2 px-4 font-bold text-primary">{o.temp.toFixed(2)} °C</td>
                    <td className="py-2 px-4 text-muted-foreground">±{o.unc.toFixed(2)} °C</td>
                    <td className="py-2 px-4 text-muted-foreground">{o.grad}</td>
                    <td className="py-2 px-4 font-sans text-muted-foreground">{layer}</td>
                    <td className="py-2 px-4 text-right text-teal font-semibold">
                      {isDegraded ? "DEGRADED" : "HIGH"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      
    </div>
  );
}
