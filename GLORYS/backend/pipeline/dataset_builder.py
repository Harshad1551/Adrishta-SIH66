"""
Aligned Training Sample Generator & PyTorch Dataset (Phase 4)
In-Memory Fast Tensor Caching for Sub-Second Epoch Training.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
import zarr

try:
    from backend.pipeline.grid_spec import (
        GRID_LATS,
        GRID_LONS,
        NUM_LATS,
        NUM_LONS,
        GRID_SHAPE,
        STANDARD_DEPTHS,
        NUM_DEPTHS,
        CHANNELS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
    )
except ImportError:
    from pipeline.grid_spec import (
        GRID_LATS,
        GRID_LONS,
        NUM_LATS,
        NUM_LONS,
        GRID_SHAPE,
        STANDARD_DEPTHS,
        NUM_DEPTHS,
        CHANNELS,
        LAT_MIN,
        LAT_MAX,
        LON_MIN,
        LON_MAX,
    )

TEMPORAL_SPLITS = {
    "train": ("2019-01-01", "2022-12-31"),
    "val":   ("2023-01-01", "2023-12-31"),
    "test":  ("2024-01-01", "2024-12-31"),
}


class OceanEmbedDataset(Dataset):
    def __init__(
        self,
        surface_zarr_path: str,
        target_zarr_path: str,
        split: str = "train",
        subsample_stride: int = 1,
    ):
        self.surface_zarr_path = Path(surface_zarr_path)
        self.target_zarr_path = Path(target_zarr_path)
        self.split = split
        self.stride = subsample_stride

        surf_root = zarr.open_group(str(self.surface_zarr_path), mode="r")
        target_root = zarr.open_group(str(self.target_zarr_path), mode="r")

        date_str = surf_root.attrs.get("date", "2024-05-15")
        self.date_str = date_str

        # Parse temporal features
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        doy = dt.timetuple().tm_yday
        doy_sin = float(np.sin(2 * np.pi * doy / 365.25))
        doy_cos = float(np.cos(2 * np.pi * doy / 365.25))

        # In-Memory Preloading: Entire dataset is under 2 MB
        if "surface_inputs" in surf_root:
            self.surface_inputs = np.array(surf_root["surface_inputs"], dtype=np.float32)
        else:
            self.surface_inputs = np.stack(
                [np.array(surf_root[ch], dtype=np.float32) for ch in CHANNELS], axis=0
            )

        self.temperature_target = np.array(target_root["temperature_target"], dtype=np.float32)
        ocean_mask = np.array(target_root["ocean_mask"][0], dtype=bool)

        # Precompute coordinate grids
        lat_grid, lon_grid = np.meshgrid(GRID_LATS, GRID_LONS, indexing="ij")
        self.lats = lat_grid.astype(np.float32)
        self.lons = lon_grid.astype(np.float32)
        self.lat_norms = (self.lats - LAT_MIN) / (LAT_MAX - LAT_MIN)
        self.lon_norms = (self.lons - LON_MIN) / (LON_MAX - LON_MIN)
        self.doy_sin = doy_sin
        self.doy_cos = doy_cos

        # Collect valid oceanic indices
        self.indices = []
        for la_idx in range(0, NUM_LATS, self.stride):
            for lo_idx in range(0, NUM_LONS, self.stride):
                if ocean_mask[la_idx, lo_idx] and not np.isnan(self.temperature_target[0, la_idx, lo_idx]):
                    self.indices.append((la_idx, lo_idx))

        print(f"[OK] OceanEmbedDataset [{split.upper()}]: Preloaded {len(self.indices)} active oceanic profiles in RAM (Date: {date_str})")

    def __len__(self) -> int:
        return len(self.indices)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        la_idx, lo_idx = self.indices[idx]

        # 7 surface channels (in-memory slice)
        surf_7 = self.surface_inputs[:, la_idx, lo_idx]

        # 11-D feature vector
        x_vec = np.empty(11, dtype=np.float32)
        x_vec[:7] = surf_7
        x_vec[7] = self.lat_norms[la_idx, lo_idx]
        x_vec[8] = self.lon_norms[la_idx, lo_idx]
        x_vec[9] = self.doy_sin
        x_vec[10] = self.doy_cos

        y_vec = self.temperature_target[:, la_idx, lo_idx]
        coords = np.array([self.lats[la_idx, lo_idx], self.lons[la_idx, lo_idx]], dtype=np.float32)

        return {
            "x": torch.from_numpy(x_vec),
            "y": torch.from_numpy(y_vec),
            "coords": torch.from_numpy(coords),
            "date": self.date_str,
        }
