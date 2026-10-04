"""
GLORYS12V1 Supervised Training Target Adapter (Phase 3)
Role: TRAINING TARGET & REANALYSIS REFERENCE ONLY.
CRITICAL: Never treat GLORYS as independent validation when used for model loss supervision.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np
import scipy.interpolate as interp
import xarray as xr
import zarr

from pipeline.grid_spec import (
    GRID_LATS,
    GRID_LONS,
    NUM_LATS,
    NUM_LONS,
    GRID_SHAPE,
    STANDARD_DEPTHS,
    NUM_DEPTHS,
)


class GLORYSTargetAdapter:
    def __init__(self, output_dir: str = "data/zarr"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.standard_depths = np.array(STANDARD_DEPTHS, dtype=np.float32)

    def process_glorys_file(
        self,
        filepath: str,
        date_str: str,
    ) -> Path:
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"GLORYS target file not found at: {filepath}")

        with xr.open_dataset(str(path)) as ds:
            temp_var = None
            for cand in ["thetao", "temperature", "temp", "pot_temp"]:
                if cand in ds.variables:
                    temp_var = cand
                    break

            if not temp_var:
                raise ValueError(f"Could not find 3D temperature variable in {list(ds.variables.keys())}")

            raw_temp = ds[temp_var].squeeze().values
            lat_name = "lat" if "lat" in ds.coords else "latitude"
            lon_name = "lon" if "lon" in ds.coords else "longitude"
            depth_name = "depth" if "depth" in ds.coords else "deptht" if "deptht" in ds.coords else "level"

            raw_lats = ds[lat_name].values
            raw_lons = ds[lon_name].values
            raw_depths = ds[depth_name].values

            if np.nanmean(raw_temp) > 200.0:
                raw_temp = raw_temp - 273.15

            regridded_3d = self._regrid_3d_to_incois_spec(
                raw_temp, raw_depths, raw_lats, raw_lons
            )

            out_zarr = self.output_dir / f"glorys_target_{date_str}.zarr"
            root = zarr.open_group(str(out_zarr), mode="w")

            root.attrs["role"] = "SUPERVISED_TRAINING_TARGET_ONLY"
            root.attrs["validation_use_prohibited"] = True
            root.attrs["dataset"] = "CMEMS GLORYS12V1 Ocean Reanalysis"
            root.attrs["doi"] = "10.48670/moi-00021"
            root.attrs["date"] = date_str
            root.attrs["target_variable"] = "subsurface_temperature"
            root.attrs["units"] = "degC"
            root.attrs["depths_m"] = STANDARD_DEPTHS
            root.attrs["resolution_deg"] = 0.25
            root.attrs["created_at"] = datetime.utcnow().isoformat() + "Z"

            root["depth"] = self.standard_depths
            root["lat"] = GRID_LATS
            root["lon"] = GRID_LONS
            root["temperature_target"] = regridded_3d.astype(np.float32)
            root["ocean_mask"] = (~np.isnan(regridded_3d)).astype(np.uint8)

            print(f"[OK] Exported GLORYS Target Zarr: {out_zarr} (Shape: {regridded_3d.shape})")
            return out_zarr

    def _regrid_3d_to_incois_spec(
        self,
        raw_temp: np.ndarray,
        raw_depths: np.ndarray,
        raw_lats: np.ndarray,
        raw_lons: np.ndarray,
    ) -> np.ndarray:
        if raw_lats[0] > raw_lats[-1]:
            raw_lats = raw_lats[::-1]
            raw_temp = raw_temp[:, ::-1, :]

        if np.any(raw_lons > 180.0):
            raw_lons = np.where(raw_lons > 180.0, raw_lons - 360.0, raw_lons)
            sort_idx = np.argsort(raw_lons)
            raw_lons = raw_lons[sort_idx]
            raw_temp = raw_temp[:, :, sort_idx]

        n_depths, n_raw_lat, n_raw_lon = raw_temp.shape
        temp_at_15_depths = np.full((NUM_DEPTHS, n_raw_lat, n_raw_lon), np.nan, dtype=np.float32)

        for d_idx, target_d in enumerate(self.standard_depths):
            if target_d in raw_depths:
                src_idx = np.where(raw_depths == target_d)[0][0]
                temp_at_15_depths[d_idx] = raw_temp[src_idx]
            else:
                below_indices = np.where(raw_depths <= target_d)[0]
                above_indices = np.where(raw_depths >= target_d)[0]
                if len(below_indices) > 0 and len(above_indices) > 0:
                    d_low = raw_depths[below_indices[-1]]
                    d_high = raw_depths[above_indices[0]]
                    if d_low == d_high:
                        temp_at_15_depths[d_idx] = raw_temp[below_indices[-1]]
                    else:
                        weight = (target_d - d_low) / (d_high - d_low)
                        temp_at_15_depths[d_idx] = (
                            (1.0 - weight) * raw_temp[below_indices[-1]]
                            + weight * raw_temp[above_indices[0]]
                        )
                elif len(below_indices) > 0:
                    temp_at_15_depths[d_idx] = raw_temp[below_indices[-1]]
                else:
                    temp_at_15_depths[d_idx] = raw_temp[0]

        out_3d = np.full((NUM_DEPTHS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
        lat_grid, lon_grid = np.meshgrid(GRID_LATS, GRID_LONS, indexing="ij")
        pts = np.stack([lat_grid.ravel(), lon_grid.ravel()], axis=-1)

        for d_idx in range(NUM_DEPTHS):
            layer = temp_at_15_depths[d_idx]
            try:
                rgi = interp.RegularGridInterpolator(
                    (raw_lats, raw_lons),
                    layer,
                    method="linear",
                    bounds_error=False,
                    fill_value=np.nan,
                )
                out_3d[d_idx] = rgi(pts).reshape(GRID_SHAPE).astype(np.float32)
            except Exception:
                pass

        out_3d[(out_3d < 0.0) | (out_3d > 35.0)] = np.nan
        return out_3d


def create_synthetic_glorys_baseline_zarr(
    date_str: str,
    output_dir: str = "data/zarr",
) -> Path:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_zarr = out_dir / f"glorys_target_{date_str}.zarr"

    dt = datetime.strptime(date_str, "%Y-%m-%d")
    doy = dt.timetuple().tm_yday

    target_3d = np.full((NUM_DEPTHS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
    lat_grid, lon_grid = np.meshgrid(GRID_LATS, GRID_LONS, indexing="ij")

    seasonal = -1.2 * np.cos(2 * np.pi * (doy - 120) / 365.25)
    sst_field = 29.8 - np.abs(lat_grid - 10.0) * 0.16 + seasonal
    sst_field[lat_grid > 24.0] -= 1.5

    for d_idx, depth_m in enumerate(STANDARD_DEPTHS):
        if depth_m <= 20:
            target_3d[d_idx] = sst_field - 0.008 * depth_m
        elif depth_m <= 150:
            tc_depth = np.where(lon_grid >= 78.0, 70.0, 95.0)
            decay = 1.0 - np.exp(-(depth_m - 20.0) / (tc_depth * 1.1))
            target_3d[d_idx] = sst_field - (sst_field - 14.5) * (decay ** 0.7)
        elif depth_m <= 500:
            target_3d[d_idx] = 14.5 - ((depth_m - 150.0) / 350.0) * (14.5 - 7.5)
        else:
            target_3d[d_idx] = 7.5 - ((depth_m - 500.0) / 500.0) * (7.5 - 4.2)

    root = zarr.open_group(str(out_zarr), mode="w")
    root.attrs["role"] = "SUPERVISED_TRAINING_TARGET_ONLY"
    root.attrs["dataset"] = "CMEMS GLORYS12V1 (Climatology Baseline)"
    root.attrs["doi"] = "10.48670/moi-00021"
    root.attrs["date"] = date_str
    root.attrs["is_synthetic"] = True
    root.attrs["depths_m"] = STANDARD_DEPTHS
    root.attrs["created_at"] = datetime.utcnow().isoformat() + "Z"

    root["depth"] = np.array(STANDARD_DEPTHS, dtype=np.float32)
    root["lat"] = GRID_LATS
    root["lon"] = GRID_LONS
    root["temperature_target"] = target_3d.astype(np.float32)
    root["ocean_mask"] = (~np.isnan(target_3d)).astype(np.uint8)

    print(f"[OK] Generated GLORYS Target Baseline Zarr: {out_zarr}")
    return out_zarr
