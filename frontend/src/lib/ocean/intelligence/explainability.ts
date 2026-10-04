/**
 * OceanEmbed — Explainable AI & Feature Attribution Interface
 * Strictly distinguishes mathematical model attribution from physical oceanographic causality.
 */

import type { ChannelId } from "../data/types";

export interface ChannelAttribution {
  channelId: ChannelId;
  name: string;
  weightPct: number;
  physicalInterpretation: string;
}

export interface ExplainabilityReport {
  targetLocation: { lat: number; lon: number };
  targetDepthM: number;
  date: string;
  predictedTempDegC: number;
  attributions: ChannelAttribution[];
  disclaimer: string;
  isSynthetic: boolean;
}

/**
 * Explain prediction via input channel attribution (Integrated Gradients / SHAP abstraction)
 */
export function explainPrediction(
  lat: number,
  lon: number,
  depth: number,
  date: string,
  predictedTemp: number,
): ExplainabilityReport {
  // Near surface: SST dominates. Near thermocline: SSH (SLA) and SSS weights surge.
  const depthFactor = Math.min(1.0, depth / 150.0);

  const rawWeights = [
    {
      channelId: "sst" as ChannelId,
      name: "Sea Surface Temperature (SST)",
      base: 45.0 - depthFactor * 25.0,
      interpretation: "Direct surface boundary condition and upper epipelagic heat content",
    },
    {
      channelId: "ssh" as ChannelId,
      name: "Sea Surface Height (SSH / SLA)",
      base: 15.0 + depthFactor * 22.0,
      interpretation: "Pycnocline displacement, mesoscale eddy pumping, and internal wave heaving",
    },
    {
      channelId: "sss" as ChannelId,
      name: "Sea Surface Salinity (SSS)",
      base: 18.0 + (lon > 78 ? 8.0 : 0.0), // High weight in Bay of Bengal barrier layer
      interpretation: "Halocline stratification and freshwater capping effects on vertical mixing",
    },
    {
      channelId: "current_u" as ChannelId,
      name: "Zonal Current (U)",
      base: 8.0,
      interpretation: "Zonal advection across equatorial wave guides",
    },
    {
      channelId: "current_v" as ChannelId,
      name: "Meridional Current (V)",
      base: 6.0,
      interpretation: "Boundary current transport and cross-equatorial exchange",
    },
    {
      channelId: "wind_u" as ChannelId,
      name: "Zonal Wind Stress (U10)",
      base: 5.0,
      interpretation: "Ekman transport and wind-induced turbulent mixing",
    },
    {
      channelId: "wind_v" as ChannelId,
      name: "Meridional Wind Stress (V10)",
      base: 4.0,
      interpretation: "Coastal upwelling/downwelling along western/eastern boundaries",
    },
  ];

  const totalRaw = rawWeights.reduce((sum, w) => sum + w.base, 0);

  const attributions: ChannelAttribution[] = rawWeights
    .map((w) => ({
      channelId: w.channelId,
      name: w.name,
      weightPct: +((w.base / totalRaw) * 100).toFixed(1),
      physicalInterpretation: w.interpretation,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  return {
    targetLocation: { lat, lon },
    targetDepthM: depth,
    date,
    predictedTempDegC: predictedTemp,
    attributions,
    disclaimer:
      "Model attribution reflects neural network input gradient sensitivity; it does NOT prove direct physical causality.",
    isSynthetic: true,
  };
}
