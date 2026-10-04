import { X, Info, Download, Layers, ShieldCheck, Cpu } from "lucide-react";
import { useOcean, fmtCoord } from "@/lib/ocean/state";
import { DEPTHS } from "@/lib/ocean/data";

export function ExplainabilityDrawer() {
  const { explainOpen, setExplainOpen, lat, lon, depth, date, dataMode, realProfileData, exportData } =
    useOcean();

  if (!explainOpen) return null;

  const depthIdx = DEPTHS.indexOf(depth as any);
  const temp =
    dataMode === "real" && realProfileData?.predicted_temperature
      ? realProfileData.predicted_temperature[depthIdx >= 0 ? depthIdx : 7]
      : null;
  const unc =
    dataMode === "real" && realProfileData?.uncertainty_degC
      ? realProfileData.uncertainty_degC[depthIdx >= 0 ? depthIdx : 7]
      : null;
  const tc =
    dataMode === "real" && realProfileData?.thermocline_depth_m
      ? realProfileData.thermocline_depth_m
      : null;
  const sInputs = realProfileData?.surface_inputs;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-popover shadow-2xl animate-in slide-in-from-right-10 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
              <Cpu className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-foreground">
                Model Information & Architecture
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Frozen OceanEmbedNet Specification & Feature Ingestion
              </p>
            </div>
          </div>
          <button
            onClick={() => setExplainOpen(false)}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close model information panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Target Query Context */}
          <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Target Prediction Profile
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Location: </span>
                <span className="font-mono font-medium text-foreground">{fmtCoord(lat, lon)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Active Depth: </span>
                <span className="font-mono font-medium text-primary">{depth} m</span>
              </div>
              <div>
                <span className="text-muted-foreground">Requested Date: </span>
                <span className="font-mono font-medium text-foreground">{date}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Reconstructed Temp: </span>
                <span className="font-mono font-semibold text-primary">
                  {temp !== null ? `${temp.toFixed(2)} °C` : "--"}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
              <span className="text-muted-foreground">
                Thermocline Depth: {tc !== null ? `${tc} m` : "--"}
              </span>
              <span className="text-teal font-medium">
                Prediction Uncertainty: {unc !== null ? `±${unc.toFixed(2)} °C` : "--"}
              </span>
            </div>
          </div>

          {/* Genuine 7 Surface Satellite Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Ingested Satellite Surface Observations (7 Channels)
              </h3>
              <span className="text-[10px] font-mono text-teal">Real In-Situ / Remote</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border/70 bg-card p-2.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">Sea Surface Temperature (SST)</div>
                <div className="font-mono font-bold text-foreground">
                  {sInputs?.sst !== undefined ? `${sInputs.sst.toFixed(2)} °C` : "--"}
                </div>
                <div className="text-[9px] text-muted-foreground/80">NOAA OISST / OSTIA L4</div>
              </div>

              <div className="rounded border border-border/70 bg-card p-2.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">Sea Surface Salinity (SSS)</div>
                <div className="font-mono font-bold text-foreground">
                  {sInputs?.sss !== undefined ? `${sInputs.sss.toFixed(2)} PSU` : "--"}
                </div>
                <div className="text-[9px] text-muted-foreground/80">SMAP / SMOS L4 Gridded</div>
              </div>

              <div className="rounded border border-border/70 bg-card p-2.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">Sea Surface Height (SSH / SLA)</div>
                <div className="font-mono font-bold text-foreground">
                  {sInputs?.ssh !== undefined ? `${sInputs.ssh > 0 ? "+" : ""}${sInputs.ssh.toFixed(3)} m` : "--"}
                </div>
                <div className="text-[9px] text-muted-foreground/80">Copernicus DUACS Altimetry</div>
              </div>

              <div className="rounded border border-border/70 bg-card p-2.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">Surface Geostrophic Currents (U, V)</div>
                <div className="font-mono font-bold text-foreground">
                  {sInputs?.current_u !== undefined && sInputs?.current_v !== undefined
                    ? `${sInputs.current_u.toFixed(2)}, ${sInputs.current_v.toFixed(2)} m/s`
                    : "--"}
                </div>
                <div className="text-[9px] text-muted-foreground/80">OSCAR Multi-Satellite Ocean Currents</div>
              </div>

              <div className="col-span-2 rounded border border-border/70 bg-card p-2.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">10 m Ocean Wind Stress Vectors (U, V)</div>
                <div className="font-mono font-bold text-foreground">
                  {sInputs?.wind_u !== undefined && sInputs?.wind_v !== undefined
                    ? `${sInputs.wind_u.toFixed(2)}, ${sInputs.wind_v.toFixed(2)} m/s`
                    : "--"}
                </div>
                <div className="text-[9px] text-muted-foreground/80">CCMP Cross-Calibrated Multi-Platform Winds</div>
              </div>
            </div>
          </div>

          {/* Model Architectural Pipeline */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" />
              11-Channel Feature Representation & Architecture
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-primary shrink-0">1.</span>
                <span>
                  <strong className="text-foreground">11-D Input Vector:</strong> Comprises 7 surface satellite channels, 2 spatial coordinates (lat, lon), and 2 cyclical temporal features (sin DOY, cos DOY).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-primary shrink-0">2.</span>
                <span>
                  <strong className="text-foreground">Audited Normalization:</strong> Zero-mean unit-variance transformation using multi-year statistics (<code className="font-mono text-[11px] text-foreground">norm_stats_multiyear.json</code>).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-primary shrink-0">3.</span>
                <span>
                  <strong className="text-foreground">256-D Latent Embedding:</strong> Encodes coupled air-sea dynamical states into a compact ocean embedding space.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-mono font-bold text-primary shrink-0">4.</span>
                <span>
                  <strong className="text-foreground">Physics-Constrained Decoder:</strong> Regularized by vertical stratification loss penalties (&part;T/&part;z &le; 0) enforcing hydrostatic stability across all 15 discrete depth tiers.
                </span>
              </div>
            </div>
          </div>

          {/* Scientific Disclaimer */}
          <div className="rounded-lg border border-border bg-card p-3.5 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-teal shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground block mb-0.5">
                Scientific Interpretability & Governance Notice
              </strong>
              Empirical weights are not fabricated. Inferences are executed deterministically by the frozen PyTorch checkpoint (<code className="font-mono text-[10px] text-teal">oceanembed_multiyear_physics.pt</code>). Feature attribution describes input feature projection; it does not claim unverified causal mechanisms.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between text-xs bg-muted/20">
          <button
            onClick={() => exportData(`oceanembed_model_spec_${date}.csv`, "CSV Profile")}
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-medium text-foreground hover:bg-muted transition-colors text-xs"
            title="Export model input and output specifications"
          >
            <Download className="h-3.5 w-3.5" />
            Export Spec
          </button>
          <button
            onClick={() => setExplainOpen(false)}
            className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
