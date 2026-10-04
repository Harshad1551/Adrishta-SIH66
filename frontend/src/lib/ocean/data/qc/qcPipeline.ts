/**
 * OceanEmbed — Quality Control (QC) & Physical Plausibility Pipeline
 */

import type { ChannelId, QCFlagSummary } from "../types";
import { isLand } from "../../grid";

export interface PhysicalBounds {
  min: number;
  max: number;
  unit: string;
  defaultFallback: number;
}

export const PHYSICAL_BOUNDS: Record<ChannelId, PhysicalBounds> = {
  sst: { min: -2.0, max: 36.0, unit: "°C", defaultFallback: 28.0 },
  sss: { min: 20.0, max: 42.0, unit: "PSU", defaultFallback: 35.0 },
  ssh: { min: -2.5, max: 2.5, unit: "m", defaultFallback: 0.0 },
  current_u: { min: -4.0, max: 4.0, unit: "m s⁻¹", defaultFallback: 0.0 },
  current_v: { min: -4.0, max: 4.0, unit: "m s⁻¹", defaultFallback: 0.0 },
  wind_u: { min: -50.0, max: 50.0, unit: "m s⁻¹", defaultFallback: 0.0 },
  wind_v: { min: -50.0, max: 50.0, unit: "m s⁻¹", defaultFallback: 0.0 },
};

/**
 * Run comprehensive QC checks on a single observation channel
 */
export function runChannelQC(
  channel: ChannelId,
  value: number | null | undefined,
  lat: number,
  lon: number,
): QCFlagSummary {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return {
      status: "MISSING",
      flagCode: 4,
      grossCheckPassed: false,
      nanCheckPassed: false,
      landCheckPassed: !isLand(lat, lon),
      notes: "Observation is null, NaN or missing from sensor stream",
    };
  }

  const bounds = PHYSICAL_BOUNDS[channel];
  const nanCheckPassed = !Number.isNaN(value) && Number.isFinite(value);
  const grossCheckPassed = nanCheckPassed && value >= bounds.min && value <= bounds.max;
  const landCheckPassed = !isLand(lat, lon);

  if (!landCheckPassed) {
    return {
      status: "FLAGGED",
      flagCode: 3,
      grossCheckPassed,
      nanCheckPassed,
      landCheckPassed: false,
      notes: "Sample coordinate intersects land or coastal mask",
    };
  }

  if (!grossCheckPassed) {
    return {
      status: "FLAGGED",
      flagCode: 3,
      grossCheckPassed: false,
      nanCheckPassed,
      landCheckPassed: true,
      notes: `Value ${value} exceeds physical bounds [${bounds.min}, ${bounds.max}] ${bounds.unit}`,
    };
  }

  return {
    status: "PASS",
    flagCode: 0,
    grossCheckPassed: true,
    nanCheckPassed: true,
    landCheckPassed: true,
    notes: "Passed all physical range, coordinate, and validity checks",
  };
}

/**
 * Standardize and sanitize channel values with QC metadata tracking
 */
export function sanitizeChannelValue(
  channel: ChannelId,
  value: number | null | undefined,
  lat: number,
  lon: number,
): { sanitizedValue: number; qc: QCFlagSummary } {
  const qc = runChannelQC(channel, value, lat, lon);
  if (qc.status === "PASS") {
    return { sanitizedValue: value as number, qc };
  }
  const bounds = PHYSICAL_BOUNDS[channel];
  return {
    sanitizedValue: bounds.defaultFallback,
    qc,
  };
}
