# ADRISHTA Daily Ingestion Pipeline
# Downloads daily Copernicus Marine (GLORYS thetao/so/cur/ssh) and GDAC Argo
# profiles for the NIO, then harmonises and appends to the master Zarr store.
#
# Usage examples:
#   python pipeline/daily_ingest_pipeline.py                  # today only
#   python pipeline/daily_ingest_pipeline.py --start YYYY-MM-DD --end YYYY-MM-DD
#   python pipeline/daily_ingest_pipeline.py --no-zarr        # raw files only
#   python pipeline/daily_ingest_pipeline.py --dry-run        # show actions only
#   python pipeline/daily_ingest_pipeline.py --no-argo        # skip Argo
#   python pipeline/daily_ingest_pipeline.py --no-copernicus  # skip CMEMS

from __future__ import annotations


import argparse
import json
import logging
import os
import sys
import time
import urllib.request
import urllib.error
import ssl
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(r"C:\adrishta-66\.env"))
from typing import Dict, List, Optional, Tuple

import numpy as np

DATA_ROOT    = Path(os.environ.get("OCEANEMBED_DATA_DIR", os.environ.get("DATA_ROOT", r"G:\My Drive\oceanembed_data")))
RAW_DIR      = DATA_ROOT / "raw"
ZARR_DIR     = DATA_ROOT / "zarr"
ARGO_DIR     = RAW_DIR / "argo"
GLORYS_DIR   = RAW_DIR / "glorys"
CURRENTS_DIR = RAW_DIR / "currents"
SALINITY_DIR = RAW_DIR / "sss"
SSH_DIR      = RAW_DIR / "ssh"
MASTER_ZARR  = Path(os.environ.get("OCEANEMBED_ZARR_PATH", str(ZARR_DIR / "oceanembed_multiyear_2024_2026.zarr")))
STATUS_FILE  = DATA_ROOT / "daily_ingest_status.json"
LOG_FILE     = DATA_ROOT / "daily_ingest.log"

CMEMS_USER = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", os.environ.get("COPERNICUS_MARINE_USERNAME", "")).strip("'\"")
CMEMS_PASS = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", os.environ.get("COPERNICUS_MARINE_PASSWORD", "")).strip("'\"")

LAT_MIN, LAT_MAX = 5.0,  30.0
LON_MIN, LON_MAX = 45.0, 105.0
RESOLUTION       = 0.25
TARGET_LATS = np.arange(LAT_MIN, LAT_MAX + 0.001, RESOLUTION, dtype=np.float32)
TARGET_LONS = np.arange(LON_MIN, LON_MAX + 0.001, RESOLUTION, dtype=np.float32)
NUM_LATS, NUM_LONS = len(TARGET_LATS), len(TARGET_LONS)
STANDARD_DEPTHS = np.array([0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000], dtype=np.float32)
NUM_DEPTHS   = len(STANDARD_DEPTHS)
CHANNELS     = ["sst","sss","ssh","current_u","current_v","wind_u","wind_v"]
NUM_CHANNELS = len(CHANNELS)

lat_grid, lon_grid = np.meshgrid(TARGET_LATS, TARGET_LONS, indexing="ij")
GRID_PTS = np.stack([lat_grid.ravel(), lon_grid.ravel()], axis=-1)

CMEMS_THETAO  = "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m"
CMEMS_SAL     = "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m"
CMEMS_CURR    = "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m"
CMEMS_SSH     = "cmems_mod_glo_phy_anfc_0.083deg_P1D-m"
ARGO_BASE_URL = "https://data-argo.ifremer.fr/geo/indian_ocean"

for d in [DATA_ROOT, RAW_DIR, ZARR_DIR, ARGO_DIR, GLORYS_DIR, CURRENTS_DIR, SALINITY_DIR, SSH_DIR]:
    d.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("daily_ingest")


# ─── Section 1: Copernicus Download ──────────────────────────────────────────

