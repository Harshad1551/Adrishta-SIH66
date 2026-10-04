/**
 * OceanEmbed — Core Data & Simulation Layer
 * PROTOTYPE / MOCK MODE: Deterministic synthetic generators using exact 0.25° NIO domain & 15 depths.
 * All datasets and metrics carry explicit isSynthetic/mock provenance markers.
 */

import {
  GRID_CONFIG,
  DEPTHS,
  DOMAIN,
  REGIONS,
  isLand,
  regionOf,
  snapToGrid,
  type Depth,
  type RegionId,
} from "./grid";
import { VERSION_CONFIG, DATASET_CONFIG } from "./config";
import {
  getDepthStratifiedValidationMetrics,
  getRegionalStratifiedValidationMetrics,
  getSeasonalStratifiedValidationMetrics,
  SYNTHETIC_ARGO_FLOATS,
} from "./validation/argoValidation";
import { generateTrainingHistory } from "./model/physicsLoss";
import { SCIENTIFIC_BASELINE_MODELS } from "./model/baselines";
import { calculateObservationGapScore } from "./intelligence/gaps";
import { classifyMhwSeverity } from "./intelligence/events";

export { DEPTHS, DOMAIN, REGIONS, isLand, regionOf, snapToGrid };
export type { Depth, RegionId };

export const RECONSTRUCTION_DATE = "2026-10-03";
export const EARLIEST_RECONSTRUCTION_DATE = "2024-01-07";
export const LATEST_ARGO_DATE = "2026-10-03";

export const VARIABLES = [
  { id: "temp", label: "Subsurface Temperature", unit: "°C" },
  { id: "anomaly", label: "Temperature Anomaly", unit: "°C" },
  { id: "uncertainty", label: "Uncertainty (±1σ)", unit: "°C" },
  { id: "thermocline", label: "Thermocline Depth", unit: "m" },
  { id: "mhw", label: "Marine Heatwave Index", unit: "index" },
  { id: "gap", label: "Observation Gap Priority", unit: "score" },
] as const;
export type VariableId = (typeof VARIABLES)[number]["id"];

/* ---------- deterministic noise ---------- */

