/**
 * OceanEmbed — Grid Configuration & Spatial Geometry
 * Domain: North Indian Ocean (5°N–30°N, 45°E–105°E) at 0.25° × 0.25° resolution
 * Output: 15 Standard Oceanographic Depths (0–1000 m)
 */

export const GRID_CONFIG = {
  latMin: 5.0,
  latMax: 30.0,
  lonMin: 45.0,
  lonMax: 105.0,
  resolution: 0.25, // degrees
  nLat: 101, // (30.0 - 5.0) / 0.25 + 1
  nLon: 241, // (105.0 - 45.0) / 0.25 + 1
  depths: [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000] as const,
  temporalResolution: "daily" as const,
  timeOrigin: "00:00 UTC",
} as const;

export type Depth = (typeof GRID_CONFIG.depths)[number];
export const DEPTHS = GRID_CONFIG.depths;
export const DOMAIN = {
  latMin: GRID_CONFIG.latMin,
  latMax: GRID_CONFIG.latMax,
  lonMin: GRID_CONFIG.lonMin,
  lonMax: GRID_CONFIG.lonMax,
};

export type RegionId = "North Indian Ocean" | "Arabian Sea" | "Bay of Bengal" | "Equatorial Band";

export const REGIONS: readonly RegionId[] = [
  "North Indian Ocean",
  "Arabian Sea",
  "Bay of Bengal",
  "Equatorial Band",
] as const;

/**
 * Coarse geometric land shapes representing coastlines and continental interiors in NIO
 */
const LAND_SHAPES: Array<[number, number, number, number]> = [
  // [centerLon, centerLat, radiusLon, radiusLat]
  [78.5, 21.5, 7.5, 8.0], // Indian subcontinent
  [77.5, 12.0, 4.0, 6.5], // Southern India peninsula
  [46.5, 24.0, 6.5, 8.0], // Arabian peninsula
  [55.5, 23.5, 3.5, 3.0], // Oman / UAE
  [61.0, 28.5, 6.0, 4.0], // Iran / Pakistan interior
  [45.0, 8.0, 4.0, 4.5], // Horn of Africa
  [96.5, 21.0, 5.0, 7.0], // Myanmar
  [101.5, 16.0, 4.5, 7.0], // Thailand / Indochina
  [103.5, 26.0, 6.0, 6.0], // SE Asia interior
  [90.0, 24.5, 3.0, 3.0], // Bangladesh
];

function smoothNoise(x: number, y: number, z = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const hash = (nx: number, ny: number) => {
    const s = Math.sin(nx * 127.1 + ny * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/**
 * Determine if a given (lat, lon) coordinate is over land or ocean
 */
export function isLand(lat: number, lon: number): boolean {
  for (const [cl, ca, rl, ra] of LAND_SHAPES) {
    const dx = (lon - cl) / rl;
    const dy = (lat - ca) / ra;
    if (dx * dx + dy * dy < 1) {
      const n = smoothNoise(lon * 1.4, lat * 1.4, 7);
      if (dx * dx + dy * dy < 0.82 + n * 0.3) return true;
    }
  }
  return false;
}

/**
 * Classify a coordinate into one of the key NIO sub-basins
 */
export function regionOf(lat: number, lon: number): RegionId {
  if (lat < 10) return "Equatorial Band";
  return lon < 78 ? "Arabian Sea" : "Bay of Bengal";
}

/**
 * Snap arbitrary coordinates to nearest 0.25° grid vertex
 */
export function snapToGrid(lat: number, lon: number): { lat: number; lon: number } {
  const res = GRID_CONFIG.resolution;
  const clampedLat = Math.max(GRID_CONFIG.latMin, Math.min(GRID_CONFIG.latMax, lat));
  const clampedLon = Math.max(GRID_CONFIG.lonMin, Math.min(GRID_CONFIG.lonMax, lon));
  const snappedLat = Math.round((clampedLat - GRID_CONFIG.latMin) / res) * res + GRID_CONFIG.latMin;
  const snappedLon = Math.round((clampedLon - GRID_CONFIG.lonMin) / res) * res + GRID_CONFIG.lonMin;
  return {
    lat: +snappedLat.toFixed(2),
    lon: +snappedLon.toFixed(2),
  };
}

/**
 * Get full grid coordinate arrays
 */
export function getGridCoordinates(): { lats: number[]; lons: number[] } {
  const lats: number[] = [];
  const lons: number[] = [];
  const res = GRID_CONFIG.resolution;
  for (let lat = GRID_CONFIG.latMin; lat <= GRID_CONFIG.latMax + 1e-6; lat += res) {
    lats.push(+lat.toFixed(2));
  }
  for (let lon = GRID_CONFIG.lonMin; lon <= GRID_CONFIG.lonMax + 1e-6; lon += res) {
    lons.push(+lon.toFixed(2));
  }
  return { lats, lons };
}
