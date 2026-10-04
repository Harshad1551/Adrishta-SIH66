"""
Authoritative Grid & Channel Specification for OceanEmbed (INCOIS SIH-01)
Single source of truth across Data Ingestion, Zarr Storage, Model Training,
Inference, and Frontend API.
"""

from typing import Dict, List, Tuple
import numpy as np

# 1. Spatial Domain: North Indian Ocean (NIO)
LAT_MIN: float = 5.0
LAT_MAX: float = 30.0
LON_MIN: float = 45.0
LON_MAX: float = 105.0
RESOLUTION: float = 0.25

# Explicit coordinates (101 x 241 points)
GRID_LATS: np.ndarray = np.arange(LAT_MIN, LAT_MAX + 0.001, RESOLUTION, dtype=np.float32)
GRID_LONS: np.ndarray = np.arange(LON_MIN, LON_MAX + 0.001, RESOLUTION, dtype=np.float32)

NUM_LATS: int = len(GRID_LATS)  # Exactly 101
NUM_LONS: int = len(GRID_LONS)  # Exactly 241
GRID_SHAPE: Tuple[int, int] = (NUM_LATS, NUM_LONS)

# 2. Vertical Dimension: 15 INCOIS Standard Depths (meters)
STANDARD_DEPTHS: List[int] = [
    0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000
]
NUM_DEPTHS: int = len(STANDARD_DEPTHS)  # Exactly 15

# 3. Canonical Seven Surface Channels
CHANNELS: List[str] = [
    "sst",
    "sss",
    "ssh",
    "current_u",
    "current_v",
    "wind_u",
    "wind_v",
]

# Physical bounds for validation & range checking
CHANNEL_SPECS: Dict[str, Dict] = {
    "sst": {
        "label": "Sea Surface Temperature",
        "units": "degC",
        "valid_min": 15.0,
        "valid_max": 36.0,
        "fill_value": np.nan,
        "source_reference": "OSTIA / Copernicus (doi:10.48670/moi-00168)",
    },
    "sss": {
        "label": "Sea Surface Salinity",
        "units": "PSU",
        "valid_min": 20.0,
        "valid_max": 42.0,
        "fill_value": np.nan,
        "source_reference": "SMAP / Copernicus (doi:10.48670/moi-00051)",
    },
    "ssh": {
        "label": "Sea Surface Height / Absolute Dynamic Topography",
        "units": "m",
        "valid_min": -2.5,
        "valid_max": 2.5,
        "fill_value": np.nan,
        "source_reference": "DUACS / Copernicus (doi:10.48670/moi-00145)",
    },
    "current_u": {
        "label": "Zonal Surface Current (Eastward)",
        "units": "m/s",
        "valid_min": -4.0,
        "valid_max": 4.0,
        "fill_value": np.nan,
        "source_reference": "NASA OSCAR / Copernicus (doi:10.5067/OSCAR-25I01)",
    },
    "current_v": {
        "label": "Meridional Surface Current (Northward)",
        "units": "m/s",
        "valid_min": -4.0,
        "valid_max": 4.0,
        "fill_value": np.nan,
        "source_reference": "NASA OSCAR / Copernicus (doi:10.5067/OSCAR-25I01)",
    },
    "wind_u": {
        "label": "10-meter Zonal Wind (Eastward)",
        "units": "m/s",
        "valid_min": -45.0,
        "valid_max": 45.0,
        "fill_value": np.nan,
        "source_reference": "NASA CCMP / Copernicus (doi:10.5067/CCMP2-014D)",
    },
    "wind_v": {
        "label": "10-meter Meridional Wind (Northward)",
        "units": "m/s",
        "valid_min": -45.0,
        "valid_max": 45.0,
        "fill_value": np.nan,
        "source_reference": "NASA CCMP / Copernicus (doi:10.5067/CCMP2-014D)",
    },
}

# 4. Strict Quality Control Flags (uint8)
QC_FLAG_GOOD: int = 1         # Valid in-range physical observation
QC_FLAG_DEGRADED: int = 2     # Interpolated or boundary flag
QC_FLAG_OUT_OF_BOUNDS: int = 3 # Exceeds physical bounds
QC_FLAG_LAND: int = 4         # Masked land point
QC_FLAG_MISSING: int = 5      # Missing observation (NEVER synthetic in Real Mode)
