"""
3D Ocean Volume Reconstruction & Transect Slicing Engine (Phase 13)
Generates 3D voxel point clouds for Three.js WebGL volumetric chambers
and arbitrary vertical transect cuts (Zonal along latitude / Meridional along longitude).
Phase 5 Multi-Year Dynamic Synoptic Date Support (2024-2026).
Strictly model-driven via frozen OceanEmbed neural predictions.
Fail-Closed: Zero synthetic fallback in REAL mode.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import numpy as np

from backend.pipeline.grid_spec import (
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    STANDARD_DEPTHS, NUM_DEPTHS
)
from backend.model.ocean_embed_net import predict_grid_volume, _get_master_zarr
from backend.cache import cache


def get_3d_chamber_volume(
    subsample_lat: int = 4,
    subsample_lon: int = 4,
    temp_min: float = 4.0,
    temp_max: float = 32.0,
    date_str: str = "2024-05-15",
    model_type: str = "physics",
    include_reference: bool = False,
) -> Dict[str, Any]:
    """
    Produces a 3D point cloud optimized for WebGL / Three.js volumetric rendering
    from real OceanEmbed neural model predictions.
    Fail-closed: Raises RuntimeError if Master Zarr or model unavailable.
    """
    model_clean = "baseline" if str(model_type).lower().strip() in ["baseline", "baseline_cnn", "cnn"] else "physics"
    cache_key = f"vol3d:{model_clean}:{date_str}:s{subsample_lat}_{subsample_lon}:ref{include_reference}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    temp_vol, unc_vol, meta = predict_grid_volume(date_str=date_str, model_type=model_clean)
    root, _, _ = _get_master_zarr()

    lats = np.array(root["lats"][:], dtype=np.float32)
    lons = np.array(root["lons"][:], dtype=np.float32)
    mask = np.array(root["ocean_mask"][:, :], dtype=bool)

    ref_vol = None
    if include_reference and "temperature_target" in root:
        snap_idx = meta.get("snapshot_idx", 0)
        ref_vol = np.array(root["temperature_target"][snap_idx, :, :, :], dtype=np.float32)

    sub_lats = lats[::subsample_lat]
    sub_lons = lons[::subsample_lon]
    sub_temp = temp_vol[:, ::subsample_lat, ::subsample_lon]
    sub_unc = unc_vol[:, ::subsample_lat, ::subsample_lon]
    sub_mask = mask[::subsample_lat, ::subsample_lon]
    sub_ref = ref_vol[:, ::subsample_lat, ::subsample_lon] if ref_vol is not None else None

    voxels = []
    for k, d in enumerate(STANDARD_DEPTHS):
        z_norm = round(float(-d / 1000.0), 3)
        for i, la in enumerate(sub_lats):
            y_norm = round(float((la - LAT_MIN) / (LAT_MAX - LAT_MIN)), 3)
            for j, lo in enumerate(sub_lons):
                if not bool(sub_mask[i, j]):
                    continue
                t_val = sub_temp[k, i, j]
                if np.isnan(t_val):
                    continue
                u_val = sub_unc[k, i, j] if not np.isnan(sub_unc[k, i, j]) else 0.25
                t_norm = round(float(np.clip((t_val - temp_min) / (temp_max - temp_min), 0.0, 1.0)), 3)
                x_norm = round(float((lo - LON_MIN) / (LON_MAX - LON_MIN)), 3)

                voxel_dict = {
                    "x": x_norm,
                    "y": y_norm,
                    "z": z_norm,
                    "temp": round(float(t_val), 2),
                    "prediction": round(float(t_val), 2),
                    "uncertainty": round(float(u_val), 2),
                    "norm": t_norm,
                    "lat": round(float(la), 2),
                    "lon": round(float(lo), 2),
                    "depth": d,
                }
                if sub_ref is not None:
                    r_val = sub_ref[k, i, j]
                    voxel_dict["glorys_reference"] = round(float(r_val), 2) if not np.isnan(r_val) else None

                voxels.append(voxel_dict)

    payload = {
        "total_voxels": len(voxels),
        "grid_dims": [len(sub_lons), len(sub_lats), len(STANDARD_DEPTHS)],
        "domain": f"{LAT_MIN}-{LAT_MAX}N, {LON_MIN}-{LON_MAX}E",
        "depth_range_m": [0, 1000],
        "depths_m": STANDARD_DEPTHS,
        "requested_date": date_str,
        "matched_snapshot_date": meta.get("matched_snapshot_date", date_str),
        "snapshot_used": meta.get("matched_snapshot_date", date_str),
        "delta_hours": meta.get("delta_hours", 0),
        "model_name": f"OceanEmbedNet ({model_clean.capitalize()})",
        "model_type": model_clean,
        "voxels": voxels,
        "source": f"ADRISHTA Frozen Neural Model ({model_clean.upper()}) 3D Chamber Volume",
        "source_of_truth": "ADRISHTA Multi-Year Frozen Model Prediction",
        "is_synthetic": False,
        "data_status": "REAL_MODEL_VOLUME",
    }
    cache.set(cache_key, payload, ttl_seconds=86400)
    return payload


def get_transect_slice(
    orientation: str = "zonal",
    fixed_coord: float = 15.0,
    date_str: str = "2024-05-15",
    model_type: str = "physics",
    include_reference: bool = False,
) -> Dict[str, Any]:
    """
    orientation:
      - 'zonal': fixed latitude (fixed_coord = lat), varying longitude across all depths
      - 'meridional': fixed longitude (fixed_coord = lon), varying latitude across all depths
    Model-driven: Extracted from genuine OceanEmbed predictions across all 15 depths.
    Fail-closed: Raises RuntimeError if Master Zarr or model unavailable.
    """
    model_clean = "baseline" if str(model_type).lower().strip() in ["baseline", "baseline_cnn", "cnn"] else "physics"
    cache_key = f"transect:{model_clean}:{orientation}:{fixed_coord:.2f}:{date_str}:ref{include_reference}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    temp_vol, unc_vol, meta = predict_grid_volume(date_str=date_str, model_type=model_clean)
    root, _, _ = _get_master_zarr()

    lats = np.array(root["lats"][:], dtype=np.float32)
    lons = np.array(root["lons"][:], dtype=np.float32)
    mask = np.array(root["ocean_mask"][:, :], dtype=bool)

    ref_vol = None
    if include_reference and "temperature_target" in root:
        snap_idx = meta.get("snapshot_idx", 0)
        ref_vol = np.array(root["temperature_target"][snap_idx, :, :, :], dtype=np.float32)

    if orientation == "zonal":
        lat_idx = int(np.argmin(np.abs(lats - fixed_coord)))
        actual_lat = float(lats[lat_idx])
        slice_pred = temp_vol[:, lat_idx, :] # [15, 241]
        slice_unc = unc_vol[:, lat_idx, :]
        mask_1d = mask[lat_idx, :]
        slice_ref = ref_vol[:, lat_idx, :] if ref_vol is not None else None

        coords = [round(float(lo), 2) for lo in lons]
        matrix = []
        ref_matrix = []
        unc_matrix = []

        for k in range(len(STANDARD_DEPTHS)):
            row = []
            ref_row = []
            unc_row = []
            for j in range(len(lons)):
                if not bool(mask_1d[j]):
                    row.append(None)
                    ref_row.append(None)
                    unc_row.append(None)
                else:
                    v = slice_pred[k, j]
                    u = slice_unc[k, j]
                    row.append(round(float(v), 2) if not np.isnan(v) else None)
                    unc_row.append(round(float(u), 2) if not np.isnan(u) else None)
                    if slice_ref is not None:
                        rv = slice_ref[k, j]
                        ref_row.append(round(float(rv), 2) if not np.isnan(rv) else None)
            matrix.append(row)
            if slice_ref is not None:
                ref_matrix.append(ref_row)
            unc_matrix.append(unc_row)

        payload = {
            "orientation": "zonal",
            "fixed_latitude": actual_lat,
            "requested_date": date_str,
            "matched_snapshot_date": meta.get("matched_snapshot_date", date_str),
            "delta_hours": meta.get("delta_hours", 0),
            "model_name": f"OceanEmbedNet ({model_clean.capitalize()})",
            "model_type": model_clean,
            "longitudes": coords,
            "depths_m": STANDARD_DEPTHS,
            "temperature_matrix": matrix,
            "prediction_matrix": matrix,
            "uncertainty_matrix": unc_matrix,
            "source": f"ADRISHTA Reconstructed Transect ({model_clean.upper()})",
            "source_of_truth": "ADRISHTA Multi-Year Frozen Model Prediction",
            "is_synthetic": False,
            "data_status": "REAL_MODEL_TRANSECT",
        }
        if slice_ref is not None:
            payload["glorys_reference_matrix"] = ref_matrix

    else:
        lon_idx = int(np.argmin(np.abs(lons - fixed_coord)))
        actual_lon = float(lons[lon_idx])
        slice_pred = temp_vol[:, :, lon_idx] # [15, 101]
        slice_unc = unc_vol[:, :, lon_idx]
        mask_1d = mask[:, lon_idx]
        slice_ref = ref_vol[:, :, lon_idx] if ref_vol is not None else None

        coords = [round(float(la), 2) for la in lats]
        matrix = []
        ref_matrix = []
        unc_matrix = []

        for k in range(len(STANDARD_DEPTHS)):
            row = []
            ref_row = []
            unc_row = []
            for i in range(len(lats)):
                if not bool(mask_1d[i]):
                    row.append(None)
                    ref_row.append(None)
                    unc_row.append(None)
                else:
                    v = slice_pred[k, i]
                    u = slice_unc[k, i]
                    row.append(round(float(v), 2) if not np.isnan(v) else None)
                    unc_row.append(round(float(u), 2) if not np.isnan(u) else None)
                    if slice_ref is not None:
                        rv = slice_ref[k, i]
                        ref_row.append(round(float(rv), 2) if not np.isnan(rv) else None)
            matrix.append(row)
            if slice_ref is not None:
                ref_matrix.append(ref_row)
            unc_matrix.append(unc_row)

        payload = {
            "orientation": "meridional",
            "fixed_longitude": actual_lon,
            "requested_date": date_str,
            "matched_snapshot_date": meta.get("matched_snapshot_date", date_str),
            "delta_hours": meta.get("delta_hours", 0),
            "model_name": f"OceanEmbedNet ({model_clean.capitalize()})",
            "model_type": model_clean,
            "latitudes": coords,
            "depths_m": STANDARD_DEPTHS,
            "temperature_matrix": matrix,
            "prediction_matrix": matrix,
            "uncertainty_matrix": unc_matrix,
            "source": f"ADRISHTA Reconstructed Transect ({model_clean.upper()})",
            "source_of_truth": "ADRISHTA Multi-Year Frozen Model Prediction",
            "is_synthetic": False,
            "data_status": "REAL_MODEL_TRANSECT",
        }
        if slice_ref is not None:
            payload["glorys_reference_matrix"] = ref_matrix

    cache.set(cache_key, payload, ttl_seconds=86400)
    return payload
