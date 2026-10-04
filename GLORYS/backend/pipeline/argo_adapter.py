"""
ARGO In-Situ Ingestion & Quality Control Adapter (Phase 8)
Extracts real ARGO profiling floats from Coriolis GDAC / INCOIS NetCDF files,
filters for North Indian Ocean domain (5°N–30°N, 45°E–105°E),
applies strict WMO Quality Control (QC 1 & 2),
and interpolates onto the 15 standard INCOIS depths.

SCIENTIFIC PRINCIPLE:
ARGO data is strictly reserved for POST-HOC INDEPENDENT VALIDATION.
Under no circumstances is this data leaked into the model training pipeline.
"""

from pathlib import Path
import json
from typing import List, Dict, Any, Optional
import numpy as np
import xarray as xr
from scipy.interpolate import interp1d

from backend.pipeline.grid_spec import (
    LAT_MIN, LAT_MAX, LON_MIN, LON_MAX,
    STANDARD_DEPTHS, NUM_DEPTHS
)


def pres_to_depth_m(pressure_dbar: np.ndarray, lat_deg: float) -> np.ndarray:
    """
    Saunders & Fofonoff (1976) UNESCO standard pressure to depth conversion.
    Approximation: z (m) ≈ P (dbar) / (1.025 * 0.98) ≈ P * 0.993
    """
    x = np.sin(np.deg2rad(lat_deg)) ** 2
    g = 9.780318 * (1.0 + (5.2788e-3 + 2.36e-5 * x) * x)
    return (pressure_dbar * 1e4) / (1025.0 * g)


def process_argo_netcdf(file_path: Path) -> List[Dict[str, Any]]:
    """
    Parses a single ARGO daily NetCDF file and extracts valid NIO profiles.
    """
    valid_profiles = []
    try:
        ds = xr.open_dataset(file_path)
    except Exception as e:
        print(f"[ERR] Failed to open {file_path.name}: {e}")
        return []

    lats = ds["LATITUDE"].values
    lons = ds["LONGITUDE"].values
    julds = ds["JULD"].values
    platforms = ds["PLATFORM_NUMBER"].values
    cycles = ds["CYCLE_NUMBER"].values
    temps = ds["TEMP"].values
    pressures = ds["PRES"].values
    temp_qcs = ds["TEMP_QC"].values

    n_prof = len(lats)

    for i in range(n_prof):
        lat = float(lats[i])
        lon = float(lons[i])

        # 1. Geographic Domain Bounding Check (North Indian Ocean)
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue

        if np.isnan(lat) or np.isnan(lon):
            continue

        # 2. Extract Platform Number and Cycle
        raw_plat = platforms[i]
        if isinstance(raw_plat, bytes):
            plat_str = raw_plat.decode("utf-8", errors="ignore").strip()
        elif hasattr(raw_plat, "tolist"):
            plat_bytes = raw_plat.tolist()
            plat_str = "".join([c.decode("utf-8", errors="ignore") if isinstance(c, bytes) else str(c) for c in plat_bytes]).strip()
        else:
            plat_str = str(raw_plat).strip()

        # Clean non-digit characters if any
        wmo_clean = "".join(filter(str.isdigit, plat_str))
        if not wmo_clean:
            wmo_clean = f"ARGO-{i:03d}"

        cycle_no = int(cycles[i]) if not np.isnan(cycles[i]) else 0

        # Timestamp
        juld_val = julds[i]
        ts_str = str(juld_val).split(".")[0] + "Z"
        date_str = ts_str.split("T")[0]

        # 3. Extract Profile Variables and Quality Flags
        p_row = pressures[i, :]
        t_row = temps[i, :]
        qc_row = temp_qcs[i, :]

        # Strict Quality Control: Only QC 1 (Good) and 2 (Probably Good)
        # Avoid numpy isin mixed typecasting bugs by checking byte/string values directly
        good_qc = np.array([x in (b"1", b"2", "1", "2") for x in qc_row], dtype=bool)
        good_mask = good_qc & ~np.isnan(t_row) & ~np.isnan(p_row)

        if np.sum(good_mask) < 8:
            continue

        valid_p = p_row[good_mask]
        valid_t = t_row[good_mask]

        # Sort monotonically by pressure
        sort_idx = np.argsort(valid_p)
        valid_p = valid_p[sort_idx]
        valid_t = valid_t[sort_idx]

        # Convert pressure to depth
        depths_m = pres_to_depth_m(valid_p, lat)

        # Check depth span: Must have observations near surface (<= 25m) and at least 250m deep
        if depths_m[0] > 25.0 or depths_m[-1] < 250.0:
            continue

        # 4. Vertical Interpolation to 15 Standard INCOIS Depths
        try:
            # Linear interpolation with constant surface extrapolation if <= 10m
            interp_func = interp1d(
                depths_m,
                valid_t,
                kind="linear",
                bounds_error=False,
                fill_value=(valid_t[0], valid_t[-1])
            )
            standard_temps = interp_func(STANDARD_DEPTHS)
        except Exception:
            continue

        # Check for unphysical extremes in tropical ocean
        if np.any(standard_temps < 1.0) or np.any(standard_temps > 35.0):
            continue

        profile_record = {
            "wmo_id": f"WMO-{wmo_clean}",
            "cycle_number": cycle_no,
            "timestamp": ts_str,
            "date": date_str,
            "lat": round(lat, 3),
            "lon": round(lon, 3),
            "depths_m": STANDARD_DEPTHS,
            "temperatures_degC": [round(float(v), 2) for v in standard_temps],
            "surface_sst": round(float(standard_temps[0]), 2),
            "max_observed_depth_m": round(float(depths_m[-1]), 1),
            "raw_levels_count": int(np.sum(good_mask)),
            "quality_flag": "QC_GOOD_1_2",
            "is_synthetic": False,
            "source": "International Argo Programme (Coriolis GDAC / INCOIS)",
        }
        valid_profiles.append(profile_record)

    return valid_profiles


def ingest_all_argo_profiles(
    raw_dir: str = "c:/adrishta-66/data/raw/argo",
    out_dir: str = "c:/adrishta-66/data/argo",
) -> List[Dict[str, Any]]:
    raw_path = Path(raw_dir)
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    nc_files = sorted(list(raw_path.glob("*.nc")))
    print(f"\n[ARGO ADAPTER] Found {len(nc_files)} NetCDF daily files in {raw_path}")

    all_profiles = []
    for f in nc_files:
        profs = process_argo_netcdf(f)
        print(f"  Processed {f.name}: {len(profs)} valid NIO profiles")
        all_profiles.extend(profs)

    # Sort profiles chronologically
    all_profiles.sort(key=lambda p: (p["date"], p["wmo_id"]))

    out_file = out_path / "argo_profiles_real_may2024.json"
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(
            {
                "dataset": "International Argo Programme (North Indian Ocean In-Situ Floats)",
                "domain": f"{LAT_MIN}N-{LAT_MAX}N, {LON_MIN}E-{LON_MAX}E",
                "role": "INDEPENDENT_EVALUATION_ONLY",
                "validation_use_prohibited": False,
                "training_use_prohibited": True,
                "total_profiles": len(all_profiles),
                "profiles": all_profiles,
            },
            fp,
            indent=2,
        )

    print(f"\n[OK] Successfully ingested {len(all_profiles)} real ARGO in-situ profiles!")
    print(f"     Saved canonical in-situ database to: {out_file}\n")
    return all_profiles


if __name__ == "__main__":
    ingest_all_argo_profiles()
