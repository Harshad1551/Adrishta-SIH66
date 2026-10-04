/**
 * OceanEmbed — Observation-Gap Intelligence & Prioritization Engine
 * Formalized score:
 * S_gap = w_unc * Uncertainty + w_dense * (1 - FloatDensity) + w_anom * |Anomaly| + w_grad * |Grad_T|
 */

import { isLand } from "../grid";

export interface GapWeights {
  wUncertainty: number;
  wFloatSparsity: number;
  wAnomalyMagnitude: number;
  wThermalGradient: number;
}

export const DEFAULT_GAP_WEIGHTS: GapWeights = {
  wUncertainty: 0.55,
  wFloatSparsity: 0.4,
  wAnomalyMagnitude: 0.12,
  wThermalGradient: 0.08,
};

export type GapPriorityClass = "High" | "Medium" | "Low";

export interface GapScoreResult {
  score: number; // 0.0 to 1.0
  priority: GapPriorityClass;
  components: {
    uncertaintyContribution: number;
    sparsityContribution: number;
    anomalyContribution: number;
    gradientContribution: number;
  };
}

/**
 * Calculate observation priority score for a coordinate
 */
export function calculateObservationGapScore(
  uncertainty100m: number,
  floatDensityFraction: number,
  anomalyMagnitude: number,
  horizontalGradDegC: number,
  weights: GapWeights = DEFAULT_GAP_WEIGHTS,
): GapScoreResult {
  const normUnc = Math.min(1.0, uncertainty100m / 1.2);
  const sparsity = Math.max(0.0, 1.0 - floatDensityFraction);
  const normAnom = Math.min(1.0, anomalyMagnitude / 2.5);
  const normGrad = Math.min(1.0, horizontalGradDegC / 2.0);

  const uncPart = weights.wUncertainty * normUnc;
  const sparsePart = weights.wFloatSparsity * sparsity;
  const anomPart = weights.wAnomalyMagnitude * normAnom;
  const gradPart = weights.wThermalGradient * normGrad;

  const rawScore = uncPart + sparsePart + anomPart + gradPart;
  const score = +Math.max(0.0, Math.min(1.0, rawScore)).toFixed(2);

  const priority: GapPriorityClass = score >= 0.68 ? "High" : score >= 0.48 ? "Medium" : "Low";

  return {
    score,
    priority,
    components: {
      uncertaintyContribution: +uncPart.toFixed(3),
      sparsityContribution: +sparsePart.toFixed(3),
      anomalyContribution: +anomPart.toFixed(3),
      gradientContribution: +gradPart.toFixed(3),
    },
  };
}