def _cmems_subset(dataset_id, out_dir, out_name, date_str, variables=None, min_depth=None, max_depth=None, dry_run=False):
    out_file = out_dir / out_name
    if out_file.exists() and out_file.stat().st_size > 5_000:
        logger.debug(f"  [SKIP] {out_name} exists ({out_file.stat().st_size//1024} KB)")
        return out_file, out_file.stat().st_size, False
    if dry_run:
        logger.info(f"  [DRY-RUN] Would download {dataset_id} -> {out_name}")
        return None, 0, False
    try:
        import copernicusmarine
    except ImportError:
        logger.error("copernicusmarine not installed. Run: pip install copernicusmarine")
        return None, 0, False
    kwargs = dict(
        dataset_id=dataset_id,
        minimum_longitude=LON_MIN, maximum_longitude=LON_MAX,
        minimum_latitude=LAT_MIN,  maximum_latitude=LAT_MAX,
        start_datetime=f"{date_str}T00:00:00",
        end_datetime=f"{date_str}T23:59:59",
        output_directory=str(out_dir),
        output_filename=out_name,
    )
    if CMEMS_USER:
        kwargs["username"] = CMEMS_USER
    if CMEMS_PASS:
        kwargs["password"] = CMEMS_PASS
    if variables:
        kwargs["variables"] = variables
    if min_depth is not None:
        kwargs["minimum_depth"] = min_depth
    if max_depth is not None:
        kwargs["maximum_depth"] = max_depth
    try:
        copernicusmarine.subset(**kwargs)
        sz = out_file.stat().st_size if out_file.exists() else 0
        logger.info(f"  [OK] {out_name} ({sz//1024} KB)")
        return out_file, sz, True
    except Exception as exc:
        logger.error(f"  [ERR] {dataset_id} for {date_str}: {exc}")
        return None, 0, False


def download_copernicus_day(date_str, dry_run=False):
    d = date_str.replace("-","")
    results = {}
    p,_,_ = _cmems_subset(CMEMS_THETAO, GLORYS_DIR,   f"cmems_thetao_{d}.nc", date_str, ["thetao"], 0.0, 1050.0, dry_run)
    results["thetao"] = p
    p,_,_ = _cmems_subset(CMEMS_SAL,    SALINITY_DIR, f"cmems_so_{d}.nc",     date_str, ["so"],    0.0,   10.0, dry_run)
    results["so"] = p
    p,_,_ = _cmems_subset(CMEMS_CURR,   CURRENTS_DIR, f"cmems_cur_{d}.nc",    date_str, ["uo","vo"], 0.0, 5.0, dry_run)
    results["cur"] = p
    p,_,_ = _cmems_subset(CMEMS_SSH,    SSH_DIR,      f"cmems_ssh_{d}.nc",    date_str, ["zos"],  dry_run=dry_run)
    results["ssh"] = p
    return results


# ─── Section 2: Argo Download (GDAC HTTP mirror) ─────────────────────────────

def download_argo_day(date_str, dry_run=False):
    dt  = datetime.strptime(date_str, "%Y-%m-%d")
    d   = date_str.replace("-","")
    out = ARGO_DIR / f"{d}_prof.nc"
    if out.exists() and out.stat().st_size > 10_000:
        logger.debug(f"  [SKIP] Argo {date_str} exists ({out.stat().st_size//1024} KB)")
        return out
    if dry_run:
        logger.info(f"  [DRY-RUN] Would download Argo {date_str}")
        return None
    urls = [
        f"{ARGO_BASE_URL}/{dt.year}/{dt.month:02d}/{d}_prof.nc",
        f"https://usgodae.org/pub/outgoing/argo/geo/indian_ocean/{dt.year}/{dt.month:02d}/{d}_prof.nc",
        f"https://data-argo.ifremer.fr/ar_greylist.txt",  # canary — replaced below
    ]
    urls[-1] = f"https://data-argo.ifremer.fr/dac/coriolis/{d}_prof.nc"
    for url in urls[:-1]:
        try:
            logger.info(f"  [ARGO] Trying {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "ADRISHTA/1.0"})
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=90, context=ctx) as resp:
                data = resp.read()
            if len(data) < 5_000:
                continue
            out.write_bytes(data)
            logger.info(f"  [OK] Argo {date_str} -> {out.name} ({len(data)//1024} KB)")
            return out
        except urllib.error.HTTPError as e:
            if e.code == 404:
                logger.info(f"  [ARGO] 404 on mirror")
            else:
                logger.warning(f"  [ARGO] HTTP {e.code}: {e.reason}")
        except Exception as exc:
            logger.warning(f"  [ARGO] {exc}")
    logger.warning(f"  [ARGO] No profile found for {date_str}")
    return None


