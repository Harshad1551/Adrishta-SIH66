# ADRISHTA Daily Ingest Pipeline

## What it does

Upgrades the system from **weekly** to **daily** temporal resolution by:

1. Downloading 4 CMEMS products per day (NIO domain, 5N-30N 45E-105E):
   - `cmems_mod_glo_phy-thetao_anfc` - 3D temperature (0-1000 m) => surface SST + subsurface target
   - `cmems_mod_glo_phy-so_anfc`     - Salinity => SSS surface channel
   - `cmems_mod_glo_phy-cur_anfc`    - Surface currents (uo, vo)
   - `cmems_mod_glo_phy_anfc`        - Sea Surface Height (zos)

2. Downloading daily Argo profiles from GDAC HTTP mirror (Indian Ocean regional subset)
   for independent validation (Argo is NEVER used as model input).

3. Regridding everything to the canonical INCOIS grid (0.25 deg, 101x241).

4. Appending the harmonised snapshot to the master Zarr store so the backend
   can immediately serve daily-resolution predictions.

## Usage

```bash
# Today only (default):
python pipeline/daily_ingest_pipeline.py

# Backfill a specific date range:
python pipeline/daily_ingest_pipeline.py --start 2024-05-01 --end 2024-06-30

# Download raw files only (skip Zarr append):
python pipeline/daily_ingest_pipeline.py --no-zarr

# Skip Argo (Copernicus only):
python pipeline/daily_ingest_pipeline.py --no-argo

# Dry-run (show what would happen, no downloads):
python pipeline/daily_ingest_pipeline.py --dry-run
```

## Output directories

| Directory | Contents |
|---|---|
| `G:/My Drive/oceanembed_data/raw/glorys/` | `cmems_thetao_YYYYMMDD.nc` |
| `G:/My Drive/oceanembed_data/raw/sss/` | `cmems_so_YYYYMMDD.nc` |
| `G:/My Drive/oceanembed_data/raw/currents/` | `cmems_cur_YYYYMMDD.nc` |
| `G:/My Drive/oceanembed_data/raw/ssh/` | `cmems_ssh_YYYYMMDD.nc` |
| `G:/My Drive/oceanembed_data/raw/argo/` | `YYYYMMDD_prof.nc` |
| `G:/My Drive/oceanembed_data/zarr/oceanembed_multiyear_2024_2026.zarr` | Master store (appended) |
| `G:/My Drive/oceanembed_data/daily_ingest_status.json` | Last run results |
| `G:/My Drive/oceanembed_data/daily_ingest.log` | Full log |

## Automating with Windows Task Scheduler

Run `pipeline/schedule_daily_ingest.bat` or create a task via:

```
schtasks /create /tn "ADRISHTA Daily Ingest" /tr "cmd /c cd C:\adrishta-66 && python pipeline\daily_ingest_pipeline.py" /sc daily /st 03:00
```

## Credentials

The script reads credentials from `.env`:
- `COPERNICUSMARINE_SERVICE_USERNAME`
- `COPERNICUSMARINE_SERVICE_PASSWORD`

Argo requires no credentials (public GDAC mirror).

## After backfill

Once new daily dates are in the Zarr store, the backend automatically serves them
without any restart required — the `_get_master_zarr()` cache is invalidated on
the next request after `ZARR_CACHE_TTL` (default 86400 s). To force immediate
refresh, restart the uvicorn server once.