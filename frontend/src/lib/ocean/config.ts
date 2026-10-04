/**
 * OceanEmbed — Project Configuration, Data Provenance & Model Versioning
 */

export const VERSION_CONFIG = {
  modelVersion: "OceanEmbed-v1.0.0-CNN-Phys",
  datasetVersion: "NIO-Daily-0.25deg-v2026.09",
  preprocessingVersion: "QC-Harmonize-v1.4",
  gridVersion: "NIO-0.25-L15-v1",
  embeddingDimension: 256,
  physicsLossLambda: 0.35,
  climatologyBaselinePeriod: "1993–2020",
} as const;

export type DatasetRole =
  "Surface Input" | "Training Target / Reference" | "Independent Evaluation";

export interface DatasetSourceConfig {
  id: string;
  name: string;
  variable: string;
  units: string;
  provider: string;
  resolution: string;
  temporalCadence: string;
  role: DatasetRole;
  qcProcedure: string;
  citation: string;
}

export const DATASET_CONFIG: Record<string, DatasetSourceConfig> = {
  sst: {
    id: "sst",
    name: "OSTIA (Operational Sea Surface Temperature and Ice Analysis)",
    variable: "Sea Surface Temperature (SST)",
    units: "°C",
    provider: "UK Met Office / Copernicus Marine (CMEMS)",
    resolution: "0.05° native → interpolated to 0.25°",
    temporalCadence: "Daily (00:00 UTC)",
    role: "Surface Input",
    qcProcedure: "Bi-linear regridding, gross range check [-2.0, 36.0°C], land mask",
    citation: "Donlon et al., 2012",
  },
  sss: {
    id: "sss",
    name: "SMAP / SMOS Combined L4 SSS",
    variable: "Sea Surface Salinity (SSS)",
    units: "PSU",
    provider: "NASA JPL / ESA",
    resolution: "0.25° gridded 8-day running mean",
    temporalCadence: "Daily composite",
    role: "Surface Input",
    qcProcedure: "RFI noise filtration, coastal proximity masking (<50 km)",
    citation: "Fore et al., 2016",
  },
  ssh: {
    id: "ssh",
    name: "DUACS Multi-Mission Altimeter Gridded Sea Level Anomaly",
    variable: "Sea Surface Height Anomaly (SSHA / SLA)",
    units: "m",
    provider: "Copernicus Marine / CLS",
    resolution: "0.25° regular grid",
    temporalCadence: "Daily",
    role: "Surface Input",
    qcProcedure: "Optimal interpolation, dynamic atmospheric correction",
    citation: "Pujol et al., 2016",
  },
  current_u: {
    id: "current_u",
    name: "OSCAR / CMEMS Surface Current (U-Component)",
    variable: "Zonal Surface Current (u)",
    units: "m s⁻¹",
    provider: "NASA Earth & Space Research / CMEMS",
    resolution: "0.25° daily collocated",
    temporalCadence: "Daily",
    role: "Surface Input",
    qcProcedure: "Geostrophic balance + Stommel-Ekman wind drift correction",
    citation: "Bonjean & Lagerloef, 2002",
  },
  current_v: {
    id: "current_v",
    name: "OSCAR / CMEMS Surface Current (V-Component)",
    variable: "Meridional Surface Current (v)",
    units: "m s⁻¹",
    provider: "NASA Earth & Space Research / CMEMS",
    resolution: "0.25° daily collocated",
    temporalCadence: "Daily",
    role: "Surface Input",
    qcProcedure: "Geostrophic balance + Stommel-Ekman wind drift correction",
    citation: "Bonjean & Lagerloef, 2002",
  },
  wind_u: {
    id: "wind_u",
    name: "ASCAT / CCMP Surface Neutral Wind (U-Component)",
    variable: "Zonal 10m Neutral Wind (u10)",
    units: "m s⁻¹",
    provider: "EUMETSAT / NASA Remote Sensing Systems",
    resolution: "0.25° daily mean",
    temporalCadence: "Daily",
    role: "Surface Input",
    qcProcedure: "Cross-calibrated scatterometer vectors with variational analysis",
    citation: "Atlas et al., 2011",
  },
  wind_v: {
    id: "wind_v",
    name: "ASCAT / CCMP Surface Neutral Wind (V-Component)",
    variable: "Meridional 10m Neutral Wind (v10)",
    units: "m s⁻¹",
    provider: "EUMETSAT / NASA Remote Sensing Systems",
    resolution: "0.25° daily mean",
    temporalCadence: "Daily",
    role: "Surface Input",
    qcProcedure: "Cross-calibrated scatterometer vectors with variational analysis",
    citation: "Atlas et al., 2011",
  },
  glorys: {
    id: "glorys",
    name: "GLORYS12V1 Global Ocean Reanalysis",
    variable: "3D Subsurface Ocean Temperature & Hydrography",
    units: "°C",
    provider: "Mercator Ocean International / Copernicus Marine",
    resolution: "1/12° (~8 km), 50 vertical levels",
    temporalCadence: "Daily mean",
    role: "Training Target / Reference",
    qcProcedure:
      "NEMO-based reanalysis with SEEK EnKF assimilation (Used ONLY for Model Training Loss)",
    citation: "Jean-Michel et al., 2021",
  },
  argo: {
    id: "argo",
    name: "International Argo Float Array (In-Situ CTD)",
    variable: "In-Situ CTD Vertical Temperature Profiles",
    units: "°C",
    provider: "International Argo Programme / US-GODAE / Coriolis GDAC",
    resolution: "Autonomous profiling floats (0–2000 m)",
    temporalCadence: "5–10 day profiling cycles",
    role: "Independent Evaluation",
    qcProcedure: "Delayed-mode real-time QC flag = 1 (Zero Model Leakage, Independent Matchups)",
    citation: "Roemmich et al., 2009",
  },
};

export const DATA_SPLITS = {
  train: {
    name: "Training Partition",
    period: "2024-01-07 to 2024-12-29",
    target: "GLORYS12V1 Supervised Target",
    description: "52 weekly synoptic snapshots for deep ocean embedding & physics-constrained loss training",
  },
  validation: {
    name: "Audited Statistical OOS Holdout",
    period: "2025-01-05 to 2025-12-28",
    target: "GLORYS12V1 Reanalysis Target",
    description: "52 weekly synoptic snapshots reserved for out-of-sample statistical benchmarking",
  },
  operational: {
    name: "Operational Synoptic Data",
    period: "2026-01-04 to 2026-10-03",
    target: "Operational Synoptic Store",
    description: "38 weekly operational snapshots providing real-time subsurface ocean state inference",
  },
  independentArgo: {
    name: "Independent ARGO In-Situ Validation",
    period: "Historical Benchmark & Daily Operational In-Situ Validation (134 profiles up to 2026-10-03)",
    target: "Autonomous In-Situ CTD Floats",
    description: "Zero-leakage independent verification against physical float soundings (never seen during training or loss)",
  },
} as const;
