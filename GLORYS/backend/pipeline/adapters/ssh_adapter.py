"""
SSH / SLA Real Data Adapter (DUACS / Copernicus)
"""

from pathlib import Path
import numpy as np
import xarray as xr

from pipeline.adapters.base_adapter import BaseSurfaceAdapter, AdapterResult


class SSHAdapter(BaseSurfaceAdapter):
    def __init__(self):
        super().__init__("ssh")

    def read_file(self, filepath: str, date_str: str) -> AdapterResult:
        path = Path(filepath)
        if not path.exists():
            return self.create_missing_result(date_str, f"SSH file not found at: {filepath}")

        try:
            with xr.open_dataset(str(path)) as ds:
                var_name = None
                for cand in ["adt", "sla", "zos", "ssh"]:
                    if cand in ds.variables:
                        var_name = cand
                        break

                if not var_name:
                    return self.create_missing_result(date_str, f"No recognized SSH variable in {list(ds.variables.keys())}")

                raw_arr = ds[var_name].squeeze().values
                lat_name = "lat" if "lat" in ds.coords else "latitude"
                lon_name = "lon" if "lon" in ds.coords else "longitude"

                raw_lats = ds[lat_name].values
                raw_lons = ds[lon_name].values

                return self.regrid_and_qc(raw_arr, raw_lats, raw_lons, date_str, version="DUACS-v2")
        except Exception as e:
            return self.create_missing_result(date_str, f"Error decoding SSH NetCDF: {str(e)}")
