/**
 * OceanEmbed Data Adapter — Surface Neutral Winds (U and V components at 10m)
 * Primary Provider: ASCAT / CCMP Cross-Calibrated Multi-Platform Winds
 */

import { DATASET_CONFIG } from "../../config";
import type { DataMode, SurfaceDatasetSample } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

export async function fetchWinds(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<{ u: SurfaceDatasetSample; v: SurfaceDatasetSample }> {
  const configU = DATASET_CONFIG.wind_u;
  const configV = DATASET_CONFIG.wind_v;

  if (mode === "real") {
    throw new Error(
      `Real data connection for ${configU.name} is not yet initialized. Configure REAL_DATA_API_URL or use mock mode.`,
    );
  }

  // Southwest vs Northeast Monsoon seasonal wind vectors
  const doy = getDayOfYear(date);
  const isSummerMonsoon = doy >= 150 && doy <= 270;
  const meanU = isSummerMonsoon ? 6.5 : -3.2;
  const meanV = isSummerMonsoon ? 4.8 : -2.1;
  const gustNoise = (Math.sin(lat * 8.5 + lon * 11.2) - 0.5) * 2.4;

  const uVal = +(meanU + gustNoise).toFixed(2);
  const vVal = +(meanV + gustNoise * 0.8).toFixed(2);

  return {
    u: {
      variable: "wind_u",
      variableName: configU.variable,
      timestamp: `${date}T00:00:00Z`,
      lat,
      lon,
      value: uVal,
      unit: configU.units,
      source: configU.name,
      version: configU.provider,
      qc: runChannelQC("wind_u", uVal, lat, lon),
      isSynthetic: true,
    },
    v: {
      variable: "wind_v",
      variableName: configV.variable,
      timestamp: `${date}T00:00:00Z`,
      lat,
      lon,
      value: vVal,
      unit: configV.units,
      source: configV.name,
      version: configV.provider,
      qc: runChannelQC("wind_v", vVal, lat, lon),
      isSynthetic: true,
    },
  };
}

function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}
