"""
ADRISHTA: Real Ocean AI API Server (FastAPI)
Serves 15-depth physical ocean reconstruction, ARGO collocations, and attribution.
Production-grade real data integration: Zero synthetic data fallback in REAL mode.
"""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.cache import cache
from backend.routes import profile, grid, validation, auth, diagnostics
from backend.model.ocean_embed_net import _get_master_zarr, _get_norm_stats

env_file = Path('C:/adrishta-66/.env')
if env_file.is_file():
    load_dotenv(dotenv_path=env_file)
load_dotenv()

app = FastAPI(
    title="ADRISHTA: Subsurface Ocean AI Engine",
    description="Satellite Embedding-Driven 3D Subsurface Ocean Temperature Reconstruction (0.25 deg NIO)",
    version="2.4.0",
)

# Allow Cross-Origin Requests from the React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Route Modules
app.include_router(profile.router, prefix="/api/v1", tags=["Profile Reconstruction"])
app.include_router(grid.router, prefix="/api/v1", tags=["Gridded Fields"])
app.include_router(validation.router, prefix="/api/v1", tags=["ARGO Validation"])
app.include_router(diagnostics.router, prefix="/api/v1", tags=["Scientific Diagnostics & Export"])
app.include_router(auth.router, prefix="/api/v1", tags=["User Authentication & Workspace"])


@app.get("/api/v1/health")
def health_check():
    """
    Production health & diagnostics endpoint:
    Reports external storage status, model checkpoints, and normalization integrity.
    """
    root, dates, dts = _get_master_zarr()
    zarr_available = root is not None and dates is not None and len(dates) > 0

    phys_ckpt = Path("C:/adrishta-66/checkpoints/oceanembed_multiyear_physics.pt")
    base_ckpt = Path("C:/adrishta-66/checkpoints/oceanembed_multiyear_baseline.pt")
    phys_exists = phys_ckpt.is_file()
    base_exists = base_ckpt.is_file()

    norm_exists = False
    try:
        norm_dict, _, _ = _get_norm_stats()
        norm_exists = norm_dict is not None
    except Exception:
        norm_exists = False

    is_ready = zarr_available and phys_exists and norm_exists

    return {
        "status": "online" if is_ready else "degraded",
        "service": "ADRISHTA Real Ocean Data Engine",
        "domain": "North Indian Ocean (5N-30N, 45E-105E)",
        "grid": "0.25 deg x 0.25 deg",
        "depths": 15,
        "data_status": "READY" if is_ready else "UNAVAILABLE",
        "fail_closed_mode": True,
        "storage": {
            "zarr_available": zarr_available,
            "configured_path": os.getenv("OCEANEMBED_ZARR_PATH", "G:/My Drive/oceanembed_data/zarr/oceanembed_multiyear_2024_2026.zarr"),
            "snapshot_count": len(dates) if dates else 0,
            "date_range": [dates[0], dates[-1]] if dates else None,
            "storage_mode": "External Master Zarr Store",
        },
        "models": {
            "physics_checkpoint_available": phys_exists,
            "baseline_checkpoint_available": base_exists,
            "normalization_available": norm_exists,
        },
        "governance": {
            "training_partition": "2024",
            "audited_oos_holdout": "2025",
            "operational_synoptic_data": "2026",
        },
        "version": "2.4.0-ProductionRealData",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
