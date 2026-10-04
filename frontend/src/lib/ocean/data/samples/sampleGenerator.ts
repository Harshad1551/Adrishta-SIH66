/**
 * OceanEmbed — Training Sample Generator
 * Synthesizes (X = 7 Surface Channels, Y = 15 GLORYS Target Depths)
 */

import { snapToGrid, regionOf } from "../../grid";
import { DATASET_CONFIG, VERSION_CONFIG } from "../../config";
import type { DataMode, TrainingSample } from "../types";
import { fetchSST } from "../adapters/sst";
import { fetchSSS } from "../adapters/sss";
import { fetchSSH } from "../adapters/ssh";
import { fetchCurrents } from "../adapters/currents";
import { fetchWinds } from "../adapters/winds";
import { fetchGLORYS } from "../adapters/glorys";
import { harmonizeSurfaceChannels } from "../harmonization/harmonize";

export async function generateTrainingSample(
  lat: number,
  lon: number,
  date: string,
  mode: DataMode = "mock",
): Promise<TrainingSample> {
  const snapped = snapToGrid(lat, lon);

  // Fetch 7 surface channels asynchronously
  const [sstData, sssData, sshData, currentsData, windsData, glorysData] = await Promise.all([
    fetchSST(snapped.lat, snapped.lon, date, mode),
    fetchSSS(snapped.lat, snapped.lon, date, mode),
    fetchSSH(snapped.lat, snapped.lon, date, mode),
    fetchCurrents(snapped.lat, snapped.lon, date, mode),
    fetchWinds(snapped.lat, snapped.lon, date, mode),
    fetchGLORYS(snapped.lat, snapped.lon, date, mode),
  ]);

  const X = harmonizeSurfaceChannels(
    date,
    snapped.lat,
    snapped.lon,
    {
      sst: sstData.value,
      sss: sssData.value,
      ssh: sshData.value,
      current_u: currentsData.u.value,
      current_v: currentsData.v.value,
      wind_u: windsData.u.value,
      wind_v: windsData.v.value,
    },
    mode === "mock",
  );

  const Y = {
    depths: glorysData.depths,
    temperatures: glorysData.temperatures,
  };

  const validMask = X.overallQuality !== "CRITICAL_MISSING";

  return {
    id: `sample_${date}_${snapped.lat.toFixed(2)}N_${snapped.lon.toFixed(2)}E`,
    date,
    lat: snapped.lat,
    lon: snapped.lon,
    region: regionOf(snapped.lat, snapped.lon),
    X,
    Y,
    validMask,
    metadata: {
      targetSource: DATASET_CONFIG.glorys.name,
      targetVersion: VERSION_CONFIG.modelVersion,
      generationTimestamp: new Date().toISOString(),
      isSynthetic: mode === "mock",
    },
  };
}
