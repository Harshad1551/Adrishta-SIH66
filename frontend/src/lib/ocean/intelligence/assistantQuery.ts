/**
 * OceanEmbed — Natural Language Query Parser & Structured NLP Pipeline
 * Converts user query strings into structured scientific parameters without fabricating data.
 */

import { GRID_CONFIG, type Depth } from "../grid";

export type AssistantQueryIntent =
  | "coordinate_inspection"
  | "timeseries_evolution"
  | "basin_comparison"
  | "observation_gaps"
  | "mhw_events"
  | "explainability"
  | "unknown";

export interface ParsedScientificQuery {
  rawQuery: string;
  intent: AssistantQueryIntent;
  targetLat?: number;
  targetLon?: number;
  targetDepth?: Depth;
  targetDate?: string;
  daysRange?: number;
  region?: "Arabian Sea" | "Bay of Bengal";
}

/**
 * Parse natural language user question into a typed query specification
 */
export function parseAssistantQuery(query: string, defaultDate: string): ParsedScientificQuery {
  const lower = query.toLowerCase();

  // Extract Lat / Lon via Regex (e.g. 15.25N, 65.25E or 15°N, 65°E)
  let targetLat: number | undefined;
  let targetLon: number | undefined;

  const latMatch = lower.match(/(\d+(\.\d+)?)\s*(°)?\s*n/);
  if (latMatch) targetLat = parseFloat(latMatch[1]);

  const lonMatch = lower.match(/(\d+(\.\d+)?)\s*(°)?\s*e/);
  if (lonMatch) targetLon = parseFloat(lonMatch[1]);

  // Extract Depth (e.g. 100 m, 200m)
  let targetDepth: Depth | undefined;
  const depthMatch = lower.match(/(\d+)\s*(m|meter|metre)/);
  if (depthMatch) {
    const parsedD = parseInt(depthMatch[1], 10);
    // Find closest available depth tier
    const closest = GRID_CONFIG.depths.reduce((prev, curr) =>
      Math.abs(curr - parsedD) < Math.abs(prev - parsedD) ? curr : prev,
    );
    targetDepth = closest;
  }

  // Determine intent
  let intent: AssistantQueryIntent = "unknown";
  if (lower.includes("compare") || (lower.includes("arabian") && lower.includes("bengal"))) {
    intent = "basin_comparison";
  } else if (lower.includes("gap") || lower.includes("deployment") || lower.includes("sensor")) {
    intent = "observation_gaps";
  } else if (lower.includes("heatwave") || lower.includes("mhw") || lower.includes("anomaly")) {
    intent = "mhw_events";
  } else if (lower.includes("why") || lower.includes("explain") || lower.includes("attribution")) {
    intent = "explainability";
  } else if (
    lower.includes("trend") ||
    lower.includes("time") ||
    lower.includes("evolution") ||
    lower.includes("days")
  ) {
    intent = "timeseries_evolution";
  } else if (
    targetLat != null ||
    targetLon != null ||
    targetDepth != null ||
    lower.includes("temperature")
  ) {
    intent = "coordinate_inspection";
  }

  return {
    rawQuery: query,
    intent,
    targetLat,
    targetLon,
    targetDepth,
    targetDate: defaultDate,
    daysRange: lower.includes("30") ? 30 : lower.includes("90") ? 90 : 30,
    region: lower.includes("arabian")
      ? "Arabian Sea"
      : lower.includes("bengal")
        ? "Bay of Bengal"
        : undefined,
  };
}
