"""
OceanEmbed Multi-Year PyTorch Dataset & High-Throughput DataLoader (Phase 2)
Authoritative PyTorch Dataset for 2024-2026 multi-year real observation embeddings.
Pre-loads partitioned splits into RAM for sub-second epoch throughput.
Supports both full-depth (0-1000m) and bathymetry depth-masked shelf profiles.
"""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
import zarr

GRID_LATS = np.arange(5.0, 30.001, 0.25, dtype=np.float32)
GRID_LONS = np.arange(45.0, 105.001, 0.25, dtype=np.float32)
NUM_LATS = len(GRID_LATS)
NUM_LONS = len(GRID_LONS)
STANDARD_DEPTHS = np.array([0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000], dtype=np.float32)
NUM_DEPTHS = len(STANDARD_DEPTHS)
CHANNELS = ["sst", "sss", "ssh", "current_u", "current_v", "wind_u", "wind_v"]
LAT_MIN, LAT_MAX = 5.0, 30.0
LON_MIN, LON_MAX = 45.0, 105.0

DEFAULT_ZARR = r"G:\My Drive\oceanembed_data\zarr\oceanembed_multiyear_2024_2026.zarr"
DEFAULT_STATS = r"G:\My Drive\oceanembed_data\norm_stats_multiyear.json"


