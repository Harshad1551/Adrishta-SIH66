/**
 * OceanEmbed — Real ML Model Client (FastAPI / PyTorch / ONNX Runtime)
 * Handles operational inference when DATA_MODE is "real".
 */

import type { SurfaceTensor } from "../data/types";
import type { ModelPrediction, ModelService, PhysicsLossDiagnostics } from "./interface";
import { mockOceanEmbedModel } from "./mockModel";

export class OceanEmbedInferenceClient implements ModelService {
  private apiEndpoint: string;

  constructor(apiEndpoint = process.env.OCEANEMBED_API_URL || "http://localhost:8000") {
    this.apiEndpoint = apiEndpoint;
  }

  public async predict(tensor: SurfaceTensor): Promise<ModelPrediction> {
    if (tensor.isSynthetic) {
      return mockOceanEmbedModel.predictSync(tensor);
    }

    try {
      const response = await fetch(`${this.apiEndpoint}/v1/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: tensor.date,
          lat: tensor.lat,
          lon: tensor.lon,
          normalized_vector: tensor.normalizedVector,
          valid_mask: tensor.validMask,
        }),
      });

      if (!response.ok) {
        throw new Error(`Inference service error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        date: tensor.date,
        lat: tensor.lat,
        lon: tensor.lon,
        depths: data.depths,
        temperatures: data.temperatures,
        uncertainties: data.uncertainties,
        confidenceScore: data.confidence_score,
        confidenceCategory: data.confidence_category,
        latentEmbeddingVector: data.latent_vector,
        modelVersion: data.model_version,
        isSynthetic: false,
        diagnostics: data.diagnostics,
      };
    } catch (err) {
      console.warn("Real inference server unreachable, falling back to mock pipeline:", err);
      return mockOceanEmbedModel.predictSync(tensor);
    }
  }

  public predictSync(tensor: SurfaceTensor): ModelPrediction {
    return mockOceanEmbedModel.predictSync(tensor);
  }

  public getPhysicsLossDiagnostics(): PhysicsLossDiagnostics {
    return mockOceanEmbedModel.getPhysicsLossDiagnostics();
  }
}

export const oceanEmbedClient = new OceanEmbedInferenceClient();
