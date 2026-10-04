/**
 * OceanEmbed Data Adapter — Sea Surface Salinity (SSS)
 * Primary Provider: SMAP / SMOS L4
 */

import { DATASET_CONFIG } from "../../config";
import type { DataMode, SurfaceDatasetSample } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

export async function fetchSSS(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<SurfaceDatasetSample> {
  const config = DATASET_CONFIG.sss;

  if (mode === "real") {
    throw new Error(
      `Real data connection for ${config.name} is not yet initialized. Configure REAL_DATA_API_URL or use mock mode.`,
    );
  }

  // Plausible deterministic SSS: Arabian Sea is saline (>35.5 PSU), Bay of Bengal is fresh (<33.0 PSU) due to Ganges/Brahmaputra runoff
  const basinGrad = lon < 78 ? 36.2 - (lat - 10) * 0.05 : 32.8 + (lat - 10) * 0.08;
  const hashVal = Math.sin(lat * 33.1 + lon * 77.3) * 43758.5453;
  const noise = (hashVal - Math.floor(hashVal) - 0.5) * 0.6;
  const sssValue = +(basinGrad + noise).toFixed(2);

  const qc = runChannelQC("sss", sssValue, lat, lon);

  return {
    variable: "sss",
    variableName: config.variable,
    timestamp: `${date}T00:00:00Z`,
    lat,
    lon,
    value: sssValue,
    unit: config.units,
    source: config.name,
    version: config.provider,
    qc,
    isSynthetic: true,
  };
}
