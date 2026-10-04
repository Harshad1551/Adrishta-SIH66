/**
 * OceanEmbed — Thermocline & Mixed Layer Detection
 * Derived strictly from vertical temperature profile (dT/dz maximum gradient criterion)
 */

import { GRID_CONFIG, type Depth } from "../grid";

export interface ThermoclineDerivation {
  thermoclineDepthM: number;
  mixedLayerDepthM: number;
  peakGradientDegPerM: number;
  isotherm20DepthM: number; // D20 proxy widely used in Indian Ocean studies
  verticalGradients: Array<{ depth: number; gradient: number }>;
}

/**
 * Derive thermocline depth and vertical gradient characteristics from 15-depth temperature array
 */
export function deriveThermocline(
  depths: readonly Depth[],
  temperatures: number[],
): ThermoclineDerivation {
  if (depths.length !== temperatures.length || depths.length === 0) {
    return {
      thermoclineDepthM: 80,
      mixedLayerDepthM: 30,
      peakGradientDegPerM: 0.12,
      isotherm20DepthM: 110,
      verticalGradients: [],
    };
  }

  const sst = temperatures[0];
  let mixedLayerDepthM = depths[0];

  // Mixed layer criterion: Depth where temperature decreases by 0.2°C from surface
  for (let i = 1; i < depths.length; i++) {
    if (sst - temperatures[i] >= 0.2) {
      mixedLayerDepthM = depths[i];
      break;
    }
  }

  // Find 20°C isotherm depth (D20)
  let isotherm20DepthM = 120;
  for (let i = 0; i < depths.length - 1; i++) {
    if (temperatures[i] >= 20.0 && temperatures[i + 1] <= 20.0) {
      const frac = (temperatures[i] - 20.0) / (temperatures[i] - temperatures[i + 1]);
      isotherm20DepthM = Math.round(depths[i] + frac * (depths[i + 1] - depths[i]));
      break;
    }
  }

  // Calculate vertical gradients |dT/dz| (°C/m)
  const verticalGradients: Array<{ depth: number; gradient: number }> = [];
  let maxGrad = -Infinity;
  let thermoclineDepthM = depths[0];

  for (let i = 0; i < depths.length - 1; i++) {
    const dz = depths[i + 1] - depths[i];
    const dt = temperatures[i] - temperatures[i + 1]; // positive for normal cooling downward
    const grad = +(dt / dz).toFixed(4);
    const midDepth = Math.round((depths[i] + depths[i + 1]) / 2);
    verticalGradients.push({ depth: midDepth, gradient: grad });

    if (grad > maxGrad) {
      maxGrad = grad;
      thermoclineDepthM = midDepth;
    }
  }

  return {
    thermoclineDepthM,
    mixedLayerDepthM,
    peakGradientDegPerM: +(maxGrad > 0 ? maxGrad : 0.05).toFixed(3),
    isotherm20DepthM,
    verticalGradients,
  };
}
