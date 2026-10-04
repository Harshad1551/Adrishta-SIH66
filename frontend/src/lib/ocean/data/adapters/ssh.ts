/**
 * OceanEmbed Data Adapter — Sea Surface Height Anomaly (SSH / SLA)
 * Primary Provider: CMEMS DUACS Multi-Mission Altimeter
 */

import { DATASET_CONFIG } from "../../config";
import type { DataMode, SurfaceDatasetSample } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

export async function fetchSSH(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<SurfaceDatasetSample> {
  const config = DATASET_CONFIG.ssh;

  if (mode === "real") {
    throw new Error(
      `Real data connection for ${config.name} is not yet initialized. Configure REAL_DATA_API_URL or use mock mode.`,
    );
  }

  // Plausible SLA: mesoscale eddies and Rossby waves
  const k = Math.sin(lat * 12.3 + lon * 45.7) * 43758.5453;
  const eddySignal = (k - Math.floor(k) - 0.5) * 0.28;
  const sshValue = +eddySignal.toFixed(3);

  const qc = runChannelQC("ssh", sshValue, lat, lon);

  return {
    variable: "ssh",
    variableName: config.variable,
    timestamp: `${date}T00:00:00Z`,
    lat,
    lon,
    value: sshValue,
    unit: config.units,
    source: config.name,
    version: config.provider,
    qc,
    isSynthetic: true,
  };
}
