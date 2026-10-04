/**
 * OceanEmbed — Data Types & Adapter Interface Specifications
 */

import type { Depth, RegionId } from "../grid";

export type DataMode = "mock" | "real";

export type ChannelId = "sst" | "sss" | "ssh" | "current_u" | "current_v" | "wind_u" | "wind_v";

export interface QCFlagSummary {
  status: "PASS" | "FLAGGED" | "MISSING" | "INTERPOLATED";
  flagCode: number; // 0=good, 1=estimated, 2=suspect, 3=bad, 4=missing
  grossCheckPassed: boolean;
  nanCheckPassed: boolean;
  landCheckPassed: boolean;
  notes?: string;
}

export interface SurfaceDatasetSample {
  variable: ChannelId;
  variableName: string;
  timestamp: string;
  lat: number;
  lon: number;
  value: number;
  unit: string;
  source: string;
  version: string;
  qc: QCFlagSummary;
  isSynthetic: boolean;
}

export interface SurfaceTensor {
  date: string;
  lat: number;
  lon: number;
  channels: {
    sst: number;
    sss: number;
    ssh: number;
    current_u: number;
    current_v: number;
    wind_u: number;
    wind_v: number;
  };
  normalizedVector: number[]; // 7 standardized float values
  validMask: boolean[]; // 7 booleans indicating channel validity
  overallQuality: "HIGH" | "DEGRADED" | "CRITICAL_MISSING";
  missingChannels: ChannelId[];
  isSynthetic: boolean;
}

export interface ArgoProfile {
  wmoId: string;
  timestamp: string;
  lat: number;
  lon: number;
  cycleNumber: number;
  depths: number[]; // e.g. 0–1000m or 0–2000m
  temperatures: number[];
  salinities?: number[];
  qualityFlags: number[];
  source: string;
  isSynthetic: boolean;
}

export interface GlorysTargetProfile {
  timestamp: string;
  lat: number;
  lon: number;
  depths: Depth[];
  temperatures: number[];
  salinities?: number[];
  source: string;
  version: string;
  isSynthetic: boolean;
}

export interface TrainingSample {
  id: string;
  date: string;
  lat: number;
  lon: number;
  region: RegionId;
  X: SurfaceTensor; // 7 surface channels + QC
  Y: {
    depths: Depth[];
    temperatures: number[]; // 15 target temperatures from GLORYS
  };
  validMask: boolean;
  metadata: {
    targetSource: string;
    targetVersion: string;
    generationTimestamp: string;
    isSynthetic: boolean;
  };
}

export interface CollocatedMatchup {
  floatId: string;
  argoTimestamp: string;
  aiTimestamp: string;
  timeDeltaHours: number;
  distanceKm: number;
  lat: number;
  lon: number;
  collocationStatus: "SAME-DATE" | "NEAREST AVAILABLE" | "NO VALID MATCH";
  depths: Depth[];
  argoTemps: (number | null)[];
  predictedTemps: number[];
  uncertainties: number[];
  isSynthetic: boolean;
}
