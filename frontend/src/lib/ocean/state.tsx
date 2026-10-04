import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DEPTHS,
  RECONSTRUCTION_DATE,
  regionOf,
  profileAt,
  type Depth,
  type RegionId,
  type VariableId,
  type ProfilePoint,
} from "./data";
import type { DataMode, ChannelId } from "./data/types";
import { fetchRealProfile, type RealProfileResponse } from "./api";
import {
  exportNetCDF4Grid,
  exportProfileCSV,
  exportGridSliceCSV,
  exportValidationCSV,
  exportAttributionCSV,
  exportEventsCSV,
  exportObservationGapsCSV,
  exportProvenanceCSV,
  triggerFileDownload,
} from "./export/exportService";
import {
  exportExplanationPDF,
  exportProfileReportPDF,
  exportValidationReportPDF,
  exportIntelligenceReportPDF,
  exportProvenancePDF,
} from "./export/pdfReportService";

export type ValidationMode =
  | "LIVE / LATEST AVAILABLE"
  | "RETROSPECTIVE VALIDATION"
  | "SAME-DATE VALIDATION"
  | "LATEST-AVAILABLE COMPARISON";

type OceanState = {
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  date: string;
  setDate: (d: string) => void;
  depth: Depth;
  setDepth: (d: Depth) => void;
  variable: VariableId;
  setVariable: (v: VariableId) => void;
  region: RegionId;
  setRegion: (r: RegionId) => void;
  lat: number;
  lon: number;
  setLocation: (lat: number, lon: number) => void;
  locationRegion: RegionId;
  activeProfile: ProfilePoint[];
  isLoadingRealProfile: boolean;
  realProfileData: RealProfileResponse | null;
  explainOpen: boolean;
  setExplainOpen: (open: boolean) => void;
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
  validationMode: ValidationMode;
  setValidationMode: (m: ValidationMode) => void;
  selectedEventId: string;
  setSelectedEventId: (id: string) => void;
  selectedBaselineId: string;
  setSelectedBaselineId: (id: string) => void;
  simulatedMissingChannel: ChannelId | "none";
  setSimulatedMissingChannel: (ch: ChannelId | "none") => void;
  exportData: (filename: string, format: string) => void;
};

const Ctx = createContext<OceanState | null>(null);