# ─── Section 3: Regridding ────────────────────────────────────────────────────

def _regrid_3d(raw_3d, raw_depths, raw_lats, raw_lons):
    from scipy.interpolate import RegularGridInterpolator
    if raw_lats[0] > raw_lats[-1]:
        raw_lats = raw_lats[::-1]
        raw_3d   = raw_3d[:, ::-1, :]
    if np.any(raw_lons > 180.0):
        raw_lons = np.where(raw_lons > 180.0, raw_lons - 360.0, raw_lons)
        idx = np.argsort(raw_lons)
        raw_lons = raw_lons[idx]; raw_3d = raw_3d[:, :, idx]
    _, n_lat_raw, n_lon_raw = raw_3d.shape
    arr_15 = np.full((NUM_DEPTHS, n_lat_raw, n_lon_raw), np.nan, dtype=np.float32)
    for i, d in enumerate(STANDARD_DEPTHS):
        below = np.where(raw_depths <= d)[0]; above = np.where(raw_depths >= d)[0]
        if len(below)>0 and len(above)>0:
            d0, d1 = raw_depths[below[-1]], raw_depths[above[0]]
            if d0 == d1: arr_15[i] = raw_3d[below[-1]]
            else:
                w = (d-d0)/(d1-d0); arr_15[i] = (1.0-w)*raw_3d[below[-1]] + w*raw_3d[above[0]]
        elif len(below)>0: arr_15[i] = raw_3d[below[-1]]
        else: arr_15[i] = raw_3d[0]
    out_3d = np.full((NUM_DEPTHS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
    for i in range(NUM_DEPTHS):
        try:
            rgi = RegularGridInterpolator((raw_lats, raw_lons), arr_15[i], bounds_error=False, fill_value=np.nan)
            out_3d[i] = rgi(GRID_PTS).reshape((NUM_LATS, NUM_LONS)).astype(np.float32)
        except Exception: pass
    return out_3d


def _regrid_2d(raw_2d, raw_lats, raw_lons):
    from scipy.interpolate import RegularGridInterpolator
    if raw_lats[0] > raw_lats[-1]:
        raw_lats = raw_lats[::-1]; raw_2d = raw_2d[::-1, :]
    if np.any(raw_lons > 180.0):
        raw_lons = np.where(raw_lons > 180.0, raw_lons - 360.0, raw_lons)
        idx = np.argsort(raw_lons); raw_lons = raw_lons[idx]; raw_2d = raw_2d[:, idx]
    rgi = RegularGridInterpolator((raw_lats, raw_lons), raw_2d, bounds_error=False, fill_value=np.nan)
    return rgi(GRID_PTS).reshape((NUM_LATS, NUM_LONS)).astype(np.float32)


# ─── Section 4: Harmonise One Day ────────────────────────────────────────────

def harmonise_day(date_str, thetao_file, so_file=None, cur_file=None, ssh_file=None):
    import xarray as xr
    if thetao_file is None or not thetao_file.exists():
        logger.error(f"  [HARM] No thetao for {date_str}")
        return None
    surf    = np.full((NUM_CHANNELS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
    qc      = np.ones((NUM_CHANNELS, NUM_LATS, NUM_LONS), dtype=np.uint8)
    temp_3d = np.full((NUM_DEPTHS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
    sal_3d  = np.full((NUM_DEPTHS, NUM_LATS, NUM_LONS), np.nan, dtype=np.float32)
    # 1. thetao
    try:
        with xr.open_dataset(str(thetao_file)) as ds:
            raw_t = ds["thetao"].squeeze().values
            if np.nanmean(raw_t) > 200.0: raw_t -= 273.15
            temp_3d = _regrid_3d(raw_t, ds["depth"].values, ds["latitude"].values, ds["longitude"].values)
        surf[0] = temp_3d[0]
    except Exception as exc:
        logger.error(f"  [HARM] thetao error {date_str}: {exc}"); return None
    # 2. salinity
    if so_file and so_file.exists():
        try:
            with xr.open_dataset(str(so_file)) as ds:
                var = "so" if "so" in ds else "sos"
                raw_s = ds[var].squeeze().values
                rl, rn = ds["latitude"].values, ds["longitude"].values
                if raw_s.ndim == 3:
                    sal_3d = _regrid_3d(raw_s, ds["depth"].values, rl, rn); surf[1] = sal_3d[0]
                else:
                    surf[1] = _regrid_2d(raw_s, rl, rn)
        except Exception as exc:
            logger.warning(f"  [HARM] salinity error {date_str}: {exc}")
    # 3. currents
    if cur_file and cur_file.exists():
        try:
            with xr.open_dataset(str(cur_file)) as ds:
                u = ds["uo"].isel(depth=0) if "depth" in ds["uo"].dims else ds["uo"]
                v = ds["vo"].isel(depth=0) if "depth" in ds["vo"].dims else ds["vo"]
                rl, rn = ds["latitude"].values, ds["longitude"].values
                surf[3] = _regrid_2d(u.squeeze().values, rl, rn)
                surf[4] = _regrid_2d(v.squeeze().values, rl, rn)
        except Exception as exc:
            logger.warning(f"  [HARM] currents error {date_str}: {exc}")
    # 4. SSH
    if ssh_file and ssh_file.exists():
        try:
            with xr.open_dataset(str(ssh_file)) as ds:
                var = "zos" if "zos" in ds else ("sla" if "sla" in ds else "adt")
                rl, rn = ds["latitude"].values, ds["longitude"].values
                surf[2] = _regrid_2d(ds[var].squeeze().values, rl, rn)
        except Exception as exc:
            logger.warning(f"  [HARM] SSH error {date_str}: {exc}")
    # 5. wind proxy from currents
    surf[5] = np.clip(surf[3] * 18.5, -40.0, 40.0).astype(np.float32)
    surf[6] = np.clip(surf[4] * 18.5, -40.0, 40.0).astype(np.float32)
    for ch in range(NUM_CHANNELS):
        qc[ch, np.isnan(surf[ch])] = 5
    return {"surf": surf, "temp_3d": temp_3d, "sal_3d": sal_3d, "qc": qc}


# ─── Section 5: Zarr Append ───────────────────────────────────────────────────

def _load_existing_dates():
    if not MASTER_ZARR.exists(): return []
    try:
        import zarr
        root = zarr.open_group(str(MASTER_ZARR), mode="r")
        return sorted([str(d) for d in root["dates"][:]])
    except Exception: return []


def append_day_to_zarr(date_str, data):
    import zarr
    existing = _load_existing_dates()
    if MASTER_ZARR.exists():
        root = zarr.open_group(str(MASTER_ZARR), mode="a")
    else:
        root = zarr.open_group(str(MASTER_ZARR), mode="w")
        root.attrs.update({"title":"OceanEmbed Multi-Year Harmonized Dataset","domain":"NIO 5N-30N 45E-105E","resolution_deg":RESOLUTION,"standard_depths_m":STANDARD_DEPTHS.tolist(),"channels":CHANNELS,"created_at":datetime.utcnow().isoformat()+"Z"})
        root["lats"] = TARGET_LATS; root["lons"] = TARGET_LONS; root["depths"] = STANDARD_DEPTHS
        root.empty("dates",              shape=(0,),                              dtype="U10",  chunks=(512,))
        root.empty("surface_inputs",     shape=(0,NUM_CHANNELS,NUM_LATS,NUM_LONS),dtype="f4",  chunks=(1,NUM_CHANNELS,NUM_LATS,NUM_LONS))
        root.empty("temperature_target", shape=(0,NUM_DEPTHS,NUM_LATS,NUM_LONS),  dtype="f4",  chunks=(1,NUM_DEPTHS,NUM_LATS,NUM_LONS))
        root.empty("salinity_target",    shape=(0,NUM_DEPTHS,NUM_LATS,NUM_LONS),  dtype="f4",  chunks=(1,NUM_DEPTHS,NUM_LATS,NUM_LONS))
        root.empty("qc_flags",           shape=(0,NUM_CHANNELS,NUM_LATS,NUM_LONS),dtype="u1",  chunks=(1,NUM_CHANNELS,NUM_LATS,NUM_LONS))
        root.empty("ocean_mask",         shape=(NUM_LATS,NUM_LONS),               dtype="u1")
    surf = data["surf"]; temp_3d = data["temp_3d"]; sal_3d = data["sal_3d"]; qc = data["qc"]
    try:
        if date_str in existing:
            idx = existing.index(date_str)
            logger.info(f"  [ZARR] Overwriting existing row {idx} for {date_str}")
            root["surface_inputs"][idx]     = surf[np.newaxis]
            root["temperature_target"][idx] = temp_3d[np.newaxis]
            root["salinity_target"][idx]    = sal_3d[np.newaxis]
            root["qc_flags"][idx]           = qc[np.newaxis]
        else:
            root["surface_inputs"].append(surf[np.newaxis],       axis=0)
            root["temperature_target"].append(temp_3d[np.newaxis],axis=0)
            root["salinity_target"].append(sal_3d[np.newaxis],    axis=0)
            root["qc_flags"].append(qc[np.newaxis],               axis=0)
            new_dates = sorted(existing + [date_str])
            # If date was inserted in middle, re-sort array
            if new_dates.index(date_str) != len(existing):
                ni = new_dates.index(date_str)
                for n in ["surface_inputs","temperature_target","salinity_target","qc_flags"]:
                    arr = root[n][:]
                    row = arr[-1:].copy()
                    arr = np.concatenate([arr[:ni], row, arr[ni:-1]], axis=0)
                    root[n][:] = arr
            root["dates"].resize(len(new_dates))
            root["dates"][:] = np.array(new_dates, dtype=str)
        # Update ocean mask
        mask = (~np.isnan(surf[0])).astype(np.uint8)
        if root["ocean_mask"].shape == (NUM_LATS, NUM_LONS):
            root["ocean_mask"][:] = np.maximum(root["ocean_mask"][:], mask)
        root.attrs["total_timesteps"] = root["surface_inputs"].shape[0]
        root.attrs["last_updated"]    = datetime.utcnow().isoformat()+"Z"
        logger.info(f"  [ZARR] Appended {date_str} — total: {root['surface_inputs'].shape[0]}")
        return True
    except Exception as exc:
        logger.error(f"  [ZARR] Append failed for {date_str}: {exc}")
        return False


# ─── Section 6: Status ───────────────────────────────────────────────────────

def _write_status(results):
    try:
        STATUS_FILE.write_text(json.dumps({"pipeline":"ADRISHTA Daily Ingest","last_run_utc":datetime.utcnow().isoformat()+"Z","dates_processed":len(results),"results":results},indent=2,default=str))
    except Exception as exc:
        logger.warning(f"Status write failed: {exc}")


# ─── Section 7: Main ─────────────────────────────────────────────────────────

def build_date_list(start, end):
    d0 = datetime.strptime(start,"%Y-%m-%d"); d1 = datetime.strptime(end,"%Y-%m-%d")
    out = []; cur = d0
    while cur <= d1:
        out.append(cur.strftime("%Y-%m-%d")); cur += timedelta(days=1)
    return out


def main():
    parser = argparse.ArgumentParser(description="ADRISHTA Daily Copernicus+Argo ingestion pipeline")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    parser.add_argument("--start",          default=today,       help="Start date YYYY-MM-DD (default: today)")
    parser.add_argument("--end",            default=today,       help="End date   YYYY-MM-DD (default: today)")
    parser.add_argument("--no-zarr",        action="store_true", help="Skip Zarr append (raw files only)")
    parser.add_argument("--no-argo",        action="store_true", help="Skip Argo download")
    parser.add_argument("--no-copernicus",  action="store_true", help="Skip Copernicus download")
    parser.add_argument("--dry-run",        action="store_true", help="Print what would be done, no I/O")
    parser.add_argument("--skip-existing",  action="store_true", default=True, help="Skip dates already in Zarr (default True)")
    args = parser.parse_args()

    dates = build_date_list(args.start, args.end)
    existing_set = set(_load_existing_dates())

    logger.info("="*70)
    logger.info("ADRISHTA Daily Ingest Pipeline")
    logger.info(f"  Range        : {args.start} to {args.end}  ({len(dates)} days)")
    logger.info(f"  Master Zarr  : {MASTER_ZARR}")
    logger.info(f"  In Zarr now  : {len(existing_set)} snapshots")
    logger.info(f"  Dry-run      : {args.dry_run}")
    logger.info("="*70)

    all_results = []; t0 = time.time()

    for i, date_str in enumerate(dates):
        logger.info(f"\n[{i+1}/{len(dates)}] {date_str}")
        result = {"date": date_str, "copernicus": {}, "argo": None, "zarr_ok": False}

        # Copernicus
        cmems_files = {"thetao":None,"so":None,"cur":None,"ssh":None}
        if not args.no_copernicus:
            cmems_files = download_copernicus_day(date_str, args.dry_run)
            result["copernicus"] = {k:(str(v) if v else None) for k,v in cmems_files.items()}
        else:
            d = date_str.replace("-","")
            cmems_files = {
                "thetao": GLORYS_DIR   / f"cmems_thetao_{d}.nc",
                "so":     SALINITY_DIR / f"cmems_so_{d}.nc",
                "cur":    CURRENTS_DIR / f"cmems_cur_{d}.nc",
                "ssh":    SSH_DIR      / f"cmems_ssh_{d}.nc",
            }
            cmems_files = {k:(v if v.exists() else None) for k,v in cmems_files.items()}

        # Argo
        if not args.no_argo:
            argo_p = download_argo_day(date_str, args.dry_run)
            result["argo"] = str(argo_p) if argo_p else None

        # Zarr harmonise + append
        if not args.no_zarr and not args.dry_run:
            if args.skip_existing and date_str in existing_set:
                logger.info(f"  [ZARR] {date_str} already indexed — skip")
                result["zarr_ok"] = True
            else:
                day_data = harmonise_day(date_str, cmems_files.get("thetao"), cmems_files.get("so"), cmems_files.get("cur"), cmems_files.get("ssh"))
                if day_data:
                    ok = append_day_to_zarr(date_str, day_data)
                    result["zarr_ok"] = ok
                    if ok: existing_set.add(date_str)

        all_results.append(result)
        _write_status(all_results)

    elapsed = time.time() - t0
    logger.info("\n"+"="*70)
    logger.info("COMPLETE")
    logger.info(f"  Processed: {len(all_results)} dates  |  Zarr OK: {sum(1 for r in all_results if r['zarr_ok'])}  |  Elapsed: {elapsed/60:.1f} min")
    logger.info(f"  Zarr total snapshots: {len(existing_set)}")
    logger.info("="*70)


if __name__ == "__main__":
    main()
