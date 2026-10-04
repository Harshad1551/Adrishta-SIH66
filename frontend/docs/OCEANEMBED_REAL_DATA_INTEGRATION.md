# OceanEmbed Real-Data & Model Integration Guide

This guide describes how to connect the OceanEmbed platform to live/archived satellite data streams, Copernicus Marine reanalysis, in-situ ARGO profiling arrays, and a real PyTorch / FastAPI / ONNX model server.

---

## 1. Architectural Overview

```
[Satellite Data Providers]        [GLORYS12V1 Reanalysis]       [ARGO GDAC / In-Situ]
OSTIA, SMAP, DUACS, OSCAR, ASCAT            │                             │
              │                             │ (Supervision Only)          │ (Post-Hoc Eval Only)
              ▼                             ▼                             ▼
   [Data Adapter Layer]            [Training Pipeline]           [Validation Service]
(src/lib/ocean/data/adapters)   (src/lib/ocean/data/samples)  (src/lib/ocean/validation)
              │                             │                             │
              ▼                             ▼                             │
    [QC & Harmonization]            [Model Weights]                       │
 (0.25° regular daily grid)       (PyTorch / ONNX)                        │
              │                             │                             │
              ▼                             │                             │
     [7-Channel Tensor]                     │                             │
              │                             │                             │
              └──────────────► [Inference Client] ◄───────────────────────┘
                           (src/lib/ocean/model/client.ts)
                                            │
                                            ▼
                          [15-Depth Reconstructed Field]
                                            │
                                            ▼
                         [OceanEmbed User Experience / UI]
```

---

## 2. Step 1: Connecting Surface Observation Adapters

Located in `src/lib/ocean/data/adapters/`:

### A. Sea Surface Temperature (SST) — `sst.ts`

- **Source**: UK Met Office OSTIA via CMEMS API (`SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001`)
- **Integration**: Update `fetchSST(lat, lon, date, mode="real")` to fetch the netCDF/zarr slice or query your intermediate raster tile server:

```typescript
if (mode === "real") {
  const res = await fetch(`${API_BASE}/sst?lat=${lat}&lon=${lon}&date=${date}`);
  const json = await res.json();
  return { ...json, isSynthetic: false };
}
```

### B. Sea Surface Salinity (SSS) — `sss.ts`

- **Source**: SMAP/SMOS L4 SSS (`MULTIOBS_GLO_PHY_SSS_L4_MYNRT_015_015`)
- **Integration**: Connect to NASA PO.DAAC Drive or CMEMS WMS/API.

### C. Sea Surface Height Anomaly (SSH / SLA) — `ssh.ts`

- **Source**: CMEMS DUACS Gridded SLA (`SEALEVEL_GLO_PHY_L4_NRT_OBSERVATIONS_008_046`)
- **Integration**: Ingest daily 0.25° absolute dynamic topography and SLA maps.

### D. Surface Currents (U, V) — `currents.ts`

- **Source**: OSCAR (NASA Earth & Space Research) / CMEMS Global Total Surface Currents
- **Integration**: Retrieve zonal ($u$) and meridional ($v$) velocity fields.

### E. Surface Winds (U, V) — `winds.ts`

- **Source**: ASCAT / CCMP (Cross-Calibrated Multi-Platform 10m Neutral Winds)
- **Integration**: Ingest EUMETSAT daily scatterometer composites.

---

## 3. Step 2: Connecting the Real ML Inference Server

The frontend client abstraction is ready in `src/lib/ocean/model/client.ts`.

### Expected Backend API Specification (FastAPI / TorchServe / ONNX Runtime):

```http
POST /v1/predict
Content-Type: application/json

{
  "date": "2026-09-27",
  "lat": 15.25,
  "lon": 65.25,
  "normalized_vector": [0.42, 0.15, -0.08, 0.22, -0.11, 0.85, 0.44],
  "valid_mask": [true, true, true, true, true, true, true]
}
```

### Expected JSON Response:

```json
{
  "date": "2026-09-27",
  "lat": 15.25,
  "lon": 65.25,
  "depths": [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000],
  "temperatures": [
    28.45, 28.4, 28.32, 28.15, 27.9, 26.4, 23.1, 19.8, 16.5, 14.2, 11.4, 9.2, 6.8, 5.1, 4.1
  ],
  "uncertainties": [
    0.18, 0.19, 0.21, 0.24, 0.28, 0.45, 0.62, 0.78, 0.65, 0.48, 0.32, 0.25, 0.22, 0.2, 0.19
  ],
  "confidence_score": 88,
  "confidence_category": "HIGH CONFIDENCE",
  "latent_vector": [/* 256 float values */],
  "model_version": "OceanEmbed-v1.0.0-CNN-Phys",
  "diagnostics": {
    "missingChannelsFlagged": [],
    "degradedConfidencePenaltyApplied": false,
    "physicsLossPenalty": 0.014
  }
}
```

Set the environment variable in your `.env`:

```env
OCEANEMBED_API_URL=https://api.oceanembed.your-institution.org
```

---

## 4. Step 3: Ingesting Real ARGO Float Profiles for Validation

Located in `src/lib/ocean/data/adapters/argo.ts`:

1. Mirror the Coriolis GDAC or US-GODAE FTP/HTTP repository (`ftp://ftp.ifremer.fr/ifremer/argo/dac/`).
2. Filter profiles for the North Indian Ocean bounding box (`5°N–30°N, 45°E–105°E`).
3. Retain only measurements where quality control flags satisfy `QC_FLAG == 1` (good data).
4. Feed parsed profiles into `collocateArgoMatchup()` in `src/lib/ocean/validation/argoValidation.ts`.

---

## 5. Step 4: Switching Operating Modes

Toggle between **MOCK MODE** (deterministic synthetic data for local testing) and **REAL-DATA MODE** (live feeds):

- Use the toggle switch in the desktop sidebar or mobile drawer.
- Or initialize programmatically in `src/lib/ocean/state.tsx`.
