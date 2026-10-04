import { useState } from "react";
import {
  Database,
  Cpu,
  ShieldCheck,
  Radar,
  MessageSquare,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

export type ArchLayer = {
  id: number;
  name: string;
  subtitle: string;
  icon: typeof Database;
  tag: string;
  color: string;
  components: string[];
  purpose: string;
  technicalDetails: string;
};

const LAYERS: ArchLayer[] = [
  {
    id: 1,
    name: "DATA FOUNDATION",
    subtitle: "Harmonization & Gridding",
    icon: Database,
    tag: "L1 Input Stage",
    color: "var(--cyan)",
    components: [
      "Satellite Ingestion (SST, SSS, SSH, Wind, Current)",
      "Automated QC & Flagging Filters",
      "0.25° × 0.25° Regular Mesh Regridding",
      "Daily Temporal Colocation & Alignment",
      "Channel Normalization & Missing Data Inpainting",
    ],
    purpose:
      "Harmonize heterogeneous multi-sensor satellite swaths into a continuous spatio-temporal tensor for the North Indian Ocean basin.",
    technicalDetails:
      "Inputs from OSTIA (L4 SST), SMAP/SMOS (SSS), CMEMS DUACS (SSH/SLA), OSCAR (currents), and ASCAT (winds) are aligned at 00:00 UTC daily.",
  },
  {
    id: 2,
    name: "LEARNING CORE",
    subtitle: "Ocean Embedding & Physics Decoder",
    icon: Cpu,
    tag: "L2 Deep Learning",
    color: "var(--teal)",
    components: [
      "Convolutional / Transformer Spatial Encoder",
      "256-Dimensional Latent Ocean Embedding Vector",
      "Physics-Constrained Reconstruction Decoder",
      "Dynamic Loss Function: L_data + λ·L_physics",
      "15-Tier Vertical Temperature Regressor",
    ],
    purpose:
      "Translate 2D surface expression into 3D subsurface thermal fields constrained by hydrostatic stability and density stratification laws.",
    technicalDetails:
      "The loss penalizes negative vertical gradients (convective overturning) and excessive mixed-layer heat divergence via λ=0.35 weight.",
  },
  {
    id: 3,
    name: "SCIENTIFIC TRUST",
    subtitle: "Validation & Uncertainty Quantification",
    icon: ShieldCheck,
    tag: "L3 Verification",
    color: "var(--aqua)",
    components: [
      "Independent ARGO Profile Matchups (WMO Floats)",
      "Epistemic & Aleatoric Uncertainty Mapping",
      "Stratified Performance Metrics (RMSE, MAE, Bias)",
      "Strict Temporal Distinction (Reconstruction vs ARGO)",
      "Model Provenance & Lineage Logging",
    ],
    purpose:
      "Provide rigorous ground-truth validation against in-situ profiling floats without data leakage, offering calibrated confidence bounds per voxel.",
    technicalDetails:
      "Validated against 18,426 ARGO profiles across 2010–2025; mean basin RMSE is 0.42 °C with 0.972 Pearson correlation.",
  },
  {
    id: 4,
    name: "OCEAN INTELLIGENCE",
    subtitle: "Anomaly, Thermocline & Gap Analytics",
    icon: Radar,
    tag: "L4 Analytics",
    color: "var(--warm)",
    components: [
      "Marine Heatwave (MHW) Severity Tracker (Hobday et al.)",
      "Climatological Anomaly Computation (1993–2020 Baseline)",
      "Thermocline Depth & Gradient Detector (dT/dz max)",
      "Observation Gap Prioritization Engine",
      "Arabian Sea vs Bay of Bengal Regional Matrix",
    ],
    purpose:
      "Detect extreme ocean thermal anomalies, subsurface heat storage, and guide optimal targeted deployment of autonomous sensors.",
    technicalDetails:
      "Gap priority synthesizes reconstruction uncertainty (55%), float sparsity (40%), and horizontal temperature gradients (5%).",
  },
  {
    id: 5,
    name: "CONTEXT & INTERACTION",
    subtitle: "Explainability, 3D & Natural Language",
    icon: MessageSquare,
    tag: "L5 User Experience",
    color: "var(--hot)",
    components: [
      "Integrated Climate & Monsoon Context Synthesizer",
      "Feature Attribution Drawer ('Why this prediction?')",
      "Interactive 3D Subsurface Volume & Isotherm Slices",
      "Natural Language Ocean AI Assistant (NLP Query)",
      "Multi-Format Scientific Export (NetCDF, CSV, GeoJSON)",
    ],
    purpose:
      "Deliver an intuitive, scientifically transparent workspace for oceanographers, climate scientists, and defense meteorologists.",
    technicalDetails:
      "Attribution uses integrated gradients across 7 input channels; NLP converts natural language into structured spatial queries.",
  },
];

export function ArchitectureDiagram() {
  const [activeLayer, setActiveLayer] = useState<ArchLayer>(LAYERS[1]); // Default to Learning Core

  return (
    <div className="space-y-4">
      {/* 5 Layer Horizontal / Vertical Stack */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
        {LAYERS.map((layer) => {
          const isSelected = activeLayer.id === layer.id;
          const Icon = layer.icon;
          return (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer)}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-lg"
                  : "border-border bg-card/60 hover:bg-muted/40 hover:border-border/80"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md text-xs font-mono font-bold"
                  style={{ backgroundColor: `${layer.color}20`, color: layer.color }}
                >
                  {layer.id}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                  {layer.tag}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: layer.color }} />
                <span>{layer.name}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {layer.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Layer Inspector */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-in fade-in-50 duration-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg border"
              style={{
                borderColor: `${activeLayer.color}50`,
                backgroundColor: `${activeLayer.color}15`,
                color: activeLayer.color,
              }}
            >
              <activeLayer.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold text-foreground">
                  Layer {activeLayer.id}: {activeLayer.name}
                </h3>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {activeLayer.tag}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{activeLayer.subtitle}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Status: <span className="text-teal font-semibold">Active & Operational</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Core Subsystems & Modules
            </div>
            <ul className="space-y-1.5">
              {activeLayer.components.map((c, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-foreground bg-muted/20 rounded p-2 border border-border/40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3.5 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Layer Scientific Purpose
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{activeLayer.purpose}</p>
            </div>

            <div className="rounded-md border border-border/60 bg-surface/40 p-3.5 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">
                Technical Architecture Specification
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground font-mono">
                {activeLayer.technicalDetails}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