class OceanEmbedMultiyearDataset(Dataset):
    """
    Multi-Year PyTorch Dataset spanning 2024 (Train), 2025 (Val), and 2026 (Test).
    Features (11-D):
      0..6: Normalized Surface Channels [SST, SSS, SSH, Cur_U, Cur_V, Wind_U, Wind_V]
      7..8: Spatial Coords [Normalized Lat, Normalized Lon]
      9..10: Temporal DOY Harmonics [sin(2*pi*DOY/365.25), cos(2*pi*DOY/365.25)]
    Target (15-D):
      Subsurface Temperature Profile (deg C) at 15 INCOIS Standard Depths
    Mask (15-D):
      Boolean mask indicating valid depths above seabed (bathymetry)
    """

    def __init__(
        self,
        split: str = "train",
        zarr_path: Optional[str] = None,
        stats_path: Optional[str] = None,
        spatial_stride: int = 1,
        full_depth_only: bool = True,
        normalize_inputs: bool = True,
        return_salinity: bool = False,
    ):
        self.split = split.lower()
        if self.split not in ("train", "val", "test", "all"):
            raise ValueError(f"Invalid split: {split}. Expected 'train', 'val', 'test', or 'all'.")

        self.zarr_path = Path(zarr_path or DEFAULT_ZARR)
        self.stats_path = Path(stats_path or DEFAULT_STATS)
        self.spatial_stride = max(1, spatial_stride)
        self.full_depth_only = full_depth_only
        self.normalize_inputs = normalize_inputs
        self.return_salinity = return_salinity

        # 1. Load Normalization Statistics
        if not self.stats_path.exists():
            for c in [
                Path("pipeline/norm_stats_multiyear.json"),
                Path("/app/pipeline/norm_stats_multiyear.json"),
                Path("/tmp/oceanembed_data/norm_stats_multiyear.json"),
                Path(r"C:\adrishta-66\pipeline\norm_stats_multiyear.json"),
            ]:
                if c.exists():
                    self.stats_path = c
                    break

        with open(str(self.stats_path), "r", encoding="utf-8") as f:
            self.stats = json.load(f)

        partition_info = self.stats["temporal_partitions"]
        if self.split in partition_info:
            self.active_indices = partition_info[self.split]["indices"]
        else:
            total_ts = sum(len(partition_info[k]["indices"]) for k in ("train", "val", "test"))
            self.active_indices = list(range(total_ts))

        # Channel normalization vectors
        self.ch_means = np.zeros(7, dtype=np.float32)
        self.ch_stds = np.ones(7, dtype=np.float32)
        for idx, ch in enumerate(CHANNELS):
            st = self.stats["surface_channel_stats"].get(ch, {})
            self.ch_means[idx] = st.get("mean", 0.0)
            self.ch_stds[idx] = max(1e-4, st.get("std", 1.0))

        # 2. Open Zarr and Pre-load Active Split into RAM (~150-200 MB)
        root = zarr.open_group(str(self.zarr_path), mode="r")
        all_dates = [str(d) for d in root["dates"][:]]
        self.dates = [all_dates[i] for i in self.active_indices]
        self.depths = np.array(root["depths"][:], dtype=np.float32)
        self.ocean_mask = np.array(root["ocean_mask"][:], dtype=bool)

        # Slice arrays for active split
        self.surf_raw = np.array(root["surface_inputs"][self.active_indices], dtype=np.float32)
        self.temp_raw = np.array(root["temperature_target"][self.active_indices], dtype=np.float32)
        if self.return_salinity:
            self.sal_raw = np.array(root["salinity_target"][self.active_indices], dtype=np.float32)

        # 3. Precompute Spatial and Temporal Metadata
        lat_grid, lon_grid = np.meshgrid(GRID_LATS, GRID_LONS, indexing="ij")
        self.lats = lat_grid.astype(np.float32)
        self.lons = lon_grid.astype(np.float32)
        self.lat_norms = ((self.lats - LAT_MIN) / (LAT_MAX - LAT_MIN)).astype(np.float32)
        self.lon_norms = ((self.lons - LON_MIN) / (LON_MAX - LON_MIN)).astype(np.float32)

        # Temporal harmonics for each active timestep
        self.doy_harmonics = np.zeros((len(self.dates), 2), dtype=np.float32)
        for t_idx, d_str in enumerate(self.dates):
            dt = datetime.strptime(d_str, "%Y-%m-%d")
            doy = dt.timetuple().tm_yday
            self.doy_harmonics[t_idx, 0] = np.sin(2.0 * np.pi * doy / 365.25)
            self.doy_harmonics[t_idx, 1] = np.cos(2.0 * np.pi * doy / 365.25)

        # 4. Build Profile Index Map (timestep_idx, lat_idx, lon_idx)
        self.index_map = []
        n_times = len(self.dates)

        sub_lats = np.arange(0, NUM_LATS, self.spatial_stride)
        sub_lons = np.arange(0, NUM_LONS, self.spatial_stride)
        sub_mesh_la, sub_mesh_lo = np.meshgrid(sub_lats, sub_lons, indexing='ij')

        for t_idx in range(n_times):
            surf_t = self.surf_raw[t_idx] # (7, 101, 241)
            temp_t = self.temp_raw[t_idx] # (15, 101, 241)
            
            # Surface inputs must be completely non-NaN
            surf_valid = ~np.isnan(surf_t).any(axis=0) # (101, 241)
            
            if self.full_depth_only:
                depth_valid = ~np.isnan(temp_t[-1])
            else:
                depth_valid = ~np.isnan(temp_t[0])
                
            valid_2d = self.ocean_mask & surf_valid & depth_valid
            sub_valid = valid_2d[sub_mesh_la, sub_mesh_lo]
            
            valid_la = sub_mesh_la[sub_valid]
            valid_lo = sub_mesh_lo[sub_valid]
            
            for la_i, lo_i in zip(valid_la, valid_lo):
                self.index_map.append((t_idx, int(la_i), int(lo_i)))

        ram_mb = (self.surf_raw.nbytes + self.temp_raw.nbytes) / (1024 * 1024)
        print(f"[OK] OceanEmbedMultiyearDataset [{self.split.upper()}]: "
              f"{len(self.index_map):,} profiles across {n_times} weeks "
              f"({self.dates[0]} to {self.dates[-1]}), FullDepthOnly={self.full_depth_only}, "
              f"Stride={self.spatial_stride}, RAM Cache={ram_mb:.1f} MB")

    def __len__(self) -> int:
        return len(self.index_map)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        t_idx, la_i, lo_i = self.index_map[idx]

        s7 = self.surf_raw[t_idx, :, la_i, lo_i].copy()

        if self.normalize_inputs:
            s7 = (s7 - self.ch_means) / self.ch_stds

        # 11-D feature vector
        x_vec = np.empty(11, dtype=np.float32)
        x_vec[:7] = s7
        x_vec[7] = self.lat_norms[la_i, lo_i]
        x_vec[8] = self.lon_norms[la_i, lo_i]
        x_vec[9] = self.doy_harmonics[t_idx, 0]
        x_vec[10] = self.doy_harmonics[t_idx, 1]

        y_temp_raw = self.temp_raw[t_idx, :, la_i, lo_i].copy()
        mask = ~np.isnan(y_temp_raw)
        
        # Replace bathymetric NaNs with 0.0
        y_temp_clean = np.where(mask, y_temp_raw, 0.0).astype(np.float32)

        out = {
            "x": torch.from_numpy(x_vec),
            "y": torch.from_numpy(y_temp_clean),
            "mask": torch.from_numpy(mask.astype(bool)),
            "coords": torch.tensor([self.lats[la_i, lo_i], self.lons[la_i, lo_i]], dtype=torch.float32),
            "timestep_idx": t_idx,
            "date": self.dates[t_idx],
        }

        if self.return_salinity:
            sal_raw = self.sal_raw[t_idx, :, la_i, lo_i].copy()
            sal_clean = np.where(~np.isnan(sal_raw), sal_raw, 35.0).astype(np.float32)
            out["y_sal"] = torch.from_numpy(sal_clean)

        return out


def get_multiyear_dataloaders(
    batch_size: int = 256,
    train_stride: int = 1,
    val_stride: int = 2,
    full_depth_only: bool = True,
    num_workers: int = 0,
    zarr_path: Optional[str] = None,
    stats_path: Optional[str] = None,
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    """Factory creating Train (2024), Val (2025), and Test (2026) DataLoaders."""
    train_ds = OceanEmbedMultiyearDataset(
        split="train",
        spatial_stride=train_stride,
        full_depth_only=full_depth_only,
        zarr_path=zarr_path,
        stats_path=stats_path,
    )
    val_ds = OceanEmbedMultiyearDataset(
        split="val",
        spatial_stride=val_stride,
        full_depth_only=full_depth_only,
        zarr_path=zarr_path,
        stats_path=stats_path,
    )
    test_ds = OceanEmbedMultiyearDataset(
        split="test",
        spatial_stride=val_stride,
        full_depth_only=full_depth_only,
        zarr_path=zarr_path,
        stats_path=stats_path,
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )

    return train_loader, val_loader, test_loader
