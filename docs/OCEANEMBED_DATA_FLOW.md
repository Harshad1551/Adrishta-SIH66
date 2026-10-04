# OceanEmbed / ADRISHTA: End-to-End Data Flow Architecture

This document maps the complete data lifecycle of the OceanEmbed system, from raw satellite constellations and reanalysis products down to the deep learning inference engine, independent in-situ validation, and the scientific user interface.

---

## 1. High-Level Data Flow Diagram

```mermaid
flowchart TD
    subgraph RawSources["1. Raw Earth Observation & Reanalysis Sources"]
        SST_src["NOAA OISST v2.1 (0.25? Daily)"]
        SSS_src["SMAP L4 Salinity (0.25? 8-day)"]
        SSH_src["Copernicus CMEMS Gridded Altimetry"]
        CUR_src["CMEMS Geostrophic & Ekman (U/V)"]
        WND_src["MetOp ASCAT 10m Wind (U/V)"]
        GLORYS_src["Copernicus GLORYS12V1 3D Reanalysis"]
        ARGO_src["International Argo Programme (Coriolis GDAC)"]
    end

    subgraph IngestionQC["2. Ingestion, QC & Harmonization Pipeline"]
        Adapters["Multi-Source Ingestion Adapters (pipeline/adapters/)"]
        QCEngine["Physical Bound & Quality Control Engine (pipeline/qc_engine.py)"]
        Regrid["Mesh Regridding to NIO 0.25? (101 x 241)"]
        QCFlags["Stacked 7-Channel QC Bitmask Array"]
    end

    subgraph Storage["3. Canonical Zarr Storage (data/zarr/)"]
        ZarrSurface["surface_harmonized_2024-05-15.zarr
(7, 101, 241) Float32 + QC Bitmask"]
        ZarrTarget["glorys_target_2024-05-15.zarr
(15, 101, 241) 15 INCOIS Standard Depths"]
    end

    subgraph DeepLearning["4. Deep Neural Network (GLORYS/backend/model/)"]
        Encoder["ResNet-34 2D Convolutional Spatial Encoder"]
        Latent["256-Dimensional Physical Ocean Embedding"]
        Decoder["Multi-Layer Perceptron Vertical Physics Decoder"]
        Loss["Multi-Objective Loss: L_data + L_mono + L_lapse + L_deep"]
        Checkpoints["Trained Checkpoints (checkpoints/oceanembed_*.pt)"]
    end

    subgraph OperationalInference["5. Real-Time Inference & Diagnostics (FastAPI Port 8000)"]
        ProfileAPI["GET /api/v1/reconstruction/profile (15 depths)"]
        GridAPI["GET /api/v1/reconstruction/grid (0.25? field)"]
        PhysicsAPI["Derived Physics Engine (Mackenzie Sound, EOS-80 Density, MLD, OHC)"]
        DiagnosticsAPI["Transects, MHW Hobday Detector, 3D Voxels"]
    end

    subgraph IndependentValidation["6. Independent In-Situ Ground Truth Validation"]
        ArgoAdapter["ARGO Coriolis NetCDF Ingestion (66 Real Floats)"]
        Collocation["Space-Time Collocation Engine (dt < 24h, dr < 25km)"]
        Metrics["Actual Array Metrics: RMSE 4.23?C, R? 0.952, r 0.976"]
    end

    subgraph ScientificUI["7. Scientific User Interface (TanStack React Port 8080)"]
        Nav1["01 Overview: Basin Map, Anomaly, Freshness"]
        Nav2["02 Explore: 0.25? Field, Transects, 3D Voxels"]
        Nav3["03 Validate: In-Situ Floats vs AI Predictions"]
        Nav4["04 Intelligence: MLD, Thermocline, Gap Priority"]
        Nav5["05 Events & Context: Monsoonal Dynamics, Heatwaves"]
        Nav6["06 Assistant: Natural Language Scientific Queries"]
        Nav7["07 Research: Neural Specs, Loss Curves, Lineage"]
    end

    %% Connections
    SST_src & SSS_src & SSH_src & CUR_src & WND_src --> Adapters
    Adapters --> QCEngine --> Regrid --> QCFlags --> ZarrSurface
    GLORYS_src --> ZarrTarget

    ZarrSurface & ZarrTarget --> DeepLearning
    Encoder --> Latent --> Decoder --> Loss --> Checkpoints

    Checkpoints --> OperationalInference
    OperationalInference --> ScientificUI

    ARGO_src --> ArgoAdapter --> Collocation
    Checkpoints --> Collocation --> Metrics --> Nav3
```

---

## 2. Detailed Pipeline Stages

### Stage 1: Multi-Sensor Surface Ingestion
- **Channel 0 (SST)**: Calibrated sea surface temperature in ?C from daily microwave and infrared blend.
- **Channel 1 (SSS)**: Practical salinity in PSU from SMAP radiometer.
- **Channel 2 (SSH/SLA)**: Sea level anomaly in meters from multi-satellite altimetric constellation.
- **Channels 3 & 4 (Current U & V)**: Zonal and meridional surface velocities in m/s (geostrophic + Ekman dynamics).
- **Channels 5 & 6 (Wind U & V)**: Zonal and meridional 10-meter neutral equivalent wind stress in m/s from scatterometer.

### Stage 2: Quality Control & Standardization
- Each input cell is checked against rigorous physical limits.
- Values failing quality checks or masked by bathymetry are assigned a QC bit flag and masked.
- Standardized tensor dimension: `(7, 101, 241)` representing $5^\circ	ext{N}?30^\circ	ext{N}$, $45^\circ	ext{E}?105^\circ	ext{E}$ at $0.25^\circ$ spacing.

### Stage 3: Supervised Training vs. Independent Validation Pathway
- **GLORYS12V1 Path (Supervised Target Only)**: Continuous 3D hydrographic reanalysis used exclusively during model backpropagation to establish initial physical embeddings.
- **ARGO Path (Independent Evaluation Only)**: Autonomous profiling CTD floats strictly reserved for post-hoc validation. They are never ingested during training, ensuring zero data leakage.

### Stage 4: Neural Embedding & Reconstruction
- The 7-channel surface tensor is mapped into a 256-dimensional compact embedding vector.
- The physics-guided vertical decoder predicts temperatures across the 15 standard depths ($0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000	ext{ m}$).
- Physics regularizers penalize negative thermal stratification, excessive lapse rates, and abyssal temperature drift.

### Stage 5: Scientific Serving & Operational Interface
- The FastAPI application serves low-latency inferences, vertical transects, and acoustic sound velocity profiles.
- The TanStack React frontend displays operational intelligence without developer clutter, directing ML architecture specifics to the dedicated Research console.
