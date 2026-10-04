"""
Surface Winds (U, V) Real Data Adapter (NASA CCMP / Copernicus)
"""

from pathlib import Path
from typing import Tuple
import numpy as np
import xarray as xr

from pipeline.adapters.base_adapter import BaseSurfaceAdapter, AdapterResult


class WindsAdapter:
    def __init__(self):
        self._u_adapter = _ComponentWindAdapter("wind_u")
        self._v_adapter = _ComponentWindAdapter("wind_v")

    def read_file(self, filepath: str, date_str: str) -> Tuple[AdapterResult, AdapterResult]:
        path = Path(filepath)
        if not path.exists():
            return (
                self._u_adapter.create_missing_result(date_str, f"Winds file not found at: {filepath}"),
                self._v_adapter.create_missing_result(date_str, f"Winds file not found at: {filepath}"),
            )

        try:
            with xr.open_dataset(str(path)) as ds:
                u_cand = ["uwnd", "u10", "u_wind", "eastward_wind"]
                v_cand = ["vwnd", "v10", "v_wind", "northward_wind"]

                u_name = next((c for c in u_cand if c in ds.variables), None)
                v_name = next((c for c in v_cand if c in ds.variables), None)

                if not u_name or not v_name:
                    err = f"Could not find U/V winds in variables: {list(ds.variables.keys())}"
                    return (
                        self._u_adapter.create_missing_result(date_str, err),
                        self._v_adapter.create_missing_result(date_str, err),
                    )

                u_raw = ds[u_name].squeeze().values
                v_raw = ds[v_name].squeeze().values

                lat_name = "lat" if "lat" in ds.coords else "latitude"
                lon_name = "lon" if "lon" in ds.coords else "longitude"
                raw_lats = ds[lat_name].values
                raw_lons = ds[lon_name].values

                res_u = self._u_adapter.regrid_and_qc(u_raw, raw_lats, raw_lons, date_str, version="CCMP-v3")
                res_v = self._v_adapter.regrid_and_qc(v_raw, raw_lats, raw_lons, date_str, version="CCMP-v3")
                return res_u, res_v
        except Exception as e:
            err = f"Error reading Winds NetCDF: {str(e)}"
            return (
                self._u_adapter.create_missing_result(date_str, err),
                self._v_adapter.create_missing_result(date_str, err),
            )


class _ComponentWindAdapter(BaseSurfaceAdapter):
    def __init__(self, channel: str):
        super().__init__(channel)

    def read_file(self, filepath: str, date_str: str) -> AdapterResult:
        return self.create_missing_result(date_str, "Use WindsAdapter to read combined U/V")
