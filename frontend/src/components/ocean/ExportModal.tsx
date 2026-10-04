import { useState } from "react";
import {
  X,
  Download,
  FileSpreadsheet,
  Database,
  Layers,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { useOcean } from "@/lib/ocean/state";
import { VERSION_CONFIG } from "@/lib/ocean/config";
import { GRID_CONFIG } from "@/lib/ocean/grid";

export function ExportModal() {
  const { exportOpen, setExportOpen, exportData, date, depth, lat, lon } = useOcean();
  const [selectedFormat, setSelectedFormat] = useState<
    "pdf_profile" | "pdf_validation" | "netcdf" | "csv" | "profile" | "validation"
  >("pdf_profile");

  if (!exportOpen) return null;

  const handleExport = () => {
    switch (selectedFormat) {
      case "pdf_profile":
        exportData(
          `oceanembed_layer_${depth}m_${lat.toFixed(1)}N_${lon.toFixed(1)}E_${date}.pdf`,
          "PDF Profile",
        );
        break;
      case "pdf_validation":
        exportData(`oceanembed_argo_validation_dossier_${date}.pdf`, "PDF Validation");
        break;
      case "netcdf":
        exportData(`oceanembed_grid_${date}_${depth}m_15depth.nc`, "NetCDF-4");
        break;
      case "csv":
        exportData(`oceanembed_field_${date}_${depth}m.csv`, "CSV");
        break;
      case "profile":
        exportData(`oceanembed_vertical_profile_${date}.csv`, "CSV Profile");
        break;
      case "validation":
        exportData(`oceanembed_argo_validation_metrics.csv`, "CSV Table");
        break;
    }
    setExportOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 p-4">
      <div className="relative w-full max-w-xl rounded-lg border border-border bg-popover shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-foreground">
                Export Scientific Data Package
              </h2>
              <p className="text-xs text-muted-foreground">
                OceanEmbed North Indian Ocean Subsurface Intelligence (0.25° PDF / CSV / NetCDF)
              </p>
            </div>
          </div>
          <button
            onClick={() => setExportOpen(false)}
            className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Format selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Data Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: "pdf_profile",
                  title: `Selected Depth (${depth} m) & Profile PDF`,
                  desc: `Publication-grade vertical profile graph with focused scientific explanation for the ${depth} m layer`,
                  icon: FileText,
                },
                {
                  id: "pdf_validation",
                  title: "Validation PDF Dossier",
                  desc: "5-Model baseline comparisons & independent ARGO matchups",
                  icon: FileText,
                },
                {
                  id: "netcdf",
                  title: "NetCDF-4 (.nc)",
                  desc: "15-depth multidimensional raster grid (CF-1.8 compliant)",
                  icon: Database,
                },
                {
                  id: "csv",
                  title: "Grid CSV (.csv)",
                  desc: `0.25° × 0.25° spatial matrix at ${depth} m`,
                  icon: FileSpreadsheet,
                },
                {
                  id: "profile",
                  title: "Profile Data (.csv)",
                  desc: "Depth vs Temperature with ARGO & uncertainty band",
                  icon: Layers,
                },
                {
                  id: "validation",
                  title: "Validation Table (.csv)",
                  desc: "Comprehensive ARGO vs Model RMSE, MAE, Bias tables",
                  icon: CheckCircle2,
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setSelectedFormat(
                      opt.id as
                        | "pdf_profile"
                        | "pdf_validation"
                        | "netcdf"
                        | "csv"
                        | "profile"
                        | "validation",
                    )
                  }
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    selectedFormat === opt.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40 text-foreground"
                      : "border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <opt.icon
                    className={`h-4 w-4 shrink-0 mt-0.5 ${selectedFormat === opt.id ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">{opt.title}</div>
                    <div className="text-[11px] leading-snug text-muted-foreground mt-0.5">
                      {opt.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Metadata preview */}
          <div className="rounded-md border border-border bg-muted/30 p-3.5 space-y-2 text-xs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Dataset Metadata & Provenance Headers
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-muted-foreground">
              <div>
                Domain:{" "}
                <span className="font-mono text-foreground">
                  {GRID_CONFIG.latMin}°N–{GRID_CONFIG.latMax}°N, {GRID_CONFIG.lonMin}°E–
                  {GRID_CONFIG.lonMax}°E
                </span>
              </div>
              <div>
                Grid:{" "}
                <span className="font-mono text-foreground">
                  {GRID_CONFIG.resolution}° × {GRID_CONFIG.resolution}° (~27 km)
                </span>
              </div>
              <div>
                Vertical Levels:{" "}
                <span className="font-mono text-foreground">
                  {GRID_CONFIG.depths.length} Depths (0–1000 m)
                </span>
              </div>
              <div>
                Timestamp: <span className="font-mono text-foreground">{date}</span>
              </div>
              <div>
                Model:{" "}
                <span className="font-mono text-foreground">{VERSION_CONFIG.modelVersion}</span>
              </div>
              <div>
                Target Baseline:{" "}
                <span className="font-mono text-foreground">GLORYS12V1 / ARGO Validated</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground italic">
            * Triggering export compiles and generates the genuine downloadable file with embedded
            metadata headers.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3 bg-muted/20">
          <button
            type="button"
            onClick={() => setExportOpen(false)}
            className="rounded border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Download Package
          </button>
        </div>
      </div>
    </div>
  );
}
