import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch
from torch.utils.data import DataLoader
from pipeline.dataset_builder import OceanEmbedDataset

if __name__ == '__main__':
    surf_zarr = "data/zarr/surface_harmonized_2024-05-15.zarr"
    glorys_zarr = "data/zarr/glorys_target_2024-05-15.zarr"
    
    dataset = OceanEmbedDataset(surf_zarr, glorys_zarr, split="train", subsample_stride=2)
    loader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    batch = next(iter(loader))
    print(f"[OK] PyTorch Batch Created:")
    print(f"     X Shape (Features): {batch['x'].shape}")
    print(f"     Y Shape (15-Depths): {batch['y'].shape}")
    print(f"     Coords Shape: {batch['coords'].shape}")
    print(f"     Sample Lat/Lon: {batch['coords'][0].tolist()}")
    print(f"     Sample Target SST (0m): {batch['y'][0, 0].item():.2f} C")
    print(f"     Sample Target Deep (1000m): {batch['y'][0, -1].item():.2f} C")
