/**
 * OceanEmbed — Marine Heatwaves & Extreme Event Detection Layer
 * Redesigned flow: Reconstructed Temperature → Anomaly → Event Criteria (Hobday et al.) → Event State
 */

export type MhwSeverityCategory =
  | "None"
  | "Category I (Moderate)"
  | "Category II (Strong)"
  | "Category III (Severe)"
  | "Category IV (Extreme)";

export interface OceanEventRecord {
  id: string;
  name: string;
  type: "Marine Heatwave" | "Subsurface Warming" | "Coastal Upwelling Cooling";
  status: "Active" | "Declining" | "Closed";
  startDate: string;
  durationDays: number;
  peakAnomalyDegC: number;
  affectedDepthRange: string;
  estimatedHeatContentGJm2: number;
  epicenterLat: number;
  epicenterLon: number;
  detectionCriteria: string;
  isSynthetic: boolean;
}

export const MONITORED_OCEAN_EVENTS: OceanEventRecord[] = [
  {
    id: "mhw-2026-07",
    name: "Central Arabian Sea Marine Heatwave",
    type: "Marine Heatwave",
    status: "Active",
    startDate: "2026-08-18",
    durationDays: 40,
    peakAnomalyDegC: 2.4,
    affectedDepthRange: "0–75 m",
    estimatedHeatContentGJm2: 1.42,
    epicenterLat: 17.5,
    epicenterLon: 64.5,
    detectionCriteria: "Hobday et al. (2018) > 90th percentile threshold for ≥5 consecutive days",
    isSynthetic: true,
  },
  {
    id: "mhw-2026-05",
    name: "Northern Bay of Bengal Subsurface Warming",
    type: "Subsurface Warming",
    status: "Declining",
    startDate: "2026-07-02",
    durationDays: 61,
    peakAnomalyDegC: 1.8,
    affectedDepthRange: "20–125 m",
    estimatedHeatContentGJm2: 0.96,
    epicenterLat: 19.5,
    epicenterLon: 88.5,
    detectionCriteria: "Subsurface isotherm displacement & barrier layer heat retention",
    isSynthetic: true,
  },
  {
    id: "cool-2026-06",
    name: "Somali Upwelling Cold Anomaly",
    type: "Coastal Upwelling Cooling",
    status: "Closed",
    startDate: "2026-06-11",
    durationDays: 34,
    peakAnomalyDegC: -1.6,
    affectedDepthRange: "0–50 m",
    estimatedHeatContentGJm2: -0.61,
    epicenterLat: 9.5,
    epicenterLon: 52.5,
    detectionCriteria: "Ekman pumping induced coastal sea surface cooling < 10th percentile",
    isSynthetic: true,
  },
];

/**
 * Classify MHW severity from local anomaly index
 */
export function classifyMhwSeverity(anomalyDegC: number): {
  index: number;
  category: MhwSeverityCategory;
} {
  const index = Math.max(0, anomalyDegC);
  if (index < 0.6) return { index: +index.toFixed(2), category: "None" };
  if (index < 1.2) return { index: +index.toFixed(2), category: "Category I (Moderate)" };
  if (index < 1.8) return { index: +index.toFixed(2), category: "Category II (Strong)" };
  if (index < 2.5) return { index: +index.toFixed(2), category: "Category III (Severe)" };
  return { index: +index.toFixed(2), category: "Category IV (Extreme)" };
}
