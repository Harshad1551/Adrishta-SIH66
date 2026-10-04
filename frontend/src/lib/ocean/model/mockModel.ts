/**
 * OceanEmbed — Deterministic Mock Model Service
 * Produces reproducible 15-depth vertical temperature predictions from 7-channel SurfaceTensor
 */

import { GRID_CONFIG } from "../grid";
import { VERSION_CONFIG } from "../config";
import type { SurfaceTensor } from "../data/types";
import type { ModelPrediction, ModelService, PhysicsLossDiagnostics } from "./interface";
import { calculatePhysicsLoss, generateTrainingHistory } from "./physicsLoss";

export class MockOceanEmbedModel implements ModelService {
  private trainingHistory: PhysicsLossDiagnostics[];

  constructor() {
    this.trainingHistory = generateTrainingHistory(60);
  }

  public predictSync(tensor: SurfaceTensor): ModelPrediction {
    const { lat, lon, date, channels, validMask, missingChannels } = tensor;

    const sst = channels.sst;
    const ssh = channels.ssh;
    const sss = channels.sss;

    // Thermocline depth proxy based on region & SLA
    const baseTc = lon >= 78 ? 68 : 92;
    const slaShift = ssh * 50; // positive SLA deepens thermocline
    const tc = Math.round(Math.max(28, Math.min(180, baseTc + slaShift)));
    const mixed = Math.max(18, tc * 0.55);
    const deepTemp = 4.1 + (pseudoNoise(lon / 9, lat / 9, 21) - 0.5) * 0.7;

    const temperatures: number[] = [];
    const uncertainties: number[] = [];

    for (const d of GRID_CONFIG.depths) {
      let t: number;
      if (d <= mixed) {
        t = sst - d * 0.006;
      } else {
        const k = 1 - Math.exp(-(d - mixed) / (tc * 1.25));
        t = sst - (sst - deepTemp) * Math.pow(k, 0.62);
      }
      if (d >= 500) {
        t = Math.max(deepTemp - 0.6, t - (d - 500) * 0.0016);
      }
      const fineNoise = (pseudoNoise(lon / 3, lat / 3, d + 2) - 0.5) * 0.35;
      const finalT = +(t + fineNoise).toFixed(2);
      temperatures.push(finalT);

      // Uncertainty calculation
      const nearTc = Math.exp(-Math.pow((d - tc) / 70, 2)) * 0.55;
      const baseUnc = 0.16 + d / 4200;
      const uncNoise = pseudoNoise(lon / 5, lat / 5, 41) * 0.28;
      let unc = +(baseUnc + nearTc + uncNoise).toFixed(2);

      // Missing channel uncertainty penalty
      if (missingChannels.length > 0) {
        unc = +(unc + missingChannels.length * 0.15).toFixed(2);
      }
      uncertainties.push(unc);
    }

    // Overall Confidence Score (0–100%)
    const meanUnc = uncertainties.reduce((a, b) => a + b, 0) / uncertainties.length;
    let confidenceScore = Math.round(Math.max(30, Math.min(98, 100 - meanUnc * 42)));

    // Degrade confidence if any required channels are missing
    const degradedConfidencePenaltyApplied = missingChannels.length > 0;
    if (degradedConfidencePenaltyApplied) {
      confidenceScore = Math.max(25, confidenceScore - missingChannels.length * 15);
    }

    const confidenceCategory =
      confidenceScore >= 80
        ? "HIGH CONFIDENCE"
        : confidenceScore >= 60
          ? "MODERATE CONFIDENCE"
          : "LOW CONFIDENCE";

    // 256-D Simulated Latent Vector
    const latentEmbeddingVector = Array.from(
      { length: VERSION_CONFIG.embeddingDimension },
      (_, i) => {
        const v = Math.sin(lat * 1.5 + lon * 2.1 + i * 0.1) * Math.cos(sst * 0.2 + i);
        return +(v * 0.5).toFixed(4);
      },
    );

    const { physicsPenalty } = calculatePhysicsLoss(temperatures);

    return {
      date,
      lat,
      lon,
      depths: GRID_CONFIG.depths,
      temperatures,
      uncertainties,
      confidenceScore,
      confidenceCategory,
      latentEmbeddingVector,
      modelVersion: VERSION_CONFIG.modelVersion,
      isSynthetic: true,
      diagnostics: {
        missingChannelsFlagged: missingChannels,
        degradedConfidencePenaltyApplied,
        physicsLossPenalty: physicsPenalty,
      },
    };
  }

  public async predict(tensor: SurfaceTensor): Promise<ModelPrediction> {
    return this.predictSync(tensor);
  }

  public getPhysicsLossDiagnostics(): PhysicsLossDiagnostics {
    const defaultHist = generateTrainingHistory(1)[0]!;
    return this.trainingHistory[this.trainingHistory.length - 1] ?? defaultHist;
  }
}

function pseudoNoise(x: number, y: number, z = 0): number {
  const hash = (nx: number, ny: number) => {
    const s = Math.sin(nx * 127.1 + ny * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export const mockOceanEmbedModel = new MockOceanEmbedModel();
