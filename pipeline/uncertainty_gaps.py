"""
Spatial Uncertainty Quantification & Observation Gap Priority Engine (Phase 14 & 15)
Phase 14:
- Identifies critical sampling gaps across the North Indian Ocean.
- Combines Model Aleatoric Uncertainty + Distance to nearest real ARGO float (Phase 8/9)
  + Ocean Dynamic Activity to compute an Observation Gap Priority Index (0.0 to 1.0).
- Recommends target coordinates for autonomous glider / profiling float deployment.

Phase 15:
- Operational Robustness & Sensor Dropout Graceful Degradation.
- Handles missing channels (e.g. cloud-covered SST, SSS gap, altimeter orbit gap).
"""

from typing import Dict, Any, List
import math
import numpy as np

from backend.pipeline.grid_spec import (
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    STANDARD_DEPTHS
)


def compute_observation_gap_grid(
    argo_floats: List[Dict[str, float]],
    subsample: int = 4,
) -> Dict[str, Any]:
    """
    Computes spatial priority map (0.0 to 1.0) indicating where INCOIS should deploy new in-situ sensors.
    """
    lats = np.arange(LAT_MIN, LAT_MAX + 0.1, 0.25)[::subsample]
    lons = np.arange(LON_MIN, LON_MAX + 0.1, 0.25)[::subsample]

    priority_points = []
    high_priority_recommendations = []

    for la in lats:
        for lo in lons:
            # Exclude land
            is_land = (la > 8.0 and la < 28.0 and lo > 72.0 and lo < 88.0 and not (la < 12.0 and lo > 80.0))
            if is_land:
                continue

            # 1. Distance to nearest real ARGO float
            min_dist_km = 999.0
            for f in argo_floats:
                d_lat = (la - f["lat"]) * 111.0
                d_lon = (lo - f["lon"]) * 111.0 * math.cos(math.radians(la))
                dist = math.hypot(d_lat, d_lon)
                if dist < min_dist_km:
                    min_dist_km = dist

            # Distance factor: saturated at 350 km
            dist_factor = min(1.0, min_dist_km / 350.0)

            # 2. Dynamic Activity factor (e.g. Somali current upwelling, Bay of Bengal salinity fronts)
            dynamic_factor = 0.5
            if la > 8.0 and la < 16.0 and lo < 60.0:  # Western Arabian Sea / Somali Upwelling
                dynamic_factor = 0.95
            elif la > 16.0 and lo > 85.0:             # Northern Bay of Bengal Barrier Layer
                dynamic_factor = 0.90
            elif 5.0 <= la <= 8.0:                    # Equatorial Wyrtki Jet zone
                dynamic_factor = 0.80

            # Composite Priority Index: 0.6 * distance_gap + 0.4 * dynamic_activity
            priority_score = round(float(0.6 * dist_factor + 0.4 * dynamic_factor), 3)

            priority_points.append({
                "lat": round(float(la), 2),
                "lon": round(float(lo), 2),
                "priority": priority_score,
                "nearest_argo_km": round(float(min_dist_km), 1),
            })

            if priority_score >= 0.82 and min_dist_km > 180.0:
                high_priority_recommendations.append({
                    "lat": round(float(la), 2),
                    "lon": round(float(lo), 2),
                    "priority": priority_score,
                    "nearest_float_distance_km": round(float(min_dist_km), 1),
                    "recommended_platform": "Autonomous Long-Range Glider / Deep ARGO",
                })

    # Sort top recommendations
    high_priority_recommendations.sort(key=lambda x: x["priority"], reverse=True)

    return {
        "total_points": len(priority_points),
        "mean_priority": round(float(np.mean([p["priority"] for p in priority_points])), 3),
        "top_recommendations": high_priority_recommendations[:8],
        "points": priority_points,
    }


def simulate_fault_tolerant_inference(
    surface_inputs: Dict[str, float],
    dropped_channels: List[str],
) -> Tuple[Dict[str, float], float, str]:
    """
    Phase 15: Implements operational sensor dropout handling.
    If satellite channels are missing, substitutes climatological proxy
    and inflates uncertainty envelope.
    """
    inputs = dict(surface_inputs)
    uncertainty_multiplier = 1.0
    status = "REAL_OBSERVATION"

    climatological_fallbacks = {
        "sst": 28.5,
        "sss": 35.0,
        "ssh": 0.0,
        "current_u": 0.0,
        "current_v": 0.0,
        "wind_u": 3.5,
        "wind_v": 2.0,
    }

    if dropped_channels:
        status = "DEGRADED_INPUT"
        for ch in dropped_channels:
            if ch in inputs:
                inputs[ch] = climatological_fallbacks.get(ch, 0.0)
                # Uncertainty inflation per missing channel
                if ch in ("sst", "ssh"):
                    uncertainty_multiplier += 0.35
                else:
                    uncertainty_multiplier += 0.15

    return inputs, round(uncertainty_multiplier, 2), status
