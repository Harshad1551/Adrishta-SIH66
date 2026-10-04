/**
 * OceanEmbed Data Adapter — Sea Surface Temperature (SST)
 * Primary Provider: OSTIA / Copernicus Marine (CMEMS)
 */

import { DATASET_CONFIG } from "../../config";
import type { DataMode, SurfaceDatasetSample } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

export async function fetchSST(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<SurfaceDatasetSample> {
  const config = DATASET_CONFIG.sst;

  if (mode === "real") {
    // REAL DATA INTEGRATION HOOK:
    // Replace with real CMEMS / OSTIA API or local raster fetch
    throw new Error(
      `Real data connection for ${config.name} is not yet initialized. Configure REAL_DATA_API_URL or use mock mode.`,
    );
  }

  // Plausible deterministic mock generation for NIO
  const doy = getDayOfYear(date);
  const seasonal = Math.cos(((doy - 130) / 365) * 2 * Math.PI) * -1.7;
  const latGrad = 30.4 - Math.abs(lat - 11) * 0.21;
  const bob = lon >= 78 ? 0.55 : -0.25;
  const upwelling = lat > 14 && lon < 60 ? -0.9 : 0;
  const noise = (pseudoHash(lon, lat, 1) - 0.5) * 1.6;
  const sstValue = +(latGrad + seasonal + bob + upwelling + noise).toFixed(2);

  const qc = runChannelQC("sst", sstValue, lat, lon);

  return {
    variable: "sst",
    variableName: config.variable,
    timestamp: `${date}T00:00:00Z`,
    lat,
    lon,
    value: sstValue,
    unit: config.units,
    source: config.name,
    version: config.provider,
    qc,
    isSynthetic: true,
  };
}

function getDayOfYear(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

function pseudoHash(x: number, y: number, z = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
