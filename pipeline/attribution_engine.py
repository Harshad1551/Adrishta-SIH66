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

Physical Principles:
- Surface Layer (0-30m): Dominated by SST and local wind stress mixing.
- Thermocline (50-200m): Dominated by SSH (1st baroclinic mode / pycnocline displacement) and Ekman pumping.
- Northern Bay of Bengal Barrier Layer: Heavily modulated by SSS river runoff plume.
"""

from typing import Dict, Any, List
import math
import numpy as np
import torch

from backend.model.ocean_embed_net import get_model, STANDARD_DEPTHS, CHANNELS
from backend.pipeline.grid_spec import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX


def compute_feature_attribution(
    lat: float,
    lon: float,
    surface_inputs: Dict[str, float],
    doy: int = 136,
) -> Dict[str, Any]:
    """
    Computes perturbation attribution for the 7 surface input channels.
    """
    model = get_model()
    model.eval()

    channel_names = ["sst", "sss", "ssh", "current_u", "current_v", "wind_u", "wind_v"]
    
    # Base input vector [1, 11]
    sin_doy = math.sin(2 * math.pi * doy / 365.0)
    cos_doy = math.cos(2 * math.pi * doy / 365.0)
    lat_norm = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)
    lon_norm = (lon - LON_MIN) / (LON_MAX - LON_MIN)

    base_x = [
        surface_inputs.get("sst", 28.5),
        surface_inputs.get("sss", 35.0),
        surface_inputs.get("ssh", 0.0),
        surface_inputs.get("current_u", 0.0),
        surface_inputs.get("current_v", 0.0),
        surface_inputs.get("wind_u", 3.0),
        surface_inputs.get("wind_v", 2.0),
        lat_norm,
        lon_norm,
        sin_doy,
        cos_doy,
    ]

    base_tensor = torch.tensor([base_x], dtype=torch.float32, requires_grad=True)
    base_pred, _, _ = model(base_tensor)
    base_profile = base_pred[0].detach().numpy()

    # Numerical perturbation scales (representing ~1 standard deviation in tropical NIO)
    scales = {
        "sst": 0.5,       # ±0.5 °C
        "sss": 0.3,       # ±0.3 PSU
        "ssh": 0.05,      # ±0.05 m (5 cm)
        "current_u": 0.15,# ±0.15 m/s
        "current_v": 0.15,# ±0.15 m/s
        "wind_u": 1.5,    # ±1.5 m/s
        "wind_v": 1.5,    # ±1.5 m/s
    }

    sensitivities = {}
    channel_impact_mld = {}
    channel_impact_thermocline = {}
    channel_impact_deep = {}

    for c_idx, c_name in enumerate(channel_names):
        delta = scales[c_name]
        
        x_plus = list(base_x)
        x_plus[c_idx] += delta
        tensor_plus = torch.tensor([x_plus], dtype=torch.float32)

        x_minus = list(base_x)
        x_minus[c_idx] -= delta
        tensor_minus = torch.tensor([x_minus], dtype=torch.float32)

        with torch.no_grad():
            pred_plus, _, _ = model(tensor_plus)
            pred_minus, _, _ = model(tensor_minus)

        grad_vector = (pred_plus[0] - pred_minus[0]).numpy() / (2.0 * delta)
        
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

    # Generate physical narrative
    top_channel = max(relative_importance, key=relative_importance.get)
    ssh_val = surface_inputs.get("ssh", 0.0)
    sst_val = surface_inputs.get("sst", 28.5)
    sss_val = surface_inputs.get("sss", 35.0)

    narratives = []
    if relative_importance.get("ssh", 0) >= 15.0:
        if ssh_val > 0.04:
            narratives.append(f"Positive SSH anomaly (+{ssh_val:.2f} m) indicates downwelling pycnocline depression, deepening the thermocline.")
        elif ssh_val < -0.04:
            narratives.append(f"Negative SSH anomaly ({ssh_val:.2f} m) reflects cyclonic divergence, lifting cold subsurface water.")
    
    if lon > 80.0 and sss_val < 33.5:
        narratives.append(f"Low surface salinity ({sss_val:.2f} PSU) in the Bay of Bengal indicates a freshwater barrier layer inhibiting vertical heat exchange.")
    
    if not narratives:
        narratives.append(f"Reconstruction driven primarily by {top_channel.upper()} ({relative_importance[top_channel]}% influence) with strong hydrostatic thermal coupling.")

    return {
        "location": {"lat": lat, "lon": lon},
        "overall_importance_pct": relative_importance,
        "strata_attribution": {
            "mixed_layer_0_30m": channel_impact_mld,
            "thermocline_50_200m": channel_impact_thermocline,
            "deep_ocean_300_1000m": channel_impact_deep,
        },
        "primary_driver": top_channel,
        "scientific_rationale": " ".join(narratives),
    }
