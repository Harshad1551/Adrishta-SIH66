"""
Base Data Adapter with Strict Quality Control & Authoritative Regridding
Enforces zero silent mock data substitution.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Tuple
import numpy as np
from scipy.interpolate import RegularGridInterpolator

from pipeline.grid_spec import (
    GRID_LATS,
    GRID_LONS,
    NUM_LATS,
    NUM_LONS,
    GRID_SHAPE,
    CHANNEL_SPECS,
    QC_FLAG_GOOD,
    QC_FLAG_DEGRADED,
    QC_FLAG_OUT_OF_BOUNDS,
    QC_FLAG_MISSING,
)


@dataclass
class AdapterResult:
    channel: str
    data: np.ndarray             # shape [101, 241], float32
    qc_mask: np.ndarray          # shape [101, 241], uint8
    timestamp: str               # ISO 8601 UTC
    units: str
    source: str
    dataset_version: str
    status: str                  # "AVAILABLE", "DEGRADED", "MISSING"
    coverage_pct: float          # Percentage of valid oceanic pixels
    missing_reason: Optional[str] = None


class BaseSurfaceAdapter(ABC):
    def __init__(self, channel_name: str):
        if channel_name not in CHANNEL_SPECS:
            raise ValueError(f"Unknown channel {channel_name}. Must be in {list(CHANNEL_SPECS.keys())}")
        self.channel = channel_name
        self.spec = CHANNEL_SPECS[channel_name]

    @abstractmethod
    def read_file(self, filepath: str, date_str: str) -> AdapterResult:
        """Reads NetCDF / Zarr file and regrids to authoritative NIO 0.25 deg mesh."""
        pass

    def create_missing_result(self, date_str: str, reason: str) -> AdapterResult:
        """
        Creates an explicit MISSING result.
        REAL MODE MUST NEVER SILENTLY GENERATE SYNTHETIC NUMBERS.
        """
        data = np.full(GRID_SHAPE, np.nan, dtype=np.float32)
        qc_mask = np.full(GRID_SHAPE, QC_FLAG_MISSING, dtype=np.uint8)

        return AdapterResult(
            channel=self.channel,
            data=data,
            qc_mask=qc_mask,
            timestamp=f"{date_str}T00:00:00Z",
            units=self.spec["units"],
            source=self.spec["source_reference"],
            dataset_version="N/A",
            status="MISSING",
            coverage_pct=0.0,
            missing_reason=reason,
        )

    def regrid_and_qc(
        self,
        raw_data: np.ndarray,
        raw_lats: np.ndarray,
        raw_lons: np.ndarray,
        date_str: str,
        version: str = "v1.0",
    ) -> AdapterResult:
        """
        Regrids 2D raw satellite observation onto the authoritative 101 x 241 grid
        and applies physical range QC.
        """
        # 1. Clean fill values (1e20, -999, etc.)
        cleaned = np.array(raw_data, dtype=np.float32)
        cleaned[cleaned > 1e10] = np.nan
        cleaned[cleaned < -500.0] = np.nan

        # 2. Coordinate normalization
        raw_lats = np.asarray(raw_lats, dtype=np.float32)
        raw_lons = np.asarray(raw_lons, dtype=np.float32)

        # Ensure latitudes are strictly ascending
        if raw_lats[0] > raw_lats[-1]:
            raw_lats = raw_lats[::-1]
            cleaned = cleaned[::-1, :]

        # Ensure longitudes are [-180, 180] or [0, 360] normalized to [45, 105]
        if np.any(raw_lons > 180.0):
            raw_lons = np.where(raw_lons > 180.0, raw_lons - 360.0, raw_lons)
            sort_idx = np.argsort(raw_lons)
            raw_lons = raw_lons[sort_idx]
            cleaned = cleaned[:, sort_idx]

        # 3. Spatial Interpolation onto Authoritative 101 x 241 Grid
        try:
            interp = RegularGridInterpolator(
                (raw_lats, raw_lons),
                cleaned,
                method="linear",
                bounds_error=False,
                fill_value=np.nan,
            )
            # Create query mesh
            lat_grid, lon_grid = np.meshgrid(GRID_LATS, GRID_LONS, indexing="ij")
            pts = np.stack([lat_grid.ravel(), lon_grid.ravel()], axis=-1)
            regridded = interp(pts).reshape(GRID_SHAPE).astype(np.float32)
        except Exception as e:
            return self.create_missing_result(date_str, f"Interpolation failed: {str(e)}")

        # 4. Quality Control Flagging
        valid_min = self.spec["valid_min"]
        valid_max = self.spec["valid_max"]

        qc_mask = np.full(GRID_SHAPE, QC_FLAG_GOOD, dtype=np.uint8)

        # Missing values
        nan_mask = np.isnan(regridded)
        qc_mask[nan_mask] = QC_FLAG_MISSING

        # Physical out of bounds
        out_of_bounds = (~nan_mask) & ((regridded < valid_min) | (regridded > valid_max))
        qc_mask[out_of_bounds] = QC_FLAG_OUT_OF_BOUNDS
        regridded[out_of_bounds] = np.nan  # Mask non-physical values

        # Calculate oceanic coverage percentage
        valid_count = np.sum(qc_mask == QC_FLAG_GOOD)
        total_count = NUM_LATS * NUM_LONS
        coverage_pct = round(float(valid_count / total_count * 100.0), 2)

        status = "AVAILABLE" if coverage_pct >= 40.0 else "DEGRADED" if coverage_pct > 0 else "MISSING"

        return AdapterResult(
            channel=self.channel,
            data=regridded,
            qc_mask=qc_mask,
            timestamp=f"{date_str}T00:00:00Z",
            units=self.spec["units"],
            source=self.spec["source_reference"],
            dataset_version=version,
            status=status,
            coverage_pct=coverage_pct,
        )
