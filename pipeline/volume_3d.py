"""
3D Ocean Volume Reconstruction & Transect Slicing Engine (Phase 13)
Generates 3D voxel point clouds for Three.js WebGL volumetric chambers
and arbitrary vertical transect cuts (Zonal along latitude / Meridional along longitude).
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
import zarr

from backend.pipeline.grid_spec import (
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    STANDARD_DEPTHS, NUM_DEPTHS
)

GLORYS_ZARR_PATH = Path("c:/adrishta-66/data/zarr/glorys_target_2024-05-15.zarr")


def get_3d_chamber_volume(
    subsample_lat: int = 4,
    subsample_lon: int = 4,
    temp_min: float = 4.0,
    temp_max: float = 32.0,
) -> Dict[str, Any]:
    """
    Produces a compact 3D point cloud optimized for WebGL / Three.js volumetric rendering.
    """
    if GLORYS_ZARR_PATH.exists():
        try:
            root = zarr.open_group(str(GLORYS_ZARR_PATH), mode="r")
            lats = np.array(root["lat"][:])
            lons = np.array(root["lon"][:])
            vol = np.array(root["temperature_target"][:]) # [15, 101, 241]
            mask = np.array(root["ocean_mask"][:])

            sub_lats = lats[::subsample_lat]
            sub_lons = lons[::subsample_lon]
            sub_vol = vol[:, ::subsample_lat, ::subsample_lon]
            sub_mask = mask[:, ::subsample_lat, ::subsample_lon]

            voxels = []
            for k, d in enumerate(STANDARD_DEPTHS):
                # Normalized depth -1.0 (1000m) to 0.0 (surface)
                z_norm = round(float(-d / 1000.0), 3)
                for i, la in enumerate(sub_lats):
                    y_norm = round(float((la - LAT_MIN) / (LAT_MAX - LAT_MIN)), 3)
                    for j, lo in enumerate(sub_lons):
                        x_norm = round(float((lo - LON_MIN) / (LON_MAX - LON_MIN)), 3)
                        
                        if sub_mask[k, i, j] != 1:
                            continue
                        t_val = sub_vol[k, i, j]
                        if np.isnan(t_val):
                            continue

                        # Normalized temperature 0.0 (cold) to 1.0 (warm)
                        t_norm = round(float(np.clip((t_val - temp_min) / (temp_max - temp_min), 0.0, 1.0)), 3)

                        voxels.append({
                            "x": x_norm,
                            "y": y_norm,
                            "z": z_norm,
                            "temp": round(float(t_val), 2),
                            "norm": t_norm,
                            "lat": round(float(la), 2),
                            "lon": round(float(lo), 2),
                            "depth": d,
                        })

            return {
                "total_voxels": len(voxels),
                "grid_dims": [len(sub_lons), len(sub_lats), len(STANDARD_DEPTHS)],
                "domain": f"{LAT_MIN}-{LAT_MAX}N, {LON_MIN}-{LON_MAX}E",
                "depth_range_m": [0, 1000],
                "voxels": voxels,
                "source": "GLORYS12V1 3D Reanalysis Mesh",
            }
        except Exception:
            pass

    # Analytical fallback if Zarr is unavailable
    lats = np.arange(LAT_MIN, LAT_MAX + 0.1, 1.0)
    lons = np.arange(LON_MIN, LON_MAX + 0.1, 1.0)
    voxels = []

    for d in STANDARD_DEPTHS:
        z_norm = round(float(-d / 1000.0), 3)
        base_t = max(4.15, 29.5 - (d / 1000.0) ** 0.6 * 25.0)
        for la in lats:
            y_norm = round(float((la - LAT_MIN) / (LAT_MAX - LAT_MIN)), 3)
            for lo in lons:
                x_norm = round(float((lo - LON_MIN) / (LON_MAX - LON_MIN)), 3)
                is_land = (la > 8.0 and la < 28.0 and lo > 72.0 and lo < 88.0 and not (la < 12.0 and lo > 80.0))
                if is_land:
                    continue
                t_val = base_t + 0.8 * np.sin(la * 0.2) + 0.5 * np.cos(lo * 0.15)
                t_norm = round(float(np.clip((t_val - temp_min) / (temp_max - temp_min), 0.0, 1.0)), 3)

                voxels.append({
                    "x": x_norm,
                    "y": y_norm,
                    "z": z_norm,
                    "temp": round(float(t_val), 2),
                    "norm": t_norm,
                    "lat": round(float(la), 2),
                    "lon": round(float(lo), 2),
                    "depth": d,
                })

    return {
        "total_voxels": len(voxels),
        "voxels": voxels,
        "source": "ADRISHTA Synthetic 3D Mesh",
    }


def get_transect_slice(
    orientation: str = "zonal",
    fixed_coord: float = 15.0,
) -> Dict[str, Any]:
    """
    orientation:
      - 'zonal': fixed latitude (fixed_coord = lat), varying longitude across all depths
      - 'meridional': fixed longitude (fixed_coord = lon), varying latitude across all depths
    """
    if GLORYS_ZARR_PATH.exists():
        try:
            root = zarr.open_group(str(GLORYS_ZARR_PATH), mode="r")
            lats = np.array(root["lat"][:])
            lons = np.array(root["lon"][:])
            vol = np.array(root["temperature_target"][:]) # [15, 101, 241]
            mask = np.array(root["ocean_mask"][:])

            if orientation == "zonal":
                lat_idx = int(np.argmin(np.abs(lats - fixed_coord)))
                actual_lat = float(lats[lat_idx])
                
                # Extract 2D slice [15 depths, 241 lons]
                slice_2d = vol[:, lat_idx, :]
                mask_2d = mask[:, lat_idx, :]

                points = []
                for k, d in enumerate(STANDARD_DEPTHS):
                    for j, lo in enumerate(lons[::2]):
                        if mask_2d[k, j * 2] != 1:
                            continue
                        val = slice_2d[k, j * 2]
                        if np.isnan(val):
                            continue
                        points.append({
                            "lon": round(float(lo), 2),
                            "depth_m": d,
                            "temp_degC": round(float(val), 2),
                        })

                return {
                    "orientation": "zonal",
                    "fixed_latitude": actual_lat,
                    "depths_m": STANDARD_DEPTHS,
                    "total_points": len(points),
                    "points": points,
                }
            else: # meridional
                lon_idx = int(np.argmin(np.abs(lons - fixed_coord)))
                actual_lon = float(lons[lon_idx])

                slice_2d = vol[:, :, lon_idx]
                mask_2d = mask[:, :, lon_idx]

                points = []
                for k, d in enumerate(STANDARD_DEPTHS):
                    for i, la in enumerate(lats[::2]):
                        if mask_2d[k, i * 2] != 1:
                            continue
                        val = slice_2d[k, i * 2]
                        if np.isnan(val):
                            continue
                        points.append({
                            "lat": round(float(la), 2),
                            "depth_m": d,
                            "temp_degC": round(float(val), 2),
                        })

                return {
                    "orientation": "meridional",
                    "fixed_longitude": actual_lon,
                    "depths_m": STANDARD_DEPTHS,
                    "total_points": len(points),
                    "points": points,
                }
        except Exception:
            pass

    return {"error": "Zarr target store unavailable"}
