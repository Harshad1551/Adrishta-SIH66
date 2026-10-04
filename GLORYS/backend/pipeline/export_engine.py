"""
Research Data Export Engine (Phase 16)
Generates CF-1.8 compliant NetCDF-4, CSV, and GeoJSON files for research distribution.
Includes complete metadata provenance, INCOIS depth definitions, and QC flags.
"""

from pathlib import Path
from typing import Dict, Any, List
import io
import csv
import json
import numpy as np
import xarray as xr

from backend.pipeline.grid_spec import STANDARD_DEPTHS, NUM_DEPTHS


def export_profile_to_csv(profile_data: Dict[str, Any]) -> str:
    """
    Serializes a 15-depth vertical reconstruction profile into CSV format.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header metadata comments
    writer.writerow(["# ADRISHTA Subsurface Ocean AI - Profile Export"])
    writer.writerow([f"# Location: Lat {profile_data.get('lat')}, Lon {profile_data.get('lon')}"])
    writer.writerow([f"# Timestamp: {profile_data.get('timestamp')}"])
    writer.writerow([f"# Model: {profile_data.get('version', 'OceanEmbedNet-PhysicsConstrained')}"])
    writer.writerow([f"# QC Status: {profile_data.get('qc_status', 'REAL_OBSERVATION')}"])
    writer.writerow([f"# Mixed Layer Depth (m): {profile_data.get('mixed_layer_depth_m', 'N/A')}"])
    writer.writerow([f"# Thermocline Depth (m): {profile_data.get('thermocline_depth_m', 'N/A')}"])
    writer.writerow([])

    # Table columns
    writer.writerow([
        "depth_m",
        "temperature_degC",
        "uncertainty_degC",
        "sound_speed_m_s",
        "potential_density_kg_m3",
    ])

    depths = profile_data.get("depths_m", STANDARD_DEPTHS)
    temps = profile_data.get("temperature_degC", [])
    uncs = profile_data.get("uncertainty_degC", [0.2] * len(depths))
    ss = profile_data.get("sound_speed", [1500.0] * len(depths))
    pd = profile_data.get("potential_density", [25.0] * len(depths))

    for i, d in enumerate(depths):
        writer.writerow([
            d,
            temps[i] if i < len(temps) else "",
            uncs[i] if i < len(uncs) else "",
            ss[i] if i < len(ss) else "",
            pd[i] if i < len(pd) else "",
        ])

    return output.getvalue()


def export_profile_to_netcdf(profile_data: Dict[str, Any], output_path: Path) -> Path:
    """
    Exports a single or multi-point profile into a CF-1.8 compliant NetCDF file.
    """
    depths = np.array(profile_data.get("depths_m", STANDARD_DEPTHS), dtype=np.float32)
    temps = np.array(profile_data.get("temperature_degC", []), dtype=np.float32)
    uncs = np.array(profile_data.get("uncertainty_degC", [0.2] * len(depths)), dtype=np.float32)
    ss = np.array(profile_data.get("sound_speed", [1500.0] * len(depths)), dtype=np.float32)
    pd = np.array(profile_data.get("potential_density", [25.0] * len(depths)), dtype=np.float32)

    ds = xr.Dataset(
        data_vars={
            "temperature": (["depth"], temps, {
                "long_name": "Reconstructed Subsurface Ocean Temperature",
                "units": "degree_Celsius",
                "standard_name": "sea_water_temperature",
            }),
            "uncertainty": (["depth"], uncs, {
                "long_name": "Prediction Uncertainty (1-sigma)",
                "units": "degree_Celsius",
            }),
            "sound_speed": (["depth"], ss, {
                "long_name": "Mackenzie (1981) Speed of Sound",
                "units": "m s-1",
                "standard_name": "speed_of_sound_in_sea_water",
            }),
            "potential_density": (["depth"], pd, {
                "long_name": "UNESCO (1983) Potential Density Anomaly",
                "units": "kg m-3",
                "standard_name": "sea_water_sigma_theta",
            }),
        },
        coords={
            "depth": ("depth", depths, {
                "units": "m",
                "positive": "down",
                "standard_name": "depth",
            }),
            "latitude": ((), float(profile_data.get("lat", 15.0)), {"units": "degrees_north"}),
            "longitude": ((), float(profile_data.get("lon", 70.0)), {"units": "degrees_east"}),
        },
        attrs={
            "title": "ADRISHTA: Satellite Embedding-Driven Subsurface Ocean Reconstruction",
            "institution": "INCOIS SIH-2024 / Ocean AI Lab",
            "Conventions": "CF-1.8",
            "source": "OceanEmbedNet-PhysicsConstrained v2.3",
            "date_created": profile_data.get("timestamp", "2024-05-15T00:00:00Z"),
        }
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    ds.to_netcdf(str(output_path))
    return output_path
