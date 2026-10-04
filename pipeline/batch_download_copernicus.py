"""
Copernicus Marine Batch Downloader for May 2024 (Super El Niño / Marine Heatwave Peak)
Downloads real daily satellite products directly to Google Drive (oceanembed_data).
Channels:
  - SSH / SLA: cmems_obs-sl_glo_phy-ssh_nrt_allsat-l4-duacs-0.25deg_P1D
  - Surface Currents (uo, vo): cmems_obs-mob_glo_phy-cur_nrt_0.25deg_P1D-m
  - Sea Surface Salinity (sos): cmems_obs-mob_glo_phy-sss_nrt_multi_P1D
"""

import os
from pathlib import Path
from datetime import datetime
import copernicusmarine

DATA_ROOT = Path(os.environ.get("DATA_ROOT", r"G:\My Drive\oceanembed_data"))
RAW_DIR = DATA_ROOT / "raw"

SSH_DIR = RAW_DIR / "ssh"
CURRENTS_DIR = RAW_DIR / "currents"
SSS_DIR = RAW_DIR / "sss"

for d in [SSH_DIR, CURRENTS_DIR, SSS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# 31 days of May 2024
DATES = [datetime(2024, 5, d).strftime("%Y-%m-%d") for d in range(1, 32)]

def download_daily_ssh(date_str: str):
    out_file = SSH_DIR / f"cmems_sla_{date_str.replace('-', '')}.nc"
    if out_file.exists() and out_file.stat().st_size > 10000:
        print(f"[SSH] {date_str} already exists ({out_file.stat().st_size} bytes)")
        return out_file
    
    print(f"[SSH] Downloading {date_str}...")
    try:
        copernicusmarine.subset(
            dataset_id="cmems_obs-sl_glo_phy-ssh_nrt_allsat-l4-duacs-0.25deg_P1D",
            variables=["sla", "adt"],
            minimum_longitude=45.0,
            maximum_longitude=105.0,
            minimum_latitude=5.0,
            maximum_latitude=30.0,
            start_datetime=f"{date_str}T00:00:00",
            end_datetime=f"{date_str}T23:59:59",
            output_directory=str(SSH_DIR),
            output_filename=out_file.name
        )
        print(f"[SSH] OK -> {out_file.name}")
        return out_file
    except Exception as e:
        print(f"[SSH] Error for {date_str}: {e}")
        return None

def download_daily_currents(date_str: str):
    out_file = CURRENTS_DIR / f"cmems_cur_{date_str.replace('-', '')}.nc"
    if out_file.exists() and out_file.stat().st_size > 10000:
        print(f"[CURR] {date_str} already exists ({out_file.stat().st_size} bytes)")
        return out_file
    
    print(f"[CURR] Downloading {date_str}...")
    try:
        copernicusmarine.subset(
            dataset_id="cmems_obs-mob_glo_phy-cur_nrt_0.25deg_P1D-m",
            variables=["uo", "vo"],
            minimum_longitude=45.0,
            maximum_longitude=105.0,
            minimum_latitude=5.0,
            maximum_latitude=30.0,
            start_datetime=f"{date_str}T00:00:00",
            end_datetime=f"{date_str}T23:59:59",
            output_directory=str(CURRENTS_DIR),
            output_filename=out_file.name
        )
        print(f"[CURR] OK -> {out_file.name}")
        return out_file
    except Exception as e:
        print(f"[CURR] Error for {date_str}: {e}")
        return None

def download_daily_sss(date_str: str):
    out_file = SSS_DIR / f"cmems_sss_{date_str.replace('-', '')}.nc"
    if out_file.exists() and out_file.stat().st_size > 10000:
        print(f"[SSS] {date_str} already exists ({out_file.stat().st_size} bytes)")
        return out_file
    
    print(f"[SSS] Downloading {date_str}...")
    try:
        copernicusmarine.subset(
            dataset_id="cmems_obs-mob_glo_phy-sss_nrt_multi_P1D",
            variables=["sos"],
            minimum_longitude=45.0,
            maximum_longitude=105.0,
            minimum_latitude=5.0,
            maximum_latitude=30.0,
            start_datetime=f"{date_str}T00:00:00",
            end_datetime=f"{date_str}T23:59:59",
            output_directory=str(SSS_DIR),
            output_filename=out_file.name
        )
        print(f"[SSS] OK -> {out_file.name}")
        return out_file
    except Exception as e:
        print(f"[SSS] Error for {date_str}: {e}")
        return None

def main():
    print(f"Starting batch download for {len(DATES)} days (May 1 to May 31, 2024)...")
    print(f"Target Directory: {DATA_ROOT}")
    
    ssh_success = 0
    curr_success = 0
    sss_success = 0

    for d in DATES:
        if download_daily_ssh(d):
            ssh_success += 1
        if download_daily_currents(d):
            curr_success += 1
        if download_daily_sss(d):
            sss_success += 1

    print("=" * 60)
    print("Batch Download Complete!")
    print(f"SSH:      {ssh_success}/{len(DATES)} downloaded")
    print(f"Currents: {curr_success}/{len(DATES)} downloaded")
    print(f"SSS:      {sss_success}/{len(DATES)} downloaded")
    print("=" * 60)

if __name__ == "__main__":
    main()
