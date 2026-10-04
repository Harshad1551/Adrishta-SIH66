import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.glorys_adapter import create_synthetic_glorys_baseline_zarr

path = create_synthetic_glorys_baseline_zarr("2024-05-15")
print(f"[OK] Successfully exported GLORYS Target to: {path}")
