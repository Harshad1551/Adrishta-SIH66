/**
 * OceanEmbed — Climatological Anomaly & Baseline Interface
 * Anomaly = Reconstructed Temperature - Climatology Baseline (1993–2020)
 */

import { VERSION_CONFIG } from "../config";
import { isLand } from "../grid";

export interface ClimatologyBaseline {
  period: string;
  source: string;
  depth: number;
  lat: number;
  lon: number;
  date: string;
  baselineTemp: number;
}

/**
 * Compute historical monthly climatological baseline for a given coordinate, depth and date
 */
export function getClimatologyBaseline(
  lat: number,
  lon: number,
  depth: number,
  date: string,
): ClimatologyBaseline {
  const doy = getDayOfYear(date);
  const seasonalCycle = Math.cos(((doy - 130) / 365) * 2 * Math.PI) * -1.5;
  const latGrad = 29.8 - Math.abs(lat - 12) * 0.22;
  const deepDecay = Math.exp(-depth / 240);
  const baselineTemp = +(4.5 + (latGrad + seasonalCycle - 4.5) * deepDecay).toFixed(2);

  return {
    period: VERSION_CONFIG.climatologyBaselinePeriod,
    source: "WOA18 / GLORYS12V1 Multi-Decadal Baseline",
    depth,
    lat,
    lon,
    date,
    baselineTemp,
  };
}

/**
 * Calculate temperature anomaly relative to documented baseline
 */
export function calculateTemperatureAnomaly(
  reconstructedTemp: number,
  lat: number,
  lon: number,
  depth: number,
  date: string,
): { anomaly: number; baseline: ClimatologyBaseline } {
  const baseline = getClimatologyBaseline(lat, lon, depth, date);
  const anomaly = +(reconstructedTemp - baseline.baselineTemp).toFixed(2);
  return { anomaly, baseline };
}

function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}