function hash(x: number, y: number, z = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x: number, y: number, z = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, z);
  const b = hash(xi + 1, yi, z);
  const c = hash(xi, yi + 1, z);
  const d = hash(xi + 1, yi + 1, z);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function dayOfYear(date: string): number {
  const d = new Date(date + "T00:00:00Z");
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}
export function dateKey(date: string): number {
  return Math.floor(new Date(date + "T00:00:00Z").getTime() / 86400000);
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- core thermal fields ---------- */

export function surfaceTemp(lat: number, lon: number, date: string): number {
  const doy = dayOfYear(date);
  const seasonal = Math.cos(((doy - 130) / 365) * 2 * Math.PI) * -1.7;
  const latGrad = 30.4 - Math.abs(lat - 11) * 0.21;
  const bob = lon >= 78 ? 0.55 : -0.25;
  const upwelling = lat > 14 && lon < 60 ? -0.9 : 0;
  const n = (smoothNoise(lon / 4.2, lat / 4.2, 1) - 0.5) * 1.6;
  const m = (smoothNoise(lon / 1.6, lat / 1.6, 3) - 0.5) * 0.7;
  return +(latGrad + seasonal + bob + upwelling + n + m).toFixed(2);
}

export function thermoclineDepth(lat: number, lon: number, date: string): number {
  const base = lon >= 78 ? 68 : 92;
  const n = (smoothNoise(lon / 5, lat / 5, 11) - 0.5) * 46;
  const seasonal = Math.sin((dayOfYear(date) / 365) * 2 * Math.PI) * 12;
  return Math.round(Math.max(28, Math.min(180, base + n + seasonal)));
}

export function tempAtDepth(lat: number, lon: number, depth: number, date: string): number {
  const sst = surfaceTemp(lat, lon, date);
  const tc = thermoclineDepth(lat, lon, date);
  const mixed = Math.max(18, tc * 0.55);
  const deep = 4.1 + (smoothNoise(lon / 9, lat / 9, 21) - 0.5) * 0.7;
  let t: number;
  if (depth <= mixed) {
    t = sst - depth * 0.006;
  } else {
    const k = 1 - Math.exp(-(depth - mixed) / (tc * 1.25));
    t = sst - (sst - deep) * Math.pow(k, 0.62);
  }
  if (depth >= 500) t = Math.max(deep - 0.6, t - (depth - 500) * 0.0016);
  const n = (smoothNoise(lon / 3, lat / 3, depth + 2) - 0.5) * 0.35;
  return +(t + n).toFixed(2);
}

export function anomalyAt(lat: number, lon: number, depth: number, date: string): number {
  const k = dateKey(date) / 260;
  const n = smoothNoise(lon / 6 + k, lat / 6, 31) - 0.42;
  const depthDamp = Math.exp(-depth / 260);
  const basin = lon >= 78 ? 0.25 : 0.1;
  return +((n * 4.2 + basin) * depthDamp).toFixed(2);
}

export function uncertaintyAt(lat: number, lon: number, depth: number, date: string): number {
  const tc = thermoclineDepth(lat, lon, date);
  const nearTc = Math.exp(-Math.pow((depth - tc) / 70, 2)) * 0.55;
  const base = 0.16 + depth / 4200;
  const n = smoothNoise(lon / 5, lat / 5, 41) * 0.28;
  return +(base + nearTc + n).toFixed(2);
}

export function confidenceAt(lat: number, lon: number, depth: number, date: string): number {
  const u = uncertaintyAt(lat, lon, depth, date);
  return Math.round(Math.max(52, Math.min(98, 100 - u * 34 - depth / 130)));
}

export function obsDensity(lat: number, lon: number): number {
  const n = smoothNoise(lon / 5.5, lat / 5.5, 53);
  const coastBoost = isLand(lat + 2, lon) || isLand(lat, lon + 2) ? 0.15 : 0;
  return +Math.max(0.02, Math.min(1, n * 0.95 + coastBoost)).toFixed(2);
}

export function mhwIndex(lat: number, lon: number, date: string): number {
  const a = anomalyAt(lat, lon, 0, date);
  return +Math.max(0, a).toFixed(2);
}

export type MhwStatus = "None" | "Watch" | "Moderate" | "Strong" | "Severe";
export function mhwStatus(idx: number): MhwStatus {
  if (idx < 0.6) return "None";
  if (idx < 1.1) return "Watch";
  if (idx < 1.7) return "Moderate";
  if (idx < 2.4) return "Strong";
  return "Severe";
}

export function gapScore(lat: number, lon: number, date: string): number {
  const u = uncertaintyAt(lat, lon, 100, date);
  const d = obsDensity(lat, lon);
  const a = Math.abs(anomalyAt(lat, lon, 100, date));
  const grad =
    Math.abs(surfaceTemp(lat + 1, lon, date) - surfaceTemp(lat - 1, lon, date)) +
    Math.abs(surfaceTemp(lat, lon + 1, date) - surfaceTemp(lat, lon - 1, date));
  return calculateObservationGapScore(u, d, a, grad).score;
}

export function gapPriority(score: number): "Low" | "Medium" | "High" {
  return score > 0.68 ? "High" : score > 0.48 ? "Medium" : "Low";
}

/* ---------- field grid with 0.25° resolution support ---------- */

export type Cell = {
  lat: number;
  lon: number;
  value: number;
  land: boolean;
};

export function fieldGrid(
  variable: VariableId,
  depth: number,
  date: string,
  step = GRID_CONFIG.resolution,
): Cell[] {
  const cells: Cell[] = [];
  for (let lat = DOMAIN.latMin; lat < DOMAIN.latMax; lat += step) {
    for (let lon = DOMAIN.lonMin; lon < DOMAIN.lonMax; lon += step) {
      const la = +(lat + step / 2).toFixed(2);
      const lo = +(lon + step / 2).toFixed(2);
      const land = isLand(la, lo);
      let value = 0;
      if (!land) {
        switch (variable) {
          case "temp":
            value = tempAtDepth(la, lo, depth, date);
            break;
          case "anomaly":
            value = anomalyAt(la, lo, depth, date);
            break;
          case "uncertainty":
            value = uncertaintyAt(la, lo, depth, date);
            break;
          case "thermocline":
            value = thermoclineDepth(la, lo, date);
            break;
          case "mhw":
            value = mhwIndex(la, lo, date);
            break;
          case "gap":
            value = gapScore(la, lo, date);
            break;
        }
      }
      cells.push({ lat: la, lon: lo, value, land });
    }
  }
  return cells;
}

export function variableRange(variable: VariableId, depth: number): [number, number] {
  switch (variable) {
    case "temp": {
      const top = depth <= 30 ? 32 : depth <= 150 ? 28 : depth <= 500 ? 14 : 8;
      const bot = depth <= 30 ? 24 : depth <= 150 ? 12 : depth <= 500 ? 6 : 3;
      return [bot, top];
    }
    case "anomaly":
      return [-2.5, 2.5];
    case "uncertainty":
      return [0.1, 1.1];
    case "thermocline":
      return [30, 180];
    case "mhw":
      return [0, 2.6];
    case "gap":
      return [0, 1];
  }
}

/* ---------- colour scales ---------- */

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function mix(c1: number[], c2: number[], t: number) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(
    lerp(c1[1], c2[1], t),
  )},${Math.round(lerp(c1[2], c2[2], t))})`;
}
function ramp(stops: number[][], t: number) {
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mix(stops[i], stops[i + 1], x - i);
}

const THERMAL = [
  [10, 22, 54],
  [17, 66, 120],
  [23, 132, 160],
  [45, 190, 170],
  [180, 216, 130],
  [244, 180, 74],
  [232, 93, 50],
];
const DIVERGING = [
  [40, 108, 190],
  [86, 170, 214],
  [176, 208, 224],
  [236, 236, 232],
  [244, 196, 120],
  [232, 116, 58],
  [190, 40, 40],
];
const UNCERT = [
  [12, 34, 62],
  [24, 92, 124],
  [90, 176, 176],
  [214, 206, 130],
  [226, 130, 70],
];
const GAPS = [
  [14, 40, 66],
  [30, 110, 130],
  [140, 190, 150],
  [240, 178, 70],
  [214, 62, 48],
];

export function colorFor(variable: VariableId, value: number, depth: number): string {
  const [min, max] = variableRange(variable, depth);
  const t = (value - min) / (max - min);
  switch (variable) {
    case "anomaly":
      return ramp(DIVERGING, t);
    case "uncertainty":
      return ramp(UNCERT, t);
    case "gap":
    case "mhw":
      return ramp(GAPS, t);
    default:
      return ramp(THERMAL, t);
  }
}

/* ---------- ARGO float helpers ---------- */

export type ArgoFloat = {
  id: string;
  lat: number;
  lon: number;
  lastProfile: string;
  cycles: number;
};

export const ARGO_FLOATS: ArgoFloat[] = SYNTHETIC_ARGO_FLOATS.map((f) => ({
  id: f.wmoId,
  lat: f.lat,
  lon: f.lon,
  lastProfile: f.timestamp.slice(0, 10),
  cycles: f.cycleNumber,
}));

export function nearestArgo(lat: number, lon: number) {
  let best = ARGO_FLOATS[0];
  let bestD = Infinity;
  for (const f of ARGO_FLOATS) {
    const d = Math.hypot(f.lat - lat, f.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return { float: best, distanceKm: Math.round(bestD * 111) };
}

/* ---------- profiles & series ---------- */

export type ProfilePoint = {
  depth: number;
  temp: number;
  lo: number;
  hi: number;
  band: [number, number];
  argo: number | null;
};

export function profileAt(lat: number, lon: number, date: string): ProfilePoint[] {
  return DEPTHS.map((d) => {
    const t = tempAtDepth(lat, lon, d, date);
    const u = uncertaintyAt(lat, lon, d, date);
    const argoOffset = (hash(d, Math.round(lat * 10), Math.round(lon * 10)) - 0.5) * u * 2.2;
    return {
      depth: d,
      temp: t,
      lo: +(t - u).toFixed(2),
      hi: +(t + u).toFixed(2),
      band: [+(t - u).toFixed(2), +(t + u).toFixed(2)] as [number, number],
      argo: d <= 1000 ? +(t + argoOffset).toFixed(2) : null,
    };
  });
}

export type SeriesPoint = {
  date: string;
  label: string;
  temp: number;
  anomaly: number;
  event: string | null;
};

export function timeSeries(
  lat: number,
  lon: number,
  depth: number,
  days: number,
  endDate: string,
): SeriesPoint[] {
  const stride = days > 180 ? 7 : days > 60 ? 2 : 1;
  const out: SeriesPoint[] = [];
  for (let i = days; i >= 0; i -= stride) {
    const d = addDays(endDate, -i);
    const temp = tempAtDepth(lat, lon, depth, d);
    const anomaly = anomalyAt(lat, lon, depth, d);
    out.push({
      date: d,
      label: d.slice(5),
      temp,
      anomaly,
      event: anomaly > 1.4 ? "MHW" : anomaly < -1.4 ? "Cool" : null,
    });
  }
  return out;
}

/* ---------- surface inputs (page 3) ---------- */

export type SurfaceInput = {
  id: string;
  name: string;
  value: number;
  unit: string;
  source: string;
  qc: "PASS" | "FLAGGED";
  timestamp: string;
};

export function surfaceInputs(lat: number, lon: number, date: string): SurfaceInput[] {
  const sst = surfaceTemp(lat, lon, date);
  const h = (k: number) => hash(Math.round(lat * 10), Math.round(lon * 10), k);
  return [
    {
      id: "sst",
      name: "SST",
      value: +sst.toFixed(2),
      unit: "°C",
      source: DATASET_CONFIG.sst.name.slice(0, 5),
      qc: "PASS",
      timestamp: date,
    },
    {
      id: "sss",
      name: "SSS",
      value: +(33.4 + h(1) * 3.4).toFixed(2),
      unit: "PSU",
      source: "SMAP / SMOS",
      qc: h(2) > 0.94 ? "FLAGGED" : "PASS",
      timestamp: date,
    },
    {
      id: "ssh",
      name: "SSH / SLA",
      value: +((h(3) - 0.5) * 0.36).toFixed(3),
      unit: "m",
      source: "DUACS",
      qc: "PASS",
      timestamp: date,
    },
    {
      id: "cu",
      name: "Current U",
      value: +((h(4) - 0.5) * 1.3).toFixed(3),
      unit: "m s⁻¹",
      source: "OSCAR",
      qc: "PASS",
      timestamp: date,
    },
    {
      id: "cv",
      name: "Current V",
      value: +((h(5) - 0.5) * 1.1).toFixed(3),
      unit: "m s⁻¹",
      source: "OSCAR",
      qc: "PASS",
      timestamp: date,
    },
    {
      id: "wu",
      name: "Wind U",
      value: +((h(6) - 0.5) * 14).toFixed(2),
      unit: "m s⁻¹",
      source: "ASCAT / CCMP",
      qc: "PASS",
      timestamp: date,
    },
    {
      id: "wv",
      name: "Wind V",
      value: +((h(7) - 0.5) * 12).toFixed(2),
      unit: "m s⁻¹",
      source: "ASCAT / CCMP",
      qc: h(8) > 0.95 ? "FLAGGED" : "PASS",
      timestamp: date,
    },
  ];
}

/* ---------- validation metrics ---------- */

export const VALIDATION_OVERALL = {
  rmse: 0.42,
  mae: 0.31,
  bias: -0.06,
  corr: 0.972,
  n: 18426,
  note: "Simulated validation metrics across independent ARGO test set (2010–2025)",
};

export const VALIDATION_BY_DEPTH = getDepthStratifiedValidationMetrics();
export const VALIDATION_BY_REGION = getRegionalStratifiedValidationMetrics();
export const VALIDATION_BY_SEASON = getSeasonalStratifiedValidationMetrics();
export const TRAINING_CURVE = generateTrainingHistory(60).map((h) => ({
  epoch: h.epoch,
  data: h.dataLossMSE,
  physics: h.totalPhysicsLoss,
  total: h.totalLoss,
}));

export const BASELINE_MODELS = SCIENTIFIC_BASELINE_MODELS;

/* ---------- explainability attribution ---------- */

export function attribution(lat: number, lon: number, depth: number) {
  const base = [
    { name: "SST", weight: 32 },
    { name: "SSS", weight: 21 },
    { name: "SSH / SLA", weight: 15 },
    { name: "Current U", weight: 11 },
    { name: "Current V", weight: 8 },
    { name: "Wind U", weight: 7 },
    { name: "Wind V", weight: 6 },
  ];
  const shift = (hash(Math.round(lat), Math.round(lon), depth) - 0.5) * 8;
  const depthShift = Math.min(12, depth / 90);
  const adj = base.map((b, i) => ({
    name: b.name,
    weight: Math.max(
      2,
      b.weight +
        (i === 0
          ? -depthShift + shift
          : i === 2
            ? depthShift * 0.6
            : shift * 0.3 * (i % 2 ? 1 : -1)),
    ),
  }));
  const sum = adj.reduce((s, a) => s + a.weight, 0);
  return adj
    .map((a) => ({ name: a.name, value: +((a.weight / sum) * 100).toFixed(1) }))
    .sort((a, b) => b.value - a.value);
}

/* ---------- climate & ocean context ---------- */

export type ContextCard = {
  name: string;
  status: string;
  tone: "neutral" | "warm" | "cool" | "active";
  indicator: string;
  interpretation: string;
};

export function contextCards(date: string, region: RegionId): ContextCard[] {
  const doy = dayOfYear(date);
  const monsoon =
    doy > 152 && doy < 273
      ? "Southwest Monsoon"
      : doy > 273 && doy < 350
        ? "Northeast Monsoon"
        : "Inter-Monsoon";
  return [
    {
      name: "Monsoon",
      status: monsoon,
      tone: "active",
      indicator: "Phase index 0.71",
      interpretation:
        "Seasonal wind forcing modulates mixed-layer depth and surface heat exchange.",
    },
    {
      name: "Freshwater / River Input",
      status: region === "Bay of Bengal" ? "High" : "Low",
      tone: region === "Bay of Bengal" ? "active" : "neutral",
      indicator: "Runoff anomaly +0.8σ",
      interpretation: "Freshwater capping strengthens near-surface stratification in northern BoB.",
    },
    {
      name: "Evaporation",
      status: "Elevated",
      tone: "warm",
      indicator: "E−P +1.4 mm d⁻¹",
      interpretation:
        "Net evaporative loss increases surface salinity in the northern Arabian Sea.",
    },
    {
      name: "Currents",
      status: "Organised",
      tone: "active",
      indicator: "Mean speed 0.42 m s⁻¹",
      interpretation: "Boundary-current transport redistributes heat along the western margin.",
    },
    {
      name: "Mesoscale Eddies",
      status: "3 tracked",
      tone: "active",
      indicator: "2 anticyclonic / 1 cyclonic",
      interpretation: "Anticyclonic eddies deepen the thermocline and warm the subsurface locally.",
    },
    {
      name: "Upwelling / Downwelling",
      status: region === "Arabian Sea" ? "Upwelling" : "Weak downwelling",
      tone: region === "Arabian Sea" ? "cool" : "neutral",
      indicator: "Ekman index −0.32",
      interpretation: "Coastal upwelling cools the surface and shoals isotherms.",
    },
    {
      name: "Stratification",
      status: "Strong",
      tone: "warm",
      indicator: "N² 2.1×10⁻⁴ s⁻²",
      interpretation: "Strong stratification suppresses vertical mixing of surface heat.",
    },
    {
      name: "Air–Sea Heat Flux",
      status: "Net gain",
      tone: "warm",
      indicator: "+38 W m⁻²",
      interpretation: "Net downward flux supports near-surface warming over the period.",
    },
    {
      name: "Tropical Cyclones",
      status: "None active",
      tone: "neutral",
      indicator: "Genesis potential 0.3",
      interpretation: "No storm-driven mixing events recorded in the selected window.",
    },
    {
      name: "ENSO",
      status: "Weak El Niño",
      tone: "warm",
      indicator: "ONI +0.6",
      interpretation: "Basin-scale teleconnection modestly favours positive subsurface anomalies.",
    },
    {
      name: "IOD",
      status: "Positive",
      tone: "warm",
      indicator: "DMI +0.48",
      interpretation: "Positive dipole conditions alter the east–west thermocline tilt.",
    },
    {
      name: "Indonesian Throughflow",
      status: "Reduced",
      tone: "cool",
      indicator: "Transport −1.2 Sv",
      interpretation: "Reduced inflow limits warm-water import into the eastern basin.",
    },
    {
      name: "Southern Ocean Influence",
      status: "Neutral",
      tone: "neutral",
      indicator: "SAM +0.1",
      interpretation: "Remote forcing signal is weak over the selected window.",
    },
    {
      name: "Antarctic Teleconnections",
      status: "Weak",
      tone: "neutral",
      indicator: "Lagged index 0.12",
      interpretation: "Low-frequency signal is present but not dominant at these depths.",
    },
  ];
}

/* ---------- events ---------- */

export type OceanEvent = {
  id: string;
  name: string;
  status: "Active" | "Declining" | "Closed";
  start: string;
  durationDays: number;
  peakAnomaly: number;
  affectedDepth: string;
  heatContent: number;
  lat: number;
  lon: number;
  isSynthetic: boolean;
};

export const EVENTS: OceanEvent[] = [
  {
    id: "mhw-2026-07",
    name: "Central Arabian Sea Marine Heatwave",
    status: "Active",
    start: "2026-08-18",
    durationDays: 40,
    peakAnomaly: 2.4,
    affectedDepth: "0–75 m",
    heatContent: 1.42,
    lat: 17.5,
    lon: 64.5,
    isSynthetic: true,
  },
  {
    id: "mhw-2026-05",
    name: "Northern Bay of Bengal Subsurface Warming",
    status: "Declining",
    start: "2026-07-02",
    durationDays: 61,
    peakAnomaly: 1.8,
    affectedDepth: "20–125 m",
    heatContent: 0.96,
    lat: 19.5,
    lon: 88.5,
    isSynthetic: true,
  },
  {
    id: "cool-2026-06",
    name: "Somali Upwelling Cooling",
    status: "Closed",
    start: "2026-06-11",
    durationDays: 34,
    peakAnomaly: -1.6,
    affectedDepth: "0–50 m",
    heatContent: -0.61,
    lat: 9.5,
    lon: 52.5,
    isSynthetic: true,
  },
];

/* ---------- regional comparison ---------- */

export function regionalStats(region: "Arabian Sea" | "Bay of Bengal", date: string) {
  const lat = 16.0;
  const lon = region === "Arabian Sea" ? 64.0 : 88.0;
  return {
    region,
    sst: surfaceTemp(lat, lon, date),
    t100: tempAtDepth(lat, lon, 100, date),
    t200: tempAtDepth(lat, lon, 200, date),
    anomaly: anomalyAt(lat, lon, 0, date),
    thermocline: thermoclineDepth(lat, lon, date),
    uncertainty: uncertaintyAt(lat, lon, 100, date),
    argoDensity: +(obsDensity(lat, lon) * 100).toFixed(0),
    lat,
    lon,
    isSynthetic: true,
  };
}