export function OceanProvider({ children }: { children: ReactNode }) {
  const [dataMode, setDataModeState] = useState<DataMode>("real");
  const [date, setDate] = useState(RECONSTRUCTION_DATE);
  const [depth, setDepth] = useState<Depth>(DEPTHS[0]); // 0m (surface – highest accuracy)
  const [variable, setVariable] = useState<VariableId>("temp");
  const [region, setRegion] = useState<RegionId>("North Indian Ocean");
  const [loc, setLoc] = useState({ lat: 15.25, lon: 65.25 });
  const [realProfileData, setRealProfileData] = useState<RealProfileResponse | null>(null);
  const [isLoadingRealProfile, setIsLoadingRealProfile] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [validationMode, setValidationMode] = useState<ValidationMode>("LIVE / LATEST AVAILABLE");
  const [selectedEventId, setSelectedEventId] = useState("mhw-2026-07");
  const [selectedBaselineId, setSelectedBaselineId] = useState("oceanembed_physics_constrained");
  const [simulatedMissingChannel, setSimulatedMissingChannel] = useState<ChannelId | "none">(
    "none",
  );

  // Fetch real profile when in real data mode
  useEffect(() => {
    if (dataMode !== "real") {
      setRealProfileData(null);
      return;
    }
    let mounted = true;
    const fetchProfile = async () => {
      setIsLoadingRealProfile(true);
      try {
        const data = await fetchRealProfile(loc.lat, loc.lon, date);
        if (mounted) {
          setRealProfileData(data);
          toast.success(`FastAPI Live Profile: ${loc.lat}Â°N, ${loc.lon}Â°E`, {
            description: `Reconstructed 15 standard depths via ${data.version || "OceanEmbed"}`,
            duration: 3000,
          });
        }
      } catch (err) {
        if (mounted) {
          setRealProfileData(null);
          toast.error("REAL DATA UNAVAILABLE", {
            description: "FastAPI scientific backend is unreachable. Fail-closed: refusing synthetic fallback.",
          });
        }
      } finally {
        if (mounted) setIsLoadingRealProfile(false);
      }
    };
    fetchProfile();
    return () => {
      mounted = false;
    };
  }, [dataMode, loc.lat, loc.lon, date]);

  // Compute active profile (Real FastAPI data when available, mock otherwise)
  const activeProfile = useMemo<ProfilePoint[]>(() => {
    if (dataMode === "real" && realProfileData && realProfileData.temperature?.length === DEPTHS.length) {
      return DEPTHS.map((d, i) => {
        const t = realProfileData.temperature[i];
        const u = realProfileData.uncertainty[i] ?? 0.25;
        return {
          depth: d,
          temp: +t.toFixed(2),
          lo: +(t - u).toFixed(2),
          hi: +(t + u).toFixed(2),
          band: [+(t - u).toFixed(2), +(t + u).toFixed(2)] as [number, number],
          argo: null, // Strictly real data in REAL MODE: no synthetic ARGO values
        };
      });
    }
    if (dataMode === "real") {
      // In REAL mode: NEVER fall back to synthetic profileAt
      return [];
    }
    return profileAt(loc.lat, loc.lon, date);
  }, [dataMode, realProfileData, loc.lat, loc.lon, date]);

  const setDataMode = useCallback((mode: DataMode) => {
    setDataModeState(mode);
    if (mode === "real") {
      toast.info("REAL DATA MODE Activated", {
        description:
          "Strict operational data flow: Master Zarr -> Frozen OceanEmbed -> Live FastAPI.",
      });
    } else {
      toast.warning("DEMO DATA MODE Activated", {
        description:
          "Using isolated offline simulation for standalone demonstration.",
      });
    }
  }, []);

  const exportData = useCallback(
    (filename: string, format: string) => {
      // PDF Exports
      if (format.toLowerCase().includes("pdf")) {
        if (format.toLowerCase().includes("explain") || filename.includes("explanation")) {
          exportExplanationPDF(loc.lat, loc.lon, depth, date);
        } else if (
          format.toLowerCase().includes("profile") ||
          filename.includes("profile") ||
          format.toLowerCase().includes("layer") ||
          filename.includes("layer")
        ) {
          exportProfileReportPDF(
            loc.lat,
            loc.lon,
            date,
            depth,
            dataMode === "real" && realProfileData
              ? {
                  temps: realProfileData.predicted_temperature,
                  uncs: realProfileData.uncertainty_degC,
                  thermoclineM: realProfileData.thermocline_depth_m,
                  density: realProfileData.potential_density,
                  soundSpeed: realProfileData.sound_speed,
                  matchedSnapshot: realProfileData.matched_snapshot_date,
                  deltaHours: realProfileData.delta_hours,
                }
              : undefined,
          );
        } else if (format.toLowerCase().includes("valid") || filename.includes("validation")) {
          exportValidationReportPDF(date);
        } else if (
          format.toLowerCase().includes("intell") ||
          filename.includes("intelligence") ||
          filename.includes("dossier")
        ) {
          exportIntelligenceReportPDF(date);
        } else if (
          format.toLowerCase().includes("prov") ||
          filename.includes("provenance") ||
          filename.includes("lineage")
        ) {
          exportProvenancePDF();
        } else {
          exportProfileReportPDF(
            loc.lat,
            loc.lon,
            date,
            depth,
            dataMode === "real" && realProfileData
              ? {
                  temps: realProfileData.predicted_temperature,
                  uncs: realProfileData.uncertainty_degC,
                  thermoclineM: realProfileData.thermocline_depth_m,
                  density: realProfileData.potential_density,
                  soundSpeed: realProfileData.sound_speed,
                  matchedSnapshot: realProfileData.matched_snapshot_date,
                  deltaHours: realProfileData.delta_hours,
                }
              : undefined,
          );
        }

        toast.success(`Generated PDF: ${filename}`, {
          description: `Publication-ready scientific PDF report generated and downloaded.`,
          duration: 4000,
        });
        return;
      }

      // In REAL mode, fetch genuine scientific exports directly from the FastAPI backend
      if (dataMode === "real") {
        if (format.toLowerCase().includes("netcdf") || filename.endsWith(".nc")) {
          window.open(
            `${BACKEND_URL}/export/netcdf?lat=${loc.lat}&lon=${loc.lon}&date=${date}&model=physics`,
            "_blank",
          );
          toast.success(`Exporting Real NetCDF from FastAPI Backend`, {
            description: `Lat: ${loc.lat.toFixed(2)}Â°N, Lon: ${loc.lon.toFixed(2)}Â°E Â· Date: ${date} Â· CF-1.8 Compliant.`,
            duration: 4000,
          });
          return;
        } else if (filename.endsWith(".csv") || format.toLowerCase().includes("csv")) {
          window.open(
            `${BACKEND_URL}/export/csv?lat=${loc.lat}&lon=${loc.lon}&date=${date}&model=physics`,
            "_blank",
          );
          toast.success(`Exporting Real Profile CSV from FastAPI Backend`, {
            description: `Lat: ${loc.lat.toFixed(2)}Â°N, Lon: ${loc.lon.toFixed(2)}Â°E Â· Date: ${date} Â· 15 Depths.`,
            duration: 4000,
          });
          return;
        }
      }

      // NetCDF, CSV and GeoJSON Demo Exports
      let content = "";
      let mimeType = "text/plain";

      if (format.toLowerCase().includes("netcdf") || filename.endsWith(".nc")) {
        content = exportNetCDF4Grid(date, depth);
        mimeType = "application/x-netcdf";
      } else if (format.toLowerCase().includes("valid") || filename.includes("validation")) {
        content = exportValidationCSV(date);
        mimeType = "text/csv";
      } else if (
        format.toLowerCase().includes("attr") ||
        filename.includes("attribution") ||
        filename.includes("explain")
      ) {
        content = exportAttributionCSV(loc.lat, loc.lon, depth, date);
        mimeType = "text/csv";
      } else if (format.toLowerCase().includes("event") || filename.includes("events")) {
        content = exportEventsCSV();
        mimeType = "text/csv";
      } else if (format.toLowerCase().includes("gap") || filename.includes("observation")) {
        content = exportObservationGapsCSV(date);
        mimeType = "text/csv";
      } else if (format.toLowerCase().includes("prov") || filename.includes("provenance")) {
        content = exportProvenanceCSV();
        mimeType = "text/csv";
      } else if (format.toLowerCase().includes("profile") || filename.includes("profile")) {
        content = exportProfileCSV(loc.lat, loc.lon, date);
        mimeType = "text/csv";
      } else if (format.toLowerCase().includes("geojson") || filename.endsWith(".geojson")) {
        content = JSON.stringify(
          {
            type: "FeatureCollection",
            properties: { date, depth, domain: "North Indian Ocean (0.25 deg)" },
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [loc.lon, loc.lat] },
                properties: { depth, date, format },
              },
            ],
          },
          null,
          2,
        );
        mimeType = "application/geo+json";
      } else {
        content = exportGridSliceCSV(depth, date, 1.0);
        mimeType = "text/csv";
      }

      triggerFileDownload(content, filename, mimeType);

      toast.success(`Exported ${filename}`, {
        description: `Format: ${format.toUpperCase()} Â· Grid: 0.25Â° Ã— 0.25Â° Â· Date: ${date} Â· Downloaded real file with metadata.`,
        duration: 4000,
      });
    },
    [date, depth, loc],
  );

  const value = useMemo<OceanState>(
    () => ({
      dataMode,
      setDataMode,
      date,
      setDate,
      depth,
      setDepth,
      variable,
      setVariable,
      region,
      setRegion,
      lat: loc.lat,
      lon: loc.lon,
      setLocation: (lat: number, lon: number) =>
        setLoc({ lat: +lat.toFixed(2), lon: +lon.toFixed(2) }),
      locationRegion: regionOf(loc.lat, loc.lon),
      activeProfile,
      isLoadingRealProfile,
      realProfileData,
      explainOpen,
      setExplainOpen,
      exportOpen,
      setExportOpen,
      validationMode,
      setValidationMode,
      selectedEventId,
      setSelectedEventId,
      selectedBaselineId,
      setSelectedBaselineId,
      simulatedMissingChannel,
      setSimulatedMissingChannel,
      exportData,
    }),
    [
      dataMode,
      setDataMode,
      date,
      depth,
      variable,
      region,
      loc,
      activeProfile,
      isLoadingRealProfile,
      realProfileData,
      explainOpen,
      exportOpen,
      validationMode,
      selectedEventId,
      selectedBaselineId,
      simulatedMissingChannel,
      exportData,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOcean() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOcean must be used inside OceanProvider");
  return ctx;
}

export function fmtCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}Â°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}Â°${
    lon >= 0 ? "E" : "W"
  }`;
}
