/**
 * OceanEmbed Data Adapter — International ARGO Float Array
 * Role: INDEPENDENT IN-SITU VALIDATION ONLY (Post-Hoc Evaluation)
 * Never treat ARGO as required for operational inference.
 */

import { DATASET_CONFIG } from "../../config";
import { DOMAIN, isLand, snapToGrid } from "../../grid";
import type { ArgoProfile, DataMode } from "../types";

export interface ArgoQueryOptions {
  startDate?: string;
  endDate?: string;
  maxDistanceKm?: number;
  qualityFlagMin?: number;
}

/**
 * Deterministic synthetic ARGO floats in North Indian Ocean domain
 */
export const SYNTHETIC_ARGO_FLOATS: ArgoProfile[] = (() => {
  const floats: ArgoProfile[] = [];
  const seedFloats = [
    { wmo: "2903342", lat: 14.5, lon: 65.25, cycle: 142, dateOffset: 2 },
    { wmo: "2903358", lat: 18.25, lon: 68.75, cycle: 89, dateOffset: 3 },
    { wmo: "2903401", lat: 9.75, lon: 58.5, cycle: 210, dateOffset: 1 },
    { wmo: "2903425", lat: 12.0, lon: 86.5, cycle: 74, dateOffset: 4 },
    { wmo: "2903460", lat: 16.75, lon: 89.25, cycle: 118, dateOffset: 2 },
    { wmo: "2903488", lat: 19.5, lon: 87.0, cycle: 65, dateOffset: 5 },
    { wmo: "2903512", lat: 7.25, lon: 76.5, cycle: 184, dateOffset: 1 },
    { wmo: "2903544", lat: 21.0, lon: 64.0, cycle: 92, dateOffset: 3 },
    { wmo: "2903590", lat: 11.5, lon: 93.5, cycle: 130, dateOffset: 6 },
    { wmo: "2903615", lat: 15.0, lon: 72.0, cycle: 155, dateOffset: 2 },
  ];

  for (const sf of seedFloats) {
    if (isLand(sf.lat, sf.lon)) continue;
    const depths = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
    const baseSST = 28.6 - Math.abs(sf.lat - 12) * 0.2;
    const temperatures = depths.map((d) => {
      if (d <= 30) return +(baseSST - d * 0.007).toFixed(2);
      if (d <= 150) return +(baseSST - 8.5 * Math.pow((d - 30) / 120, 0.7)).toFixed(2);
      if (d <= 500) return +(16.0 - ((d - 150) / 350) * 8.0).toFixed(2);
      return +(8.0 - ((d - 500) / 500) * 3.8).toFixed(2);
    });

    floats.push({
      wmoId: `WMO-${sf.wmo}`,
      timestamp: `2026-09-${27 - sf.dateOffset}T06:30:00Z`,
      lat: sf.lat,
      lon: sf.lon,
      cycleNumber: sf.cycle,
      depths,
      temperatures,
      qualityFlags: depths.map(() => 1), // 1 = good quality in ARGO QC
      source: DATASET_CONFIG.argo.name,
      isSynthetic: true,
    });
  }

  return floats;
})();

export async function fetchARGOProfiles(
  targetLat: number,
  targetLon: number,
  targetDate: string,
  mode: DataMode = "mock",
): Promise<ArgoProfile[]> {
  // Query Coriolis GDAC / INCOIS real in-situ floats from FastAPI backend
  try {
    const res = await fetch("http://localhost:8000/api/v1/validation/argo/floats");
    if (res.ok) {
      const data = await res.json();
      if (data.floats && data.floats.length > 0) {
        return data.floats.sort((a: ArgoProfile, b: ArgoProfile) => {
          const distA = Math.hypot(a.lat - targetLat, a.lon - targetLon);
          const distB = Math.hypot(b.lat - targetLat, b.lon - targetLon);
          return distA - distB;
        });
      }
    }
  } catch (err) {
    // Backend offline: proceed to local reference array
  }

  // Return reference floats sorted by distance
  return [...SYNTHETIC_ARGO_FLOATS].sort((a, b) => {
    const distA = Math.hypot(a.lat - targetLat, a.lon - targetLon);
    const distB = Math.hypot(b.lat - targetLat, b.lon - targetLon);
    return distA - distB;
  });
}
