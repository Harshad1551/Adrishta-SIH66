"""
Derived Physical Oceanographic Variables Engine (Phase 10)
Standardized physical formulations:
1. Sound Speed Profile c(z) — Mackenzie (1981) 9-term equation
2. Potential Density σ_θ(z) — UNESCO (1983) International Equation of State of Seawater (EOS-80)
3. Mixed Layer Depth (MLD) — de Boyer Montégut et al. (2004) ΔT = 0.2°C threshold from surface
4. Thermocline Depth & Gradient — Peak negative vertical thermal gradient max(|dT/dz|)
5. Ocean Heat Content (OHC_700) — Thermal energy integration 0 to 700 m (kJ/cm^2 and GJ/m^2)
"""

from typing import List, Dict, Any, Tuple
import math
import numpy as np

from backend.pipeline.grid_spec import STANDARD_DEPTHS, NUM_DEPTHS


def calculate_sound_speed_mackenzie(temp_c: float, salinity_psu: float, depth_m: float) -> float:
    """
    Mackenzie (1981) 9-term sound speed equation:
    Valid for: 2 <= T <= 30°C, 25 <= S <= 40 PSU, 0 <= D <= 8000 m.
    Accuracy: Standard error 0.07 m/s.
    """
    T = max(-2.0, min(35.0, temp_c))
    S = max(0.0, min(42.0, salinity_psu))
    D = max(0.0, float(depth_m))

    c = (
        1448.96
        + 4.591 * T
        - 5.304e-2 * (T ** 2)
        + 2.374e-4 * (T ** 3)
        + 1.340 * (S - 35.0)
        + 1.630e-2 * D
        + 1.675e-7 * (D ** 2)
        - 1.025e-2 * T * (S - 35.0)
        - 7.139e-13 * T * (D ** 3)
    )
    return round(float(c), 1)


def calculate_potential_density_unesco(temp_c: float, salinity_psu: float) -> float:
    """
    UNESCO 1983 / EOS-80 1-atm seawater density equation:
    Returns potential density anomaly sigma-theta (kg/m^3 - 1000).
    """
    T = float(temp_c)
    S = float(salinity_psu)

    # Pure water density at atmospheric pressure
    rho_pure = (
        999.842594
        + 6.793952e-2 * T
        - 9.095290e-3 * (T ** 2)
        + 1.001685e-4 * (T ** 3)
        - 1.120083e-6 * (T ** 4)
        + 6.536332e-9 * (T ** 5)
    )

    # Salinity-dependent coefficients
    A = (
        8.24493e-1
        - 4.0899e-3 * T
        + 7.6438e-5 * (T ** 2)
        - 8.2467e-7 * (T ** 3)
        + 5.3875e-9 * (T ** 4)
    )
    B = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * (T ** 2)
    C = 4.8314e-4

    rho = rho_pure + A * S + B * (S ** 1.5) + C * (S ** 2)
    sigma_theta = rho - 1000.0
    return round(float(sigma_theta), 2)


def calculate_mixed_layer_depth(depths_m: List[float], temps_c: List[float], delta_t: float = 0.2) -> float:
    """
    de Boyer Montégut et al. (2004) criterion:
    Depth where temperature drops by 0.2°C from surface (10m reference if 0m turbulent).
    """
    ref_idx = 0
    if len(temps_c) > 2 and depths_m[2] <= 10.0:
        ref_idx = 2
    surface_t = temps_c[ref_idx]

    for k in range(ref_idx + 1, len(depths_m)):
        if (surface_t - temps_c[k]) >= delta_t:
            # Linear interpolation for sub-grid resolution
            d_prev, d_curr = depths_m[k - 1], depths_m[k]
            t_prev, t_curr = temps_c[k - 1], temps_c[k]
            if abs(t_curr - t_prev) > 1e-4:
                frac = (surface_t - delta_t - t_prev) / (t_curr - t_prev)
                mld = d_prev + frac * (d_curr - d_prev)
            else:
                mld = d_curr
            return round(float(mld), 1)

    return float(depths_m[min(4, len(depths_m) - 1)])


