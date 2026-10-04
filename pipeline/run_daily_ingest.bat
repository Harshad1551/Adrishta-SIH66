@echo off
REM ADRISHTA Daily Ingest - Windows Task Scheduler launcher
REM Schedule this to run daily at 03:00 AM via Task Scheduler

cd /d C:\adrishta-66
set PYTHONPATH=C:\adrishta-66\GLORYS

REM Load .env credentials
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if /i "%%a"=="COPERNICUSMARINE_SERVICE_USERNAME" set COPERNICUSMARINE_SERVICE_USERNAME=%%b
    if /i "%%a"=="COPERNICUSMARINE_SERVICE_PASSWORD" set COPERNICUSMARINE_SERVICE_PASSWORD=%%b
    if /i "%%a"=="OCEANEMBED_DATA_DIR"               set OCEANEMBED_DATA_DIR=%%b
    if /i "%%a"=="OCEANEMBED_ZARR_PATH"              set OCEANEMBED_ZARR_PATH=%%b
)

echo [%date% %time%] Starting ADRISHTA Daily Ingest...
python pipeline\daily_ingest_pipeline.py %*
echo [%date% %time%] Done.