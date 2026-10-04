/**
 * OceanEmbed Data Adapter — Surface Ocean Currents (U and V components)
 * Primary Provider: OSCAR / CMEMS Surface Geostrophic & Wind-Driven Currents
 */

import { DATASET_CONFIG } from "../../config";
import type { DataMode, SurfaceDatasetSample } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

export async function fetchCurrents(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<{ u: SurfaceDatasetSample; v: SurfaceDatasetSample }> {
  const configU = DATASET_CONFIG.current_u;
  const configV = DATASET_CONFIG.current_v;

  if (mode === "real") {
    throw new Error(
      `Real data connection for ${configU.name} is not yet initialized. Configure REAL_DATA_API_URL or use mock mode.`,
    );
  }

  // Western boundary currents (Somali current, East India Coastal Current)
  const isSomaliMargin = lon < 55 && lat < 15;
  const baseU = isSomaliMargin ? 0.8 : (Math.sin(lat * 14.1 + lon * 21.2) - 0.5) * 0.4;
  const baseV = isSomaliMargin ? 1.2 : (Math.cos(lat * 18.3 + lon * 19.4) - 0.5) * 0.4;

  const uVal = +baseU.toFixed(3);
  const vVal = +baseV.toFixed(3);

  return {
    u: {
      variable: "current_u",
      variableName: configU.variable,
      timestamp: `${date}T00:00:00Z`,
      lat,
      lon,
      value: uVal,
      unit: configU.units,
      source: configU.name,
      version: configU.provider,
      qc: runChannelQC("current_u", uVal, lat, lon),
      isSynthetic: true,
    },
    v: {
      variable: "current_v",
      variableName: configV.variable,
      timestamp: `${date}T00:00:00Z`,
      lat,
      lon,
      value: vVal,
      unit: configV.units,
      source: configV.name,
      version: configV.provider,
      qc: runChannelQC("current_v", vVal, lat, lon),
      isSynthetic: true,
    },
  };
}
