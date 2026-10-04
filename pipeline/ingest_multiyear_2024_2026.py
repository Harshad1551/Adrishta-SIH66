"""
Multi-Year (2024, 2025, 2026) Operational Ingestion Engine for OceanEmbed
Fetches weekly synoptic ocean snapshots directly to Google Drive (oceanembed_data).
Channels ingested per timestep:
  - 3D Potential Temperature: cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m
  - 3D Salinity: cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m
  - Surface/Depth Currents: cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m
  - Sea Surface Height: cmems_mod_glo_phy_anfc_0.083deg_P1D-m
Updates G:\My Drive\oceanembed_data\ingestion_status.json after every date.
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import copernicusmarine

DATA_ROOT = Path(os.environ.get("DATA_ROOT", r"G:\My Drive\oceanembed_data"))
RAW_DIR = DATA_ROOT / "raw"
ZARR_DIR = DATA_ROOT / "zarr"

RAW_THETAO = RAW_DIR / "glorys"
RAW_CURRENTS = RAW_DIR / "currents"
RAW_SALINITY = RAW_DIR / "sss"
RAW_SSH = RAW_DIR / "ssh"

for d in [RAW_THETAO, RAW_CURRENTS, RAW_SALINITY, RAW_SSH, ZARR_DIR]:
    d.mkdir(parents=True, exist_ok=True)

STATUS_FILE = DATA_ROOT / "ingestion_status.json"
LOG_FILE = DATA_ROOT / "ingestion_progress.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("ingestion")

# Build weekly dates from 2024-01-07 to 2026-10-01 (every 7 days)
start_dt = datetime(2024, 1, 7)
end_dt = datetime(2026, 10, 1)
current_dt = start_dt
SCHEDULED_DATES = []
while current_dt <= end_dt:
    SCHEDULED_DATES.append(current_dt.strftime("%Y-%m-%d"))
    current_dt += timedelta(days=7)

TOTAL_DATES = len(SCHEDULED_DATES)

def update_status(completed: int, current_date: str, start_time: float, bytes_downloaded: int):
    elapsed = max(1.0, time.time() - start_time)
    progress_pct = round((completed / TOTAL_DATES) * 100.0, 1)
    avg_per_item = elapsed / max(1, completed)
    remaining_items = max(0, TOTAL_DATES - completed)
    est_remaining_sec = avg_per_item * remaining_items

    payload = {
        "status": "COMPLETED" if completed >= TOTAL_DATES else "RUNNING",
        "completed_dates": completed,
        "total_dates": TOTAL_DATES,
        "progress_pct": progress_pct,
        "current_date": current_date,
        "elapsed_minutes": round(elapsed / 60.0, 1),
        "estimated_remaining_minutes": round(est_remaining_sec / 60.0, 1),
        "bytes_downloaded_mb": round(bytes_downloaded / (1024 * 1024), 2),
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }
    try:
        with open(str(STATUS_FILE), "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not update status file: {e}")

def download_subset(dataset_id: str, out_dir: Path, out_name: str, date_str: str, min_depth=None, max_depth=None):
    out_file = out_dir / out_name
    if out_file.exists() and out_file.stat().st_size > 5000:
        return out_file, out_file.stat().st_size, False

    kwargs = {
        "dataset_id": dataset_id,
        "minimum_longitude": 45.0,
        "maximum_longitude": 105.0,
        "minimum_latitude": 5.0,
        "maximum_latitude": 30.0,
        "start_datetime": f"{date_str}T00:00:00",
        "end_datetime": f"{date_str}T23:59:59",
        "output_directory": str(out_dir),
        "output_filename": out_name,
    }
    if min_depth is not None and max_depth is not None:
        kwargs["minimum_depth"] = min_depth
        kwargs["maximum_depth"] = max_depth

    copernicusmarine.subset(**kwargs)
    sz = out_file.stat().st_size if out_file.exists() else 0
    return out_file, sz, True

def main():
    logger.info("=" * 65)
    logger.info("Starting Multi-Year (2024-2026) Ingestion Pipeline")
    logger.info(f"Target Directory: {DATA_ROOT}")
    logger.info(f"Total Scheduled Weekly Timesteps: {TOTAL_DATES}")
    logger.info("=" * 65)

    start_time = time.time()
    completed = 0
    total_bytes = 0

    # Initial status
    update_status(completed=0, current_date=SCHEDULED_DATES[0], start_time=start_time, bytes_downloaded=0)

    for i, date_str in enumerate(SCHEDULED_DATES):
        d_clean = date_str.replace("-", "")
        logger.info(f"[{i+1}/{TOTAL_DATES}] Ingesting {date_str}...")

        step_bytes = 0

        # 1. 3D Potential Temperature (0 to 1000m)
        try:
            _, sz, downloaded = download_subset(
                dataset_id="cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m",
                out_dir=RAW_THETAO,
                out_name=f"cmems_thetao_{d_clean}.nc",
                date_str=date_str,
                min_depth=0.0,
                max_depth=1050.0
            )
            step_bytes += sz
            if downloaded:
                logger.info(f"  -> 3D Thetao downloaded ({sz // 1024} KB)")
        except Exception as e:
            logger.error(f"  -> 3D Thetao error for {date_str}: {e}")

        # 2. 3D Salinity (0 to 1000m)
        try:
            _, sz, downloaded = download_subset(
                dataset_id="cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m",
                out_dir=RAW_SALINITY,
                out_name=f"cmems_so_{d_clean}.nc",
                date_str=date_str,
                min_depth=0.0,
                max_depth=1050.0
            )
            step_bytes += sz
            if downloaded:
                logger.info(f"  -> Salinity downloaded ({sz // 1024} KB)")
        except Exception as e:
            logger.error(f"  -> Salinity error for {date_str}: {e}")

        # 3. Currents (surface to 50m)
        try:
            _, sz, downloaded = download_subset(
                dataset_id="cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m",
                out_dir=RAW_CURRENTS,
                out_name=f"cmems_cur_{d_clean}.nc",
                date_str=date_str,
                min_depth=0.0,
                max_depth=50.0
            )
            step_bytes += sz
            if downloaded:
                logger.info(f"  -> Currents downloaded ({sz // 1024} KB)")
        except Exception as e:
            logger.error(f"  -> Currents error for {date_str}: {e}")

        # 4. Sea Surface Height (zos)
        try:
            _, sz, downloaded = download_subset(
                dataset_id="cmems_mod_glo_phy_anfc_0.083deg_P1D-m",
                out_dir=RAW_SSH,
                out_name=f"cmems_ssh_{d_clean}.nc",
                date_str=date_str
            )
            step_bytes += sz
            if downloaded:
                logger.info(f"  -> SSH downloaded ({sz // 1024} KB)")
        except Exception as e:
            logger.error(f"  -> SSH error for {date_str}: {e}")

        total_bytes += step_bytes
        completed += 1
        update_status(completed=completed, current_date=date_str, start_time=start_time, bytes_downloaded=total_bytes)
        logger.info(f"  [OK] Completed {date_str} ({completed}/{TOTAL_DATES} - {round(completed/TOTAL_DATES*100, 1)}%)")

    logger.info("=" * 65)
    logger.info(f"Multi-Year Ingestion Finished! Completed {completed} timesteps.")
    logger.info("=" * 65)

if __name__ == "__main__":
    main()