def calculate_thermocline(depths_m: List[float], temps_c: List[float]) -> Tuple[float, float]:
    """
    Finds maximum negative vertical temperature gradient max(|dT/dz|).
    Returns (thermocline_depth_m, max_gradient_degC_per_m).
    """
    d_arr = np.array(depths_m, dtype=np.float32)
    t_arr = np.array(temps_c, dtype=np.float32)

    dz = d_arr[1:] - d_arr[:-1]
    dt = t_arr[1:] - t_arr[:-1]
    gradients = np.abs(dt / dz)

    max_idx = int(np.argmax(gradients))
    thermocline_depth = (d_arr[max_idx] + d_arr[max_idx + 1]) / 2.0
    max_gradient = float(gradients[max_idx])

    return round(float(thermocline_depth), 1), round(max_gradient, 3)


def calculate_ocean_heat_content(
    depths_m: List[float],
    temps_c: List[float],
    ref_temp_c: float = 26.0,
    max_depth: float = 700.0,
) -> Dict[str, float]:
    """
    Ocean Heat Content (OHC_700):
    OHC = integral_{0}^{700} rho_0 * c_p * (T(z) - 26) dz
    rho_0 ≈ 1025 kg/m^3, c_p ≈ 3990 J/(kg*K)
    Returns:
    - ohc_kj_cm2: Standard tropical cyclone intensity metric (e.g. > 50 kJ/cm^2 supports intensification)
    - ohc_gj_m2: SI units (Gigajoules per square meter)
    """
    rho_cp = 1025.0 * 3990.0 # J/(m^3 * K)
    d_arr = np.array(depths_m, dtype=np.float32)
    t_arr = np.array(temps_c, dtype=np.float32)

    # Filter up to max_depth
    mask = d_arr <= max_depth
    d_sub = d_arr[mask]
    t_sub = t_arr[mask]

    if len(d_sub) < 2:
        return {"ohc_kj_cm2": 0.0, "ohc_gj_m2": 0.0}

    # Only heat above ref_temp_c (26°C isotherm) contributes to tropical cyclone heat potential (TCHP)
    excess_t = np.maximum(0.0, t_sub - ref_temp_c)
    dz = d_sub[1:] - d_sub[:-1]
    avg_excess = (excess_t[:-1] + excess_t[1:]) / 2.0

    integral_j_m2 = float(np.sum(rho_cp * avg_excess * dz))
    ohc_gj_m2 = integral_j_m2 / 1e9
    ohc_kj_cm2 = (integral_j_m2 / 1e3) / 1e4 # 1 m^2 = 10,000 cm^2

    return {
        "ohc_kj_cm2": round(float(ohc_kj_cm2), 2),
        "ohc_gj_m2": round(float(ohc_gj_m2), 3),
        "tchp_favorable_cyclone_genesis": bool(ohc_kj_cm2 >= 50.0),
    }


def compute_all_derived_variables(
    depths_m: List[float],
    temps_c: List[float],
    surface_sss: float = 35.0,
) -> Dict[str, Any]:
    """
    Comprehensive physical variables package for any vertical temperature profile.
    """
    # 1. Salinity vertical profile proxy (standard NIO halocline: increases slightly with depth or constant)
    salinities = [
        round(surface_sss + (0.6 if d >= 100 else 0.02 * (d / 10.0)), 2)
        for d in depths_m
    ]

    # 2. Sound Speed Profile
    sound_speed = [
        calculate_sound_speed_mackenzie(t, s, d)
        for t, s, d in zip(temps_c, salinities, depths_m)
    ]

    # 3. Potential Density Profile
    potential_density = [
        calculate_potential_density_unesco(t, s)
        for t, s in zip(temps_c, salinities)
    ]

    # 4. Mixed Layer Depth
    mld = calculate_mixed_layer_depth(depths_m, temps_c)

    # 5. Thermocline
    th_depth, th_grad = calculate_thermocline(depths_m, temps_c)

    # 6. Ocean Heat Content
    ohc = calculate_ocean_heat_content(depths_m, temps_c)

    # 7. Acoustic SOFAR Channel Axis (Sound speed minimum)
    sofar_idx = int(np.argmin(sound_speed))
    sofar_axis_m = depths_m[sofar_idx]
    sound_speed_min = sound_speed[sofar_idx]

    return {
        "depths_m": depths_m,
        "temperature_degC": temps_c,
        "salinity_psu": salinities,
        "sound_speed_m_s": sound_speed,
        "potential_density_kg_m3": potential_density,
        "mixed_layer_depth_m": mld,
        "thermocline": {
            "depth_m": th_depth,
            "max_gradient_degC_per_m": th_grad,
        },
        "ocean_heat_content": ohc,
        "acoustic_channel": {
            "axis_depth_m": sofar_axis_m,
            "axis_sound_speed_m_s": sound_speed_min,
        },
    }
