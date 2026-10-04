"""
Scientific Feature Attribution & Explainability Engine (Phase 11)
Computes sensitivity & attribution of subsurface predictions to the 7 surface channels:
1. sst: Sea Surface Temperature (OSTIA/AVHRR)
2. sss: Sea Surface Salinity (SMAP/SMOS)
3. ssh: Sea Surface Height Anomaly (CMEMS DUACS Altimetry)
4. current_u: Zonal Surface Geostrophic Current
5. current_v: Meridional Surface Geostrophic Current
6. wind_u: Zonal 10m Neutral Wind (ASCAT)
7. wind_v: Meridional 10m Neutral Wind (ASCAT)
"""

from typing import Dict, Any, List
import math
import numpy as np
import torch

from backend.model.ocean_embed_net import get_model, _get_norm_stats, STANDARD_DEPTHS, CHANNELS
from backend.pipeline.grid_spec import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX


def compute_feature_attribution(
    lat: float,
    lon: float,
    surface_inputs: Dict[str, float],
    doy: int = 136,
    model_type: str = "physics",
) -> Dict[str, Any]:
    """
    Computes perturbation attribution for the 7 surface input channels using normalized gradients.
    """
    model = get_model(model_type=model_type)
    model.eval()
    _, ch_means, ch_stds = _get_norm_stats()

    channel_names = ["sst", "sss", "ssh", "current_u", "current_v", "wind_u", "wind_v"]
    
    sin_doy = math.sin(2 * math.pi * doy / 365.25)
    cos_doy = math.cos(2 * math.pi * doy / 365.25)
    lat_norm = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)
    lon_norm = (lon - LON_MIN) / (LON_MAX - LON_MIN)

    raw_s7 = np.array([
        surface_inputs.get("sst", 28.5),
        surface_inputs.get("sss", 35.0),
        surface_inputs.get("ssh", 0.0),
        surface_inputs.get("current_u", 0.0),
        surface_inputs.get("current_v", 0.0),
        surface_inputs.get("wind_u", 3.0),
        surface_inputs.get("wind_v", 2.0),
    ], dtype=np.float32)

    norm_s7 = (raw_s7 - ch_means) / ch_stds

    base_x = np.empty(11, dtype=np.float32)
    base_x[:7] = norm_s7
    base_x[7] = lat_norm
    base_x[8] = lon_norm
    base_x[9] = sin_doy
    base_x[10] = cos_doy

    # Perturbation delta in normalized space (0.1 std dev)
    delta_norm = 0.1

    sensitivities = {}
    channel_impact_mld = {}
    channel_impact_thermocline = {}
    channel_impact_deep = {}

    for c_idx, c_name in enumerate(channel_names):
        x_plus = base_x.copy()
        x_plus[c_idx] += delta_norm
        tensor_plus = torch.from_numpy(x_plus).unsqueeze(0)

        x_minus = base_x.copy()
        x_minus[c_idx] -= delta_norm
        tensor_minus = torch.from_numpy(x_minus).unsqueeze(0)

        with torch.no_grad():
            pred_plus, _, _ = model(tensor_plus)
            pred_minus, _, _ = model(tensor_minus)

        grad_vector = (pred_plus[0] - pred_minus[0]).cpu().numpy() / (2.0 * delta_norm)
        
        # Absolute response across strata
        resp_mld = float(np.mean(np.abs(grad_vector[:5])))       # 0-30m
        resp_th = float(np.mean(np.abs(grad_vector[5:11])))      # 50-200m
        resp_deep = float(np.mean(np.abs(grad_vector[11:])))     # 300-1000m
        overall_resp = float(np.mean(np.abs(grad_vector)))

        sensitivities[c_name] = round(overall_resp, 4)
        channel_impact_mld[c_name] = round(resp_mld, 4)
        channel_impact_thermocline[c_name] = round(resp_th, 4)
        channel_impact_deep[c_name] = round(resp_deep, 4)

    # Normalize overall importance to 100%
    total_sens = sum(sensitivities.values()) + 1e-6
    relative_importance = {
        c: round((v / total_sens) * 100.0, 1)
        for c, v in sensitivities.items()
    }

    top_channel = max(relative_importance, key=relative_importance.get)
    ssh_val = surface_inputs.get("ssh", 0.0)
    sst_val = surface_inputs.get("sst", 28.5)
    sss_val = surface_inputs.get("sss", 35.0)

    if top_channel == "ssh":
        narrative = f"Thermocline displacement dominated by altimetric SSH anomaly ({ssh_val:+.2f} m). Pycnocline depth responds to first baroclinic mode dynamic height."
    elif top_channel == "sst":
        narrative = f"Upper 0-50m thermal structure anchored by satellite radiometer SST ({sst_val:.2f} deg C). Mixed-layer heat content constrained by surface radiative flux."
    elif top_channel == "sss":
        narrative = f"Stratification gradient modulated by salinity ({sss_val:.2f} PSU). Halocline barrier-layer physics active in suppressing vertical turbulent heat exchange."
    else:
        narrative = f"Subsurface profile influenced by surface dynamic forcing ({top_channel.upper()}), driving Ekman pumping and horizontal advection."

    return {
        "method": "Normalized Finite-Difference Perturbation Attribution",
        "relative_importance_pct": relative_importance,
        "sensitivities_raw": sensitivities,
        "strata_impact": {
            "mixed_layer_0_30m": channel_impact_mld,
            "thermocline_50_200m": channel_impact_thermocline,
            "abyssal_300_1000m": channel_impact_deep,
        },
        "top_channel": top_channel,
        "top_channel_importance_pct": relative_importance[top_channel],
        "physical_interpretation": narrative,
        "is_model_derived": True,
    }
