/**
 * OceanEmbed — Spatial & Temporal Harmonization Engine
 * Aligns raw multi-sensor feeds to a regular 0.25° × 0.25° grid at 00:00 UTC daily.
 */

import { snapToGrid } from "../../grid";
import type { ChannelId, SurfaceTensor } from "../types";
import { runChannelQC } from "../qc/qcPipeline";

/**
 * Normalization statistics (Mean and StdDev) for North Indian Ocean 7 channels
 * Derived from 2010–2020 climatological training baseline
 */
export const CHANNEL_NORM_STATS: Record<ChannelId, { mean: number; std: number }> = {
  sst: { mean: 28.45, std: 1.85 }, // °C
  sss: { mean: 34.8, std: 1.65 }, // PSU
  ssh: { mean: 0.02, std: 0.14 }, // m
  current_u: { mean: 0.04, std: 0.32 }, // m/s
  current_v: { mean: -0.02, std: 0.28 }, // m/s
  wind_u: { mean: 1.15, std: 4.8 }, // m/s
  wind_v: { mean: 0.65, std: 4.2 }, // m/s
};

/**
 * Harmonize 7 raw surface channels into a normalized model-ready SurfaceTensor
 */
export function harmonizeSurfaceChannels(
  date: string,
  rawLat: number,
  rawLon: number,
  rawValues: Partial<Record<ChannelId, number | null>>,
  isSynthetic = true,
): SurfaceTensor {
  const { lat, lon } = snapToGrid(rawLat, rawLon);

  const channelsList: ChannelId[] = [
    "sst",
    "sss",
    "ssh",
    "current_u",
    "current_v",
    "wind_u",
    "wind_v",
  ];

  const channels = {
    sst: rawValues.sst ?? CHANNEL_NORM_STATS.sst.mean,
    sss: rawValues.sss ?? CHANNEL_NORM_STATS.sss.mean,
    ssh: rawValues.ssh ?? CHANNEL_NORM_STATS.ssh.mean,
    current_u: rawValues.current_u ?? CHANNEL_NORM_STATS.current_u.mean,
    current_v: rawValues.current_v ?? CHANNEL_NORM_STATS.current_v.mean,
    wind_u: rawValues.wind_u ?? CHANNEL_NORM_STATS.wind_u.mean,
    wind_v: rawValues.wind_v ?? CHANNEL_NORM_STATS.wind_v.mean,
  };

  const validMask: boolean[] = [];
  const normalizedVector: number[] = [];
  const missingChannels: ChannelId[] = [];

  for (const ch of channelsList) {
    const val = rawValues[ch];
    const qc = runChannelQC(ch, val, lat, lon);
    const isValid = qc.status === "PASS";
    validMask.push(isValid);

    if (!isValid) {
      missingChannels.push(ch);
    }

    const valueToNorm = val != null && Number.isFinite(val) ? val : CHANNEL_NORM_STATS[ch].mean;
    const zScore = (valueToNorm - CHANNEL_NORM_STATS[ch].mean) / CHANNEL_NORM_STATS[ch].std;
    normalizedVector.push(+zScore.toFixed(4));
  }

  const validCount = validMask.filter(Boolean).length;
  const overallQuality =
    validCount === 7 ? "HIGH" : validCount >= 5 ? "DEGRADED" : "CRITICAL_MISSING";

  return {
    date,
    lat,
    lon,
    channels,
    normalizedVector,
    validMask,
    overallQuality,
    missingChannels,
    isSynthetic,
  };
}
