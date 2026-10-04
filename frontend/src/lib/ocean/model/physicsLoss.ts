/**
 * OceanEmbed — Physics-Constrained Loss Formulation & Diagnostics
 * Total Loss: L_total = L_data + λ * L_physics (λ = 0.35 configurable)
 */

import { VERSION_CONFIG } from "../config";
import { GRID_CONFIG } from "../grid";
import type { PhysicsLossDiagnostics } from "./interface";

export interface PhysicsConstraintsConfig {
  lambda: number;
  enableHydrostaticStability: boolean;
  enableMixedLayerConservation: boolean;
  enableMonotonicDecay: boolean;
  enableVerticalSmoothness: boolean;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConstraintsConfig = {
  lambda: VERSION_CONFIG.physicsLossLambda,
  enableHydrostaticStability: true,
  enableMixedLayerConservation: true,
  enableMonotonicDecay: true,
  enableVerticalSmoothness: true,
};

/**
 * Calculate physics loss penalty for a predicted 15-depth vertical temperature column
 */
export function calculatePhysicsLoss(
  predictedTemps: number[],
  config: PhysicsConstraintsConfig = DEFAULT_PHYSICS_CONFIG,
): { physicsPenalty: number; components: Record<string, number> } {
  let stabilityPenalty = 0;
  let mixedLayerPenalty = 0;
  let decayPenalty = 0;
  let smoothnessPenalty = 0;

  const depths = GRID_CONFIG.depths;

  // 1. Mixed Layer Uniformity (0 to 30 m): temperatures should be nearly isothermal
  if (config.enableMixedLayerConservation && predictedTemps.length >= 5) {
    const sst = predictedTemps[0] ?? 28.0;
    for (let i = 1; i <= 4; i++) {
      const val = predictedTemps[i];
      if (val !== undefined) {
        const diff = Math.abs(val - sst);
        if (diff > 0.8) {
          mixedLayerPenalty += Math.pow(diff - 0.8, 2);
        }
      }
    }
  }

  // 2. Monotonic non-increasing below thermocline (depths >= 150m)
  if (config.enableMonotonicDecay) {
    for (let i = 9; i < predictedTemps.length - 1; i++) {
      const d1 = predictedTemps[i];
      const d2 = predictedTemps[i + 1];
      if (d1 !== undefined && d2 !== undefined) {
        // If deeper layer is warmer than shallower layer in abyss, penalize overturn
        if (d2 > d1 + 0.1) {
          decayPenalty += Math.pow(d2 - d1, 2) * 5.0;
        }
      }
    }
  }

  // 3. Hydrostatic vertical density stability proxy
  if (config.enableHydrostaticStability) {
    for (let i = 0; i < predictedTemps.length - 1; i++) {
      const p1 = predictedTemps[i];
      const p2 = predictedTemps[i + 1];
      const z1 = depths[i];
      const z2 = depths[i + 1];
      if (p1 !== undefined && p2 !== undefined && z1 !== undefined && z2 !== undefined) {
        const grad = (p2 - p1) / (z2 - z1);
        // Spurious positive gradient (temperature inversion > 0.05°C/m)
        if (grad > 0.05) {
          stabilityPenalty += Math.pow(grad - 0.05, 2) * 10.0;
        }
      }
    }
  }

  // 4. Vertical Profile Smoothness (second derivative)
  if (config.enableVerticalSmoothness) {
    for (let i = 1; i < predictedTemps.length - 1; i++) {
      const tPrev = predictedTemps[i - 1];
      const tCurr = predictedTemps[i];
      const tNext = predictedTemps[i + 1];
      if (tPrev !== undefined && tCurr !== undefined && tNext !== undefined) {
        const d2T = tPrev - 2 * tCurr + tNext;
        if (Math.abs(d2T) > 3.0) {
          smoothnessPenalty += Math.pow(Math.abs(d2T) - 3.0, 2) * 0.5;
        }
      }
    }
  }

  const totalPhysics = stabilityPenalty + mixedLayerPenalty + decayPenalty + smoothnessPenalty;

  return {
    physicsPenalty: +(config.lambda * totalPhysics).toFixed(4),
    components: {
      stabilityPenalty: +stabilityPenalty.toFixed(4),
      mixedLayerPenalty: +mixedLayerPenalty.toFixed(4),
      decayPenalty: +decayPenalty.toFixed(4),
      smoothnessPenalty: +smoothnessPenalty.toFixed(4),
    },
  };
}

/**
 * Generate simulated training convergence trajectory (epochs 1 to 60)
 */
export function generateTrainingHistory(epochs = 60): PhysicsLossDiagnostics[] {
  return Array.from({ length: epochs }, (_, idx) => {
    const e = idx + 1;
    const dataLossMSE = +(1.62 * Math.exp(-e / 14) + 0.11).toFixed(4);
    const hydrostaticLoss = +(0.38 * Math.exp(-e / 10) + 0.02).toFixed(4);
    const mixedLayerLoss = +(0.22 * Math.exp(-e / 8) + 0.015).toFixed(4);
    const monotonicLoss = +(0.14 * Math.exp(-e / 9) + 0.015).toFixed(4);
    const totalPhysicsLoss = +(hydrostaticLoss + mixedLayerLoss + monotonicLoss).toFixed(4);
    const lambda = VERSION_CONFIG.physicsLossLambda;
    const totalLoss = +(dataLossMSE + lambda * totalPhysicsLoss).toFixed(4);

    return {
      epoch: e,
      dataLossMSE,
      hydrostaticStabilityLoss: hydrostaticLoss,
      mixedLayerUniformityLoss: mixedLayerLoss,
      monotonicDecayLoss: monotonicLoss,
      totalPhysicsLoss,
      lambda,
      totalLoss,
    };
  });
}
