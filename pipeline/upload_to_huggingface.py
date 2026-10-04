# ADRISHTA: Automated Hugging Face Dataset Uploader
# Uploads Master Zarr, ARGO Validation benchmarks, model checkpoints,
# and (optionally) raw Copernicus NetCDF files to a Hugging Face Dataset repository.

import os
import sys
import argparse
from pathlib import Path
from huggingface_hub import HfApi, create_repo

DATA_ROOT = Path(os.environ.get("OCEANEMBED_DATA_DIR", r"G:\My Drive\oceanembed_data"))
ZARR_DIR = DATA_ROOT / "zarr" / "oceanembed_multiyear_2024_2026.zarr"
ARGO_DIR = DATA_ROOT / "argo"
CHECKPOINTS_DIR = DATA_ROOT / "checkpoints"
RAW_DIR = DATA_ROOT / "raw"

README_CONTENT = """---
license: cc-by-4.0
task_categories:
  - time-series-forecasting
  - tabular-regression
tags:
  - oceanography
  - subsurface-temperature
  - argo-validation
  - glorys
  - physics-constrained-ml
size_categories:
  - 10GB<n<100GB
---

# ADRISHTA: 3D Subsurface Ocean AI Dataset (North Indian Ocean 2024–2026)

This repository contains the complete open scientific assets for the ADRISHTA Subsurface Ocean AI system:
- **Master Zarr Store** (`zarr/oceanembed_multiyear_2024_2026.zarr`): Harmonized 7-channel satellite surface inputs + 15 standard INCOIS target depths at 0.25° resolution across 2024-01-07 to 2026-10-03 (148 daily/weekly snapshots).
- **In-Situ ARGO Ground Truth** (`argo/`): 134 real physical CTD float soundings from the Coriolis GDAC / INCOIS array.
- **Model Checkpoints** (`checkpoints/`): Frozen Physics-Constrained and Baseline OceanEmbedNet weights.
- **Raw Multi-Parameter Copernicus Data** (`raw/`): 3D potential temperature, salinity, currents, and sea surface height NetCDFs.
"""


def main():
    parser = argparse.ArgumentParser(description="Upload ADRISHTA Data to Hugging Face Dataset")
    parser.add_argument("--repo", required=True, help="HF Repo ID (e.g. username/oceanembed-data)")
    parser.add_argument("--token", default=os.getenv("HF_TOKEN"), help="Hugging Face Write Token")
    parser.add_argument("--private", action="store_true", help="Make repository private (default: public)")
    parser.add_argument("--include-raw", action="store_true", help="Also upload 14.5 GB raw Copernicus NetCDFs")
    args = parser.parse_args()

    if not args.token:
        print("[ERR] Please provide --token or set HF_TOKEN environment variable.")
        sys.exit(1)

    api = HfApi(token=args.token)

    print(f"Creating / verifying dataset repository: {args.repo} ...")
    create_repo(repo_id=args.repo, repo_type="dataset", private=args.private, token=args.token, exist_ok=True)

    # 1. Upload README.md
    print("Uploading README.md ...")
    api.upload_file(
        path_or_fileobj=README_CONTENT.encode("utf-8"),
        path_in_repo="README.md",
        repo_id=args.repo,
        repo_type="dataset",
    )

    # 2. Upload Master Zarr (184 MB)
    if ZARR_DIR.exists():
        print(f"Uploading Master Zarr from {ZARR_DIR} ...")
        api.upload_folder(
            folder_path=str(ZARR_DIR),
            path_in_repo="zarr/oceanembed_multiyear_2024_2026.zarr",
            repo_id=args.repo,
            repo_type="dataset",
        )
        print("[OK] Master Zarr uploaded.")
    else:
        print(f"[WARN] Master Zarr not found at {ZARR_DIR}")

    # 3. Upload ARGO validation data (~0.6 MB)
    if ARGO_DIR.exists():
        print(f"Uploading ARGO validation data from {ARGO_DIR} ...")
        api.upload_folder(
            folder_path=str(ARGO_DIR),
            path_in_repo="argo",
            repo_id=args.repo,
            repo_type="dataset",
        )
        print("[OK] ARGO directory uploaded.")

    # 4. Upload Checkpoints (~0.6 MB)
    ckpt_src = CHECKPOINTS_DIR if CHECKPOINTS_DIR.exists() else Path(r"C:\adrishta-66\checkpoints")
    if ckpt_src.exists():
        print(f"Uploading Checkpoints from {ckpt_src} ...")
        api.upload_folder(
            folder_path=str(ckpt_src),
            path_in_repo="checkpoints",
            repo_id=args.repo,
            repo_type="dataset",
        )
        print("[OK] Checkpoints uploaded.")

    # 5. Optionally Upload Raw NetCDFs (~14.5 GB)
    if args.include_raw:
        if RAW_DIR.exists():
            print(f"Uploading ~14.5 GB raw Copernicus NetCDFs from {RAW_DIR} (this will take time)...")
            api.upload_folder(
                folder_path=str(RAW_DIR),
                path_in_repo="raw",
                repo_id=args.repo,
                repo_type="dataset",
            )
            print("[OK] Raw NetCDF archive uploaded.")
        else:
            print(f"[WARN] Raw directory not found at {RAW_DIR}")
    else:
        print("[INFO] Skipping raw NetCDFs (pass --include-raw to upload 14.5 GB Copernicus files).")

    print("\n=======================================================")
    print(f" SUCCESS! Dataset is live on Hugging Face: https://huggingface.co/datasets/{args.repo}")
    print("=======================================================")


if __name__ == "__main__":
    main()
