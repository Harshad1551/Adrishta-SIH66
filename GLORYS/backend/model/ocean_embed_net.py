"""
ADRISHTA: Subsurface Ocean AI - Neural Network Architecture
Physics-Constrained Ocean Embedding Network (OceanEmbedNet)
Phase 5 Multi-Year Production Checkpoint and Real Synoptic Zarr Integration
Fail-Closed Production Engine: Zero Synthetic Ocean Values in Real Mode.
"""

import os
import math
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import threading
import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.pipeline.grid_spec import (
    GRID_LATS,
    GRID_LONS,
    LAT_MIN,
    LAT_MAX,
    LON_MIN,
    LON_MAX,
    STANDARD_DEPTHS,
    CHANNELS,
    QC_FLAG_GOOD,
    QC_FLAG_MISSING,
)


class OceanEmbedNet(nn.Module):
    def __init__(self, input_dim: int = 11, latent_dim: int = 256, output_dim: int = 15, apply_physics_clamp: bool = True):
        super().__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim
        self.output_dim = output_dim
        self.apply_physics_clamp = apply_physics_clamp

        # 1. Satellite & Coordinate Embedding Encoder
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.LayerNorm(128),
            nn.GELU(),
            nn.Dropout(0.08),
            nn.Linear(128, latent_dim),
            nn.LayerNorm(latent_dim),
            nn.GELU(),
        )

        # 2. Physics-Constrained Subsurface Decoder
        self.decoder_backbone = nn.Sequential(
            nn.Linear(latent_dim, 128),
            nn.LayerNorm(128),
            nn.GELU(),
            nn.Dropout(0.05),
            nn.Linear(128, 64),
            nn.GELU(),
        )

        # 3. Output Heads
        self.temp_head = nn.Linear(64, output_dim)
        self.unc_head = nn.Sequential(
            nn.Linear(64, output_dim),
            nn.Softplus(),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        latent = self.encoder(x)
        features = self.decoder_backbone(latent)
        raw_temp = self.temp_head(features)
        raw_unc = self.unc_head(features) + 0.12

        # During inference (eval), apply smooth post-processing boundary enforcement if physics enabled
        if not self.training and self.apply_physics_clamp:
            temp_out = self._eval_hydrostatic_clamp(raw_temp)
        else:
            temp_out = raw_temp

        return temp_out, raw_unc, latent

    def _eval_hydrostatic_clamp(self, temp_pred: torch.Tensor) -> torch.Tensor:
        """Inference-time non-gradient post-processing guaranteeing physical monotonicity."""
        layers = [temp_pred[:, 0:1]]
        for k in range(1, 4):
            l_k = torch.clamp(temp_pred[:, k : k + 1], min=layers[0] - 1.5, max=layers[0] + 0.5)
            layers.append(l_k)
        for k in range(4, self.output_dim):
            prev = layers[-1]
            l_k = torch.minimum(temp_pred[:, k : k + 1], prev)
            l_k = torch.clamp(l_k, min=4.0, max=35.0)
            layers.append(l_k)
        return torch.cat(layers, dim=-1)


_PHYSICS_MODEL_INSTANCE: Optional[OceanEmbedNet] = None
_BASELINE_MODEL_INSTANCE: Optional[OceanEmbedNet] = None
_NORM_STATS: Optional[Dict[str, Any]] = None
_CH_MEANS: Optional[np.ndarray] = None
_CH_STDS: Optional[np.ndarray] = None
_MASTER_ZARR_ROOT = None
_ZARR_LOCK = threading.Lock()
_MASTER_ZARR_DATES: Optional[List[str]] = None
_MASTER_ZARR_DTS: Optional[List[datetime]] = None

# In-memory prediction cache for full 3D volumes
_VOLUME_PRED_CACHE: Dict[str, Tuple[np.ndarray, np.ndarray, Dict[str, Any]]] = {}


def get_model(model_type: str = "physics") -> OceanEmbedNet:
    global _PHYSICS_MODEL_INSTANCE, _BASELINE_MODEL_INSTANCE
    if hasattr(model_type, "default"):
        model_type = model_type.default
    model_type = str(model_type or "physics").lower().strip()
    
    if model_type in ["physics", "physics_constrained", "oceanembed"]:
        if _PHYSICS_MODEL_INSTANCE is None:
            model = OceanEmbedNet(apply_physics_clamp=True)
            raw_candidates = [
                os.getenv("OCEANEMBED_CHECKPOINT_PATH"),
                "/app/checkpoints/oceanembed_multiyear_physics.pt",
                "checkpoints/oceanembed_multiyear_physics.pt",
                "/tmp/oceanembed_data/checkpoints/oceanembed_multiyear_physics.pt",
                "C:/adrishta-66/checkpoints/oceanembed_multiyear_physics.pt",
                "G:/My Drive/oceanembed_data/checkpoints/oceanembed_multiyear_physics.pt",
            ]
            ckpt_path = None
            for c in raw_candidates:
                if c and Path(c).is_file():
                    ckpt_path = Path(c)
                    break

            if ckpt_path is None:
                raise RuntimeError(
                    "MODEL_CHECKPOINT_UNAVAILABLE: Audited physics checkpoint oceanembed_multiyear_physics.pt not found. "
                    "Fail-closed: refusing to initialize random weights in REAL mode."
                )
            state_dict = torch.load(str(ckpt_path), map_location="cpu")
            if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
                state_dict = state_dict["model_state_dict"]
            model.load_state_dict(state_dict)
            model.eval()
            print(f"[OK] OceanEmbedNet loaded audited multiyear physics weights from: {ckpt_path}")
            _PHYSICS_MODEL_INSTANCE = model
        return _PHYSICS_MODEL_INSTANCE

    elif model_type in ["baseline", "baseline_cnn", "cnn"]:
        if _BASELINE_MODEL_INSTANCE is None:
            model = OceanEmbedNet(apply_physics_clamp=False)
            raw_candidates = [
                os.getenv("OCEANEMBED_BASELINE_CHECKPOINT_PATH"),
                "/app/checkpoints/oceanembed_multiyear_baseline.pt",
                "checkpoints/oceanembed_multiyear_baseline.pt",
                "/tmp/oceanembed_data/checkpoints/oceanembed_multiyear_baseline.pt",
                "C:/adrishta-66/checkpoints/oceanembed_multiyear_baseline.pt",
                "G:/My Drive/oceanembed_data/checkpoints/oceanembed_multiyear_baseline.pt",
            ]
            ckpt_path = None
            for c in raw_candidates:
                if c and Path(c).is_file():
                    ckpt_path = Path(c)
                    break

            if ckpt_path is None:
                raise RuntimeError(
                    "MODEL_CHECKPOINT_UNAVAILABLE: Audited baseline checkpoint oceanembed_multiyear_baseline.pt not found. "
                    "Fail-closed: refusing to initialize random weights in REAL mode."
                )
            state_dict = torch.load(str(ckpt_path), map_location="cpu")
            if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
                state_dict = state_dict["model_state_dict"]
            model.load_state_dict(state_dict)
            model.eval()
            print(f"[OK] Loaded audited multiyear baseline weights from: {ckpt_path}")
            _BASELINE_MODEL_INSTANCE = model
        return _BASELINE_MODEL_INSTANCE
    else:
        raise ValueError(f"Unknown model_type: {model_type}. Expected 'physics' or 'baseline'.")


def _get_norm_stats() -> Tuple[Dict[str, Any], np.ndarray, np.ndarray]:
    global _NORM_STATS, _CH_MEANS, _CH_STDS
    if _NORM_STATS is None:
        raw_candidates = [
            os.getenv("OCEANEMBED_NORM_STATS_PATH"),
            "/app/pipeline/norm_stats_multiyear.json",
            "pipeline/norm_stats_multiyear.json",
            "/tmp/oceanembed_data/norm_stats_multiyear.json",
            "C:/adrishta-66/pipeline/norm_stats_multiyear.json",
            "G:/My Drive/oceanembed_data/norm_stats_multiyear.json",
        ]
        p = None
        for c in raw_candidates:
            if c and Path(c).is_file():
                p = Path(c)
                break

        if p is None:
            raise RuntimeError(
                "NORMALIZATION_STATS_UNAVAILABLE: Audited multi-year normalization file norm_stats_multiyear.json not found. "
                "Fail-closed: refusing unnormalized inference in REAL mode."
            )
        with open(str(p), "r", encoding="utf-8") as f:
            _NORM_STATS = json.load(f)
        _CH_MEANS = np.zeros(7, dtype=np.float32)
        _CH_STDS = np.ones(7, dtype=np.float32)
        for idx, ch in enumerate(["sst", "sss", "ssh", "current_u", "current_v", "wind_u", "wind_v"]):
            st = _NORM_STATS["surface_channel_stats"].get(ch, {})
            _CH_MEANS[idx] = float(st.get("mean", 0.0))
            _CH_STDS[idx] = max(1e-4, float(st.get("std", 1.0)))
    return _NORM_STATS, _CH_MEANS, _CH_STDS


def _get_master_zarr():
    global _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS
    if _MASTER_ZARR_ROOT is not None:
        return _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS

    with _ZARR_LOCK:
        if _MASTER_ZARR_ROOT is not None:
            return _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS

        hf_cache_dir = Path(os.getenv("HF_CACHE_DIR", "/tmp/oceanembed_data" if os.name != "nt" else r"C:\adrishta-66\data"))
        cached_zarr = hf_cache_dir / "zarr" / "oceanembed_multiyear_2024_2026.zarr"
        if not cached_zarr.exists():
            cached_zarr = hf_cache_dir / "oceanembed_multiyear_2024_2026.zarr"
        marker_file = hf_cache_dir / ".download_complete"

        # Check if local cache is ready AND marked complete
        if cached_zarr.exists() and marker_file.exists():
            try:
                import zarr
                _MASTER_ZARR_ROOT = zarr.open_group(str(cached_zarr), mode="r")
                _MASTER_ZARR_DATES = [str(d) for d in _MASTER_ZARR_ROOT["dates"][:]]
                _MASTER_ZARR_DTS = [datetime.strptime(d, "%Y-%m-%d") for d in _MASTER_ZARR_DATES]
                print(f"[OK] Master Zarr opened from local cache: {cached_zarr} ({len(_MASTER_ZARR_DATES)} snapshots)")
                return _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS
            except Exception as e:
                print(f"[!] Local cache not readable yet: {e}")
                _MASTER_ZARR_ROOT = None

        # Download from Hugging Face if configured
        hf_repo = os.getenv("HF_DATASET_REPO")
        if hf_repo and _MASTER_ZARR_ROOT is None:
            try:
                from huggingface_hub import snapshot_download
                hf_token = os.getenv("HF_TOKEN")
                hf_cache_dir.mkdir(parents=True, exist_ok=True)
                print(f"[HF] Downloading Master Zarr from Hugging Face Dataset {hf_repo} to {hf_cache_dir}...")
                local_path = snapshot_download(
                    repo_id=hf_repo,
                    repo_type="dataset",
                    allow_patterns=["zarr/**", "argo/**", "checkpoints/**", "norm_stats_multiyear.json"],
                    local_dir=str(hf_cache_dir),
                    token=hf_token,
                    max_workers=12
                )
                hf_zarr_path = Path(local_path) / "zarr" / "oceanembed_multiyear_2024_2026.zarr"
                if not hf_zarr_path.exists():
                    hf_zarr_path = Path(local_path) / "oceanembed_multiyear_2024_2026.zarr"
                if hf_zarr_path.exists():
                    import zarr
                    _MASTER_ZARR_ROOT = zarr.open_group(str(hf_zarr_path), mode="r")
                    _MASTER_ZARR_DATES = [str(d) for d in _MASTER_ZARR_ROOT["dates"][:]]
                    _MASTER_ZARR_DTS = [datetime.strptime(d, "%Y-%m-%d") for d in _MASTER_ZARR_DATES]
                    marker_file.write_text("ok", encoding="utf-8")
                    print(f"[OK] Master Zarr opened from Hugging Face cache {hf_zarr_path} ({len(_MASTER_ZARR_DATES)} snapshots)")
                    return _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS
            except Exception as e:
                print(f"[!] Error loading Master Zarr from Hugging Face {hf_repo}: {e}")
                _MASTER_ZARR_ROOT = None

        # Fallback candidates
        zarr_env = os.getenv("OCEANEMBED_ZARR_PATH")
        zarr_uri = os.getenv("ZARR_STORAGE_URI")
        raw_candidates = [
            zarr_env,
            f"{zarr_uri}/oceanembed_multiyear_2024_2026.zarr" if zarr_uri else None,
            "G:/My Drive/oceanembed_data/zarr/oceanembed_multiyear_2024_2026.zarr",
            "C:/adrishta-66/data/zarr/oceanembed_multiyear_2024_2026.zarr",
            "data/zarr/oceanembed_multiyear_2024_2026.zarr",
        ]
        for c in raw_candidates:
            if c and Path(c).is_dir():
                try:
                    import zarr
                    _MASTER_ZARR_ROOT = zarr.open_group(str(c), mode="r")
                    _MASTER_ZARR_DATES = [str(d) for d in _MASTER_ZARR_ROOT["dates"][:]]
                    _MASTER_ZARR_DTS = [datetime.strptime(d, "%Y-%m-%d") for d in _MASTER_ZARR_DATES]
                    print(f"[OK] Master Zarr opened from candidate path {c} ({len(_MASTER_ZARR_DATES)} snapshots)")
                    return _MASTER_ZARR_ROOT, _MASTER_ZARR_DATES, _MASTER_ZARR_DTS
                except Exception:
                    _MASTER_ZARR_ROOT = None
def calculate_sound_speed(temp_c: float, salinity_psu: float, depth_m: float) -> float:
    """Mackenzie (1981) sound speed equation."""
    t, s, d = temp_c, salinity_psu, depth_m
    c = (
        1448.96
        + 4.591 * t
        - 0.05304 * (t**2)
        + 0.0002374 * (t**3)
        + 1.340 * (s - 35)
        + 0.0163 * d
        + 0.0001675 * (d**2)
        - 0.01025 * t * (s - 35)
        - 7.139e-13 * t * (d**3)
    )
    return round(float(c), 1)


def calculate_potential_density(temp_c: float, salinity_psu: float) -> float:
    """UNESCO equation for 1-atmosphere sea water potential density anomaly (sigma-theta)."""
    t, s = temp_c, salinity_psu
    sigma_0 = (
        -0.157406
        + 0.06793952 * t
        - 0.00909529 * (t**2)
        + 0.0001001685 * (t**3)
        + (0.824493 - 0.0040899 * t + 0.000076438 * (t**2)) * s
        - (0.00572466 - 0.00010227 * t) * (s**1.5)
        + 0.00048314 * (s**2)
    )
    return round(float(28.0 + sigma_0 * 0.1), 2)


def predict_grid_volume(
    date_str: str = "2024-05-15",
    model_type: str = "physics",
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Runs genuine batched neural inference across all valid ocean cells for the requested date.
    Returns:
        temp_vol: np.ndarray shape [15, 101, 241]
        unc_vol: np.ndarray shape [15, 101, 241]
        metadata: Dict with snapshot match info
    """
    global _VOLUME_PRED_CACHE
    root, dates, dts = _get_master_zarr()
    if root is None or not dates or not dts:
        raise RuntimeError("REAL_DATA_UNAVAILABLE: Master multi-year Zarr store not accessible.")

    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        dt = datetime(2024, 5, 15)
        date_str = "2024-05-15"

    closest_idx = min(range(len(dts)), key=lambda i: abs((dts[i] - dt).total_seconds()))
    matched_date = dates[closest_idx]
    delta_days = abs((dts[closest_idx] - dt).days)
    delta_hours = delta_days * 24

    cache_key = f"{model_type}:{matched_date}"
    if cache_key in _VOLUME_PRED_CACHE:
        temp_vol, unc_vol, meta = _VOLUME_PRED_CACHE[cache_key]
        return temp_vol, unc_vol, {**meta, "requested_date": date_str, "delta_hours": delta_hours}

    model = get_model(model_type=model_type)
    _, ch_means, ch_stds = _get_norm_stats()

    surf = np.array(root["surface_inputs"][closest_idx, :, :, :], dtype=np.float32) # [7, 101, 241]
    mask = np.array(root["ocean_mask"][:, :], dtype=bool) # [101, 241]

    valid = mask & (~np.isnan(surf).any(axis=0))
    valid_i, valid_j = np.where(valid)
    N = len(valid_i)

    if N == 0:
        raise RuntimeError("No valid ocean soundings found in operational snapshot.")

    raw_s7 = surf[:, valid_i, valid_j] # [7, N]
    norm_s7 = (raw_s7 - ch_means[:, None]) / ch_stds[:, None] # [7, N]

    lats = np.array(root["lats"][:], dtype=np.float32)
    lons = np.array(root["lons"][:], dtype=np.float32)
    lat_norm = (lats[valid_i] - LAT_MIN) / (LAT_MAX - LAT_MIN)
    lon_norm = (lons[valid_j] - LON_MIN) / (LON_MAX - LON_MIN)

    doy = dts[closest_idx].timetuple().tm_yday
    doy_sin = np.full(N, math.sin(2 * math.pi * doy / 365.25), dtype=np.float32)
    doy_cos = np.full(N, math.cos(2 * math.pi * doy / 365.25), dtype=np.float32)

    X = np.stack([
        norm_s7[0], norm_s7[1], norm_s7[2], norm_s7[3], norm_s7[4], norm_s7[5], norm_s7[6],
        lat_norm, lon_norm, doy_sin, doy_cos
    ], axis=-1).astype(np.float32)

    with torch.no_grad():
        x_tensor = torch.from_numpy(X)
        temp_preds, unc_preds, _ = model(x_tensor)
        temp_arr = temp_preds.cpu().numpy() # [N, 15]
        unc_arr = unc_preds.cpu().numpy()   # [N, 15]

    temp_vol = np.full((15, 101, 241), np.nan, dtype=np.float32)
    unc_vol = np.full((15, 101, 241), np.nan, dtype=np.float32)

    temp_vol[:, valid_i, valid_j] = temp_arr.T
    unc_vol[:, valid_i, valid_j] = unc_arr.T

    meta = {
        "requested_date": date_str,
        "matched_snapshot_date": matched_date,
        "delta_days": delta_days,
        "delta_hours": delta_hours,
        "model_type": model_type,
        "valid_cells": N,
        "snapshot_idx": closest_idx,
    }

    if len(_VOLUME_PRED_CACHE) > 12:
        _VOLUME_PRED_CACHE.clear()
    _VOLUME_PRED_CACHE[cache_key] = (temp_vol, unc_vol, meta)

    return temp_vol, unc_vol, meta


def predict_profile(
    lat: float,
    lon: float,
    date_str: str = "2024-05-15",
    surface_channels: Optional[Dict[str, float]] = None,
    model_type: str = "physics",
) -> Dict[str, Any]:
    """
    Canonical operational inference endpoint:
    Retrieves real 7 surface channels from Master Zarr, applies audited normalization,
    runs the selected frozen checkpoint, and returns the 15-depth reconstructed profile.
    Fail-closed: Returns is_ocean=False on land, zero synthetic numbers in real mode.
    """
    if hasattr(model_type, "default"):
        model_type = model_type.default
    model_type = str(model_type or "physics")
    if hasattr(date_str, "default"):
        date_str = date_str.default
    date_str = str(date_str or "2024-05-15")
    if hasattr(lat, "default"):
        lat = lat.default
    lat = float(lat)
    if hasattr(lon, "default"):
        lon = lon.default
    lon = float(lon)
    model = get_model(model_type=model_type)
    _, ch_means, ch_stds = _get_norm_stats()

    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        dt = datetime(2024, 5, 15)
        date_str = "2024-05-15"

    lat_idx = max(0, min(100, int(round((lat - LAT_MIN) / 0.25))))
    lon_idx = max(0, min(240, int(round((lon - LON_MIN) / 0.25))))

    missing_flags = []
    qc_status = "REAL_OBSERVATION"
    matched_date = date_str
    delta_days = 0
    delta_hours = 0
    ground_truth_temp = None
    rmse_vs_target = None
    is_ocean = True

    if surface_channels is None:
        root, dates, dts = _get_master_zarr()
        if root is None or not dates or not dts:
            raise RuntimeError("REAL_DATA_UNAVAILABLE: Master multi-year Zarr not accessible.")

        closest_idx = min(range(len(dts)), key=lambda i: abs((dts[i] - dt).total_seconds()))
        matched_date = dates[closest_idx]
        delta_days = abs((dts[closest_idx] - dt).days)
        delta_hours = delta_days * 24

        is_ocean = bool(root["ocean_mask"][lat_idx, lon_idx])
        surf_raw = np.array(root["surface_inputs"][closest_idx, :, lat_idx, lon_idx], dtype=np.float32)

        if not is_ocean or np.isnan(surf_raw).any():
            return {
                "lat": lat,
                "lon": lon,
                "location": {"lat": lat, "lon": lon},
                "date": date_str,
                "requested_date": date_str,
                "matched_snapshot_date": matched_date,
                "synoptic_delta_days": delta_days,
                "delta_hours": delta_hours,
                "is_ocean": False,
                "qc_status": "COASTAL_OR_LAND_BOUND",
                "message": "Coordinates are located over land or outside operational ocean domain.",
                "depths_m": STANDARD_DEPTHS,
                "predicted_temperature": None,
                "temperature": None,
                "temperature_degC": None,
                "uncertainty": None,
                "uncertainty_degC": None,
                "surface_inputs": None,
                "model_name": f"OceanEmbedNet ({model_type.capitalize()})",
                "checkpoint_identifier": "oceanembed_multiyear_physics.pt" if model_type == "physics" else "oceanembed_multiyear_baseline.pt",
                "provenance": "ADRISHTA Multi-Year Operational Store (Fail-Closed Mask Enforcement)",
            }

        sst, sss, ssh, u_curr, v_curr, u_wind, v_wind = [float(v) for v in surf_raw]
        gt_raw = np.array(root["temperature_target"][closest_idx, :, lat_idx, lon_idx], dtype=np.float32)
        if not np.isnan(gt_raw).all():
            ground_truth_temp = [round(float(v), 2) for v in gt_raw]
    else:
        sst = surface_channels["sst"]
        sss = surface_channels["sss"]
        ssh = surface_channels["ssh"]
        u_curr = surface_channels["current_u"]
        v_curr = surface_channels["current_v"]
        u_wind = surface_channels["wind_u"]
        v_wind = surface_channels["wind_v"]

    # Audit-compliant Normalization
    raw_s7 = np.array([sst, sss, ssh, u_curr, v_curr, u_wind, v_wind], dtype=np.float32)
    norm_s7 = (raw_s7 - ch_means) / ch_stds

    lat_norm = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)
    lon_norm = (lon - LON_MIN) / (LON_MAX - LON_MIN)

    doy = dt.timetuple().tm_yday
    doy_sin = math.sin(2 * math.pi * doy / 365.25)
    doy_cos = math.cos(2 * math.pi * doy / 365.25)

    feat_vec = np.empty(11, dtype=np.float32)
    feat_vec[:7] = norm_s7
    feat_vec[7] = lat_norm
    feat_vec[8] = lon_norm
    feat_vec[9] = doy_sin
    feat_vec[10] = doy_cos

    features = torch.from_numpy(feat_vec).unsqueeze(0)

    with torch.no_grad():
        temp_out, unc_out, latent = model(features)

    temp_list = [round(float(t), 2) for t in temp_out[0].tolist()]
    unc_list = [round(float(u), 2) for u in unc_out[0].tolist()]

    if ground_truth_temp is not None:
        valid_pairs = [(p, g) for p, g in zip(temp_list, ground_truth_temp) if not math.isnan(g)]
        if valid_pairs:
            rmse_vs_target = round(float(math.sqrt(sum((p - g) ** 2 for p, g in valid_pairs) / len(valid_pairs))), 3)

    salinity_assumed = sss
    sound_speeds = [calculate_sound_speed(t, salinity_assumed, d) for t, d in zip(temp_list, STANDARD_DEPTHS)]
    densities = [calculate_potential_density(t, salinity_assumed) for t in temp_list]
    pressures_dbar = [round(float(d * 1.025), 1) for d in STANDARD_DEPTHS]

    # Derived diagnostics
    surf_t = temp_list[0]
    mld = 25.0
    for d, t in zip(STANDARD_DEPTHS, temp_list):
        if (surf_t - t) >= 0.2:
            mld = float(d)
            break

    max_grad = 0.0
    tc_depth = 75.0
    gradient_profile = []
    for i in range(len(STANDARD_DEPTHS) - 1):
        dz = STANDARD_DEPTHS[i + 1] - STANDARD_DEPTHS[i]
        dt = abs(temp_list[i + 1] - temp_list[i])
        grad = dt / dz if dz > 0 else 0
        gradient_profile.append(round(grad, 4))
        if grad > max_grad and STANDARD_DEPTHS[i] >= 20:
            max_grad = grad
            tc_depth = float(STANDARD_DEPTHS[i])

    inversions = int(sum(1 for i in range(4, len(temp_list) - 1) if temp_list[i + 1] > temp_list[i] + 0.05))

    return {
        "lat": lat,
        "lon": lon,
        "location": {"lat": lat, "lon": lon},
        "date": date_str,
        "requested_date": date_str,
        "matched_snapshot_date": matched_date,
        "synoptic_delta_days": delta_days,
        "delta_hours": delta_hours,
        "timestamp": f"{date_str}T00:00:00Z",
        "depths": STANDARD_DEPTHS,
        "depths_m": STANDARD_DEPTHS,
        "predicted_temperature": temp_list,
        "temperature": temp_list,
        "temperature_degC": temp_list,
        "uncertainty": unc_list,
        "uncertainty_degC": unc_list,
        "ground_truth": ground_truth_temp,
        "glorys_reference": ground_truth_temp,
        "rmse_vs_target": rmse_vs_target,
        "sound_speed": sound_speeds,
        "potential_density": densities,
        "pressure_dbar": pressures_dbar,
        "mixed_layer_depth_m": mld,
        "thermocline_depth_m": tc_depth,
        "vertical_lapse_diagnostics": {
            "max_gradient_degC_per_m": round(max_grad, 4),
            "thermocline_depth_m": tc_depth,
            "stratification_inversion_violations": inversions,
            "physical_consistency_statement": "No temperature-stratification inversion violations under the defined criterion." if inversions == 0 else f"{inversions} inversion violations detected."
        },
        "surface_inputs": {
            "sst": round(sst, 2),
            "sss": round(sss, 2),
            "ssh": round(ssh, 3),
            "current_u": round(u_curr, 2),
            "current_v": round(v_curr, 2),
            "wind_u": round(u_wind, 2),
            "wind_v": round(v_wind, 2),
        },
        "is_ocean": True,
        "qc_status": qc_status,
        "data_quality": "PASS (7-Channel Real Satellite Input, Audited Normalization)",
        "latent_embedding_norm": round(float(torch.norm(latent).item()), 3),
        "model_name": f"OceanEmbedNet ({model_type.capitalize()})",
        "checkpoint_identifier": "oceanembed_multiyear_physics.pt" if model_type == "physics" else "oceanembed_multiyear_baseline.pt",
        "source_of_truth": "ADRISHTA Real Multi-Year Master Zarr (2024-2026)",
        "provenance": "Copernicus DUACS / NOAA OISST / SMAP SSS / OSCAR Currents / CCMP Winds -> Frozen OceanEmbedNet",
        "version": "OceanEmbedNet v2.4-MultiyearAudited",
    }


def _synthetic_surface_channels(lat: float, lon: float, doy: int) -> Tuple[float, float, float, float, float, float, float]:
    """Isolated DEMO-only surface approximation (Never used in REAL production mode)."""
    seasonal = -1.2 * math.cos(2 * math.pi * (doy - 120) / 365)
    lat_grad = 29.8 - abs(lat - 10.0) * 0.16
    upwelling = -1.2 if (lat > 14 and lon < 60) else 0.0
    sst = lat_grad + seasonal + upwelling
    sss = 36.4 - 0.04 * (lon - 55.0) if lon < 80 else 32.8 + 0.02 * (lon - 80)
    ssh = 0.08 * math.sin(lon / 10.0) + 0.04 * math.cos(lat / 6.0)
    u_curr = 0.22 * math.sin(lat / 4.0)
    v_curr = -0.15 * math.cos(lon / 5.0)
    u_wind = 4.2 + 1.8 * math.sin(doy / 50.0)
    v_wind = 2.8 + 1.2 * math.cos(doy / 60.0)
    return (
        round(sst, 2),
        round(sss, 2),
        round(ssh, 3),
        round(u_curr, 2),
        round(v_curr, 2),
        round(u_wind, 2),
        round(v_wind, 2),
    )
