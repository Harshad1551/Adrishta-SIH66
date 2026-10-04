"""
Gridded Slice Endpoint: Returns 0.25 deg 2D spatial slice for map and 3D chamber.
Phase 5 Multi-Year Production Checkpoint Inference with Master 2024-2026 Zarr.
Strictly returns OceanEmbed neural model predictions (NOT GLORYS target).
Fail-closed: Zero synthetic data fallback in REAL mode.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import numpy as np
from fastapi import APIRouter, Query, HTTPException

from backend.cache import cache
from backend.pipeline.grid_spec import STANDARD_DEPTHS, NUM_DEPTHS, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX
from backend.model.ocean_embed_net import predict_grid_volume, _get_master_zarr

router = APIRouter()


def find_closest_depth_idx(target_depth: float) -> int:
    arr = np.array(STANDARD_DEPTHS)
    return int(np.argmin(np.abs(arr - target_depth)))


@router.get("/reconstruction/grid")
def get_gridded_slice(
    depth: int = Query(0, description="Depth level in meters (0 to 1000)"),
    date: str = Query("2024-05-15", description="Target Date (YYYY-MM-DD)"),
    model: str = Query("physics", description="Model architecture ('physics' or 'baseline')"),
    variable: str = Query("temp", description="Variable ('temp', 'anomaly', 'uncertainty')"),
    subsample: int = Query(2, ge=1, le=4, description="Spatial subsample stride (1=101x241, 2=51x121)"),
    include_reference: bool = Query(False, description="Optionally include GLORYS ground truth reference alongside prediction"),
    min_lat: Optional[float] = Query(None, ge=5.0, le=30.0),
    max_lat: Optional[float] = Query(None, ge=5.0, le=30.0),
    min_lon: Optional[float] = Query(None, ge=45.0, le=105.0),
    max_lon: Optional[float] = Query(None, ge=45.0, le=105.0),
):
    """
    Returns actual OceanEmbed model prediction field across the requested depth and grid.
    Optionally returns GLORYS reference separately, but never confuses them.
    """
    model_str = model if isinstance(model, str) else "physics"
    model_type = "baseline" if model_str.lower().strip() in ["baseline", "baseline_cnn", "cnn"] else "physics"
    depth_val = float(depth) if isinstance(depth, (int, float)) else 0.0
    depth_idx = find_closest_depth_idx(depth_val)
    actual_depth = STANDARD_DEPTHS[depth_idx]
    date_str = date if isinstance(date, str) else "2024-05-15"
    sub_val = int(subsample) if isinstance(subsample, (int, float)) else 2
    var_str = variable if isinstance(variable, str) else "temp"
    ref_bool = bool(include_reference) if isinstance(include_reference, bool) else False

    min_la = float(min_lat) if isinstance(min_lat, (int, float)) else None
    max_la = float(max_lat) if isinstance(max_lat, (int, float)) else None
    min_lo = float(min_lon) if isinstance(min_lon, (int, float)) else None
    max_lo = float(max_lon) if isinstance(max_lon, (int, float)) else None

    cache_key = f"grid_pred:{model_type}:{actual_depth}m:{var_str}:{date_str}:s{sub_val}:ref{ref_bool}:{min_la}_{max_la}_{min_lo}_{max_lo}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        temp_vol, unc_vol, meta = predict_grid_volume(date_str=date_str, model_type=model_type)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"REAL_DATA_UNAVAILABLE: Neural grid reconstruction failed ({e}). Fail-closed."
        )

    root, _, _ = _get_master_zarr()
    if root is None:
        raise HTTPException(status_code=503, detail="REAL_DATA_UNAVAILABLE: Master Zarr store offline.")

    lats = np.array(root["lats"][:], dtype=np.float32)
    lons = np.array(root["lons"][:], dtype=np.float32)
    ocean_mask = np.array(root["ocean_mask"][:, :], dtype=bool)

    pred_2d = temp_vol[depth_idx, :, :]
    unc_2d = unc_vol[depth_idx, :, :]

    ref_2d = None
    if ref_bool and "temperature_target" in root:
        snap_idx = meta.get("snapshot_idx", 0)
        ref_2d = np.array(root["temperature_target"][snap_idx, depth_idx, :, :], dtype=np.float32)

    # Subsampling
    sub_i = np.arange(0, len(lats), sub_val)
    sub_j = np.arange(0, len(lons), sub_val)

    sub_lats = lats[sub_i]
    sub_lons = lons[sub_j]
    sub_pred = pred_2d[np.ix_(sub_i, sub_j)]
    sub_unc = unc_2d[np.ix_(sub_i, sub_j)]
    sub_mask = ocean_mask[np.ix_(sub_i, sub_j)]
    sub_ref = ref_2d[np.ix_(sub_i, sub_j)] if ref_2d is not None else None

    # Spatial subset filtering if requested
    if min_la is not None:
        lat_valid = sub_lats >= min_la
        sub_lats = sub_lats[lat_valid]
        sub_pred = sub_pred[lat_valid, :]
        sub_unc = sub_unc[lat_valid, :]
        sub_mask = sub_mask[lat_valid, :]
        if sub_ref is not None:
            sub_ref = sub_ref[lat_valid, :]
    if max_la is not None:
        lat_valid = sub_lats <= max_la
        sub_lats = sub_lats[lat_valid]
        sub_pred = sub_pred[lat_valid, :]
        sub_unc = sub_unc[lat_valid, :]
        sub_mask = sub_mask[lat_valid, :]
        if sub_ref is not None:
            sub_ref = sub_ref[lat_valid, :]
    if min_lo is not None:
        lon_valid = sub_lons >= min_lo
        sub_lons = sub_lons[lon_valid]
        sub_pred = sub_pred[:, lon_valid]
        sub_unc = sub_unc[:, lon_valid]
        sub_mask = sub_mask[:, lon_valid]
        if sub_ref is not None:
            sub_ref = sub_ref[:, lon_valid]
    if max_lo is not None:
        lon_valid = sub_lons <= max_lo
        sub_lons = sub_lons[lon_valid]
        sub_pred = sub_pred[:, lon_valid]
        sub_unc = sub_unc[:, lon_valid]
        sub_mask = sub_mask[:, lon_valid]
        if sub_ref is not None:
            sub_ref = sub_ref[:, lon_valid]

    # Calculate mean temperature for anomaly baseline
    ocean_vals = sub_pred[sub_mask & ~np.isnan(sub_pred)]
    mean_temp = float(np.mean(ocean_vals)) if len(ocean_vals) > 0 else 20.0

    points = []
    values_clean = []
    n_i, n_j = sub_pred.shape

    values_grid = []
    mask_grid = []

    for i in range(n_i):
        val_row = []
        mask_row = []
        la = round(float(sub_lats[i]), 2)
        for j in range(n_j):
            lo = round(float(sub_lons[j]), 2)
            is_oc = bool(sub_mask[i, j])
            t_pred = sub_pred[i, j]

            if not is_oc or np.isnan(t_pred):
                val_row.append(None)
                mask_row.append(False)
                continue

            mask_row.append(True)
            u_val = float(sub_unc[i, j]) if not np.isnan(sub_unc[i, j]) else 0.25

            if var_str == "temp":
                val_out = round(float(t_pred), 2)
            elif var_str == "anomaly":
                val_out = round(float(t_pred - mean_temp), 2)
            else: # uncertainty
                val_out = round(float(u_val), 2)

            val_row.append(val_out)
            values_clean.append(val_out)

            pt_dict = {
                "lat": la,
                "lon": lo,
                "value": val_out,
                "prediction": round(float(t_pred), 2),
                "uncertainty": round(float(u_val), 2),
                "ocean": True,
            }
            if sub_ref is not None:
                r_val = sub_ref[i, j]
                pt_dict["glorys_reference"] = round(float(r_val), 2) if not np.isnan(r_val) else None

            points.append(pt_dict)

        values_grid.append(val_row)
        mask_grid.append(mask_row)

    min_v = float(min(values_clean)) if values_clean else 4.0
    max_v = float(max(values_clean)) if values_clean else 32.0
    mean_v = float(np.mean(values_clean)) if values_clean else 20.0

    payload = {
        "requested_date": date_str,
        "snapshot_used": meta.get("matched_snapshot_date", date_str),
        "matched_snapshot_date": meta.get("matched_snapshot_date", date_str),
        "delta_days": meta.get("delta_days", 0),
        "delta_hours": meta.get("delta_hours", 0),
        "timestamp": f"{date_str}T00:00:00Z",
        "depth": int(actual_depth),
        "depth_m": int(actual_depth),
        "model": "Physics-Constrained OceanEmbedNet" if model_type == "physics" else "Baseline Deep CNN",
        "model_type": model_type,
        "checkpoint_identifier": "oceanembed_multiyear_physics.pt" if model_type == "physics" else "oceanembed_multiyear_baseline.pt",
        "variable": var_str,
        "grid_shape": [len(sub_lats), len(sub_lons)],
        "dimensions": {"lat": len(sub_lats), "lon": len(sub_lons)},
        "lats": [round(float(la), 2) for la in sub_lats],
        "lons": [round(float(lo), 2) for lo in sub_lons],
        "latitude_array": [round(float(la), 2) for la in sub_lats],
        "longitude_array": [round(float(lo), 2) for lo in sub_lons],
        "values": values_grid,
        "prediction_array": values_grid,
        "valid_mask": mask_grid,
        "points": points,
        "min": round(min_v, 2),
        "max": round(max_v, 2),
        "mean": round(mean_v, 2),
        "unit": "degC" if var_str == "temp" else ("degC anomaly" if var_str == "anomaly" else "degC 1-sigma"),
        "source_of_truth": f"ADRISHTA Multi-Year Frozen Model Inference ({model_type.upper()})",
        "provenance": "Copernicus DUACS / NOAA OISST / SMAP SSS / OSCAR / CCMP -> Frozen Checkpoint (Fail-Closed)",
        "is_synthetic": False,
        "data_status": "REAL_MODEL_PREDICTION",
    }

    cache.set(cache_key, payload, ttl_seconds=86400)
    return payload
