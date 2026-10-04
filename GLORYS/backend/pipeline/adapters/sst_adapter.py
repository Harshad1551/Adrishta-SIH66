"""
SST Real Data Adapter (OSTIA / Copernicus)
"""

from pathlib import Path
import numpy as np
import xarray as xr

from pipeline.adapters.base_adapter import BaseSurfaceAdapter, AdapterResult


class SSTAdapter(BaseSurfaceAdapter):
    def __init__(self):
        super().__init__("sst")

    def read_file(self, filepath: str, date_str: str) -> AdapterResult:
        path = Path(filepath)
        if not path.exists():
            return self.create_missing_result(date_str, f"SST file not found at: {filepath}")

        try:
            with xr.open_dataset(str(path)) as ds:
                # Identify SST variable
                var_name = None
                for cand in ["analysed_sst", "sst", "thetao", "sea_surface_temperature"]:
                    if cand in ds.variables:
                        var_name = cand
                        break

                if not var_name:
                    return self.create_missing_result(date_str, f"No recognized SST variable in {list(ds.variables.keys())}")

                raw_arr = ds[var_name].squeeze().values
                lat_name = "lat" if "lat" in ds.coords else "latitude"
                lon_name = "lon" if "lon" in ds.coords else "longitude"

                raw_lats = ds[lat_name].values
                raw_lons = ds[lon_name].values

                # Unit normalization: Kelvin to Celsius
                if np.nanmean(raw_arr) > 200.0:
                    raw_arr = raw_arr - 273.15

                return self.regrid_and_qc(raw_arr, raw_lats, raw_lons, date_str, version="OSTIA-v2")
        except Exception as e:
            return self.create_missing_result(date_str, f"Error decoding SST NetCDF: {str(e)}")
