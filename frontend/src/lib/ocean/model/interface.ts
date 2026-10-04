/**
 * OceanEmbed — ML Inference & Physics Constraint Interface Specification
 */

import type { Depth } from "../grid";
import type { SurfaceTensor } from "../data/types";

export interface ModelPrediction {
  date: string;
  lat: number;
  lon: number;
  depths: readonly Depth[];
  temperatures: number[]; // 15 reconstructed temperatures
  uncertainties: number[]; // 15 calibrated uncertainty bounds (±°C)
  confidenceScore: number; // 0–100% confidence
  confidenceCategory: "HIGH CONFIDENCE" | "MODERATE CONFIDENCE" | "LOW CONFIDENCE";
  latentEmbeddingVector?: number[]; // 256-D float vector (z in R^256)
  modelVersion: string;
  isSynthetic: boolean;
  diagnostics: {
    missingChannelsFlagged: string[];
    degradedConfidencePenaltyApplied: boolean;
    physicsLossPenalty: number;
  };
}

export interface PhysicsLossDiagnostics {
  epoch?: number;
  dataLossMSE: number;
  hydrostaticStabilityLoss: number;
  mixedLayerUniformityLoss: number;
  monotonicDecayLoss: number;
  totalPhysicsLoss: number;
  lambda: number;
  totalLoss: number;
}

export interface ModelService {
  predict(tensor: SurfaceTensor): Promise<ModelPrediction>;
  predictSync(tensor: SurfaceTensor): ModelPrediction;
  getPhysicsLossDiagnostics(): PhysicsLossDiagnostics;
}
