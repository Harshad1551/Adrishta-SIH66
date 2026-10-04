/**
 * OceanEmbed Data Adapter — GLORYS12V1 Reanalysis Target Pathway
 * Role: TRAINING TARGET / REFERENCE ONLY (Supervised Model Loss)
 * Never present GLORYS as independent validation.
 */

import { DATASET_CONFIG } from "../../config";
import { GRID_CONFIG, type Depth } from "../../grid";
import type { DataMode, GlorysTargetProfile } from "../types";

export async function fetchGLORYS(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<GlorysTargetProfile> {
  const config = DATASET_CONFIG.glorys;

  if (mode === "real") {
    // REAL DATA INTEGRATION HOOK:
    // Query CMEMS GLORYS12V1 daily NetCDF reanalysis store
    throw new Error(
      `Real reanalysis connection for ${config.name} is not configured. Connect local GLORYS zarr/netcdf cache.`,
    );
  }

  // Generate plausible reference 15-depth profile from reanalysis physics
  const sst = 28.5 - Math.abs(lat - 12) * 0.2;
  const tcDepth = lon >= 78 ? 70 : 95;
  const deepTemp = 4.2;

  const temperatures = GRID_CONFIG.depths.map((d) => {
    if (d <= 30) return +(sst - d * 0.008).toFixed(2);
    if (d <= 200) {
      const k = 1 - Math.exp(-(d - 30) / (tcDepth * 1.1));
      return +(sst - (sst - 14.5) * Math.pow(k, 0.7)).toFixed(2);
    }
    // Deep ocean decay
    const deepDecay = 14.5 - ((d - 200) / 800) * (14.5 - deepTemp);
    return +Math.max(deepTemp, deepDecay).toFixed(2);
  });

  return {
    timestamp: `${date}T00:00:00Z`,
    lat,
    lon,
    depths: [...GRID_CONFIG.depths],
    temperatures,
    source: config.name,
    version: config.provider,
    isSynthetic: true,
  };
}
