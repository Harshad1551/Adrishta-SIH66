"""
ADRISHTA / OceanEmbed — Production Integration & Scientific Invariant Test Suite
Validates the complete real-data integration against frozen scientific baselines.
"""

import os
import sys
import math
import json
from pathlib import Path

# Ensure paths
os.environ["OCEANEMBED_ZARR_PATH"] = r"G:\My Drive\oceanembed_data\zarr\oceanembed_multiyear_2024_2026.zarr"
os.environ["OCEANEMBED_CHECKPOINT_PATH"] = r"C:\adrishta-66\checkpoints\oceanembed_multiyear_physics.pt"
os.environ["OCEANEMBED_BASELINE_CHECKPOINT_PATH"] = r"C:\adrishta-66\checkpoints\oceanembed_multiyear_baseline.pt"
os.environ["OCEANEMBED_NORM_STATS_PATH"] = r"C:\adrishta-66\pipeline\norm_stats_multiyear.json"

sys.path.insert(0, r"C:\adrishta-66\GLORYS")

from backend.main import app
from fastapi.testclient import TestClient
from backend.model.ocean_embed_net import _get_master_zarr, _get_norm_stats, get_model, STANDARD_DEPTHS

client = TestClient(app)

results = []

def run_test(name, condition, details=""):
    status = "PASS" if condition else "FAIL"
    results.append((name, status, details))
    print(f"[{status}] {name} {('- ' + details) if details else ''}")

print("=====================================================================")
print("ADRISHTA: RUNNING SCIENTIFIC REAL-DATA INTEGRATION TEST SUITE")
print("=====================================================================")

# 1. Health & Configurable Storage Check
r_health = client.get("/api/v1/health")
run_test("Health Endpoint Online", r_health.status_code == 200, f"Status: {r_health.status_code}")
d_health = r_health.json()
run_test("External Master Zarr Available", d_health.get("storage", {}).get("zarr_available") is True, f"Snapshots: {d_health.get('storage', {}).get('snapshot_count')}")
run_test("Date Range 2024 to 2026", d_health.get("storage", {}).get("date_range") == ["2024-01-07", "2026-09-27"], f"Range: {d_health.get('storage', {}).get('date_range')}")
run_test("Models Available", d_health.get("models", {}).get("physics_checkpoint_available") and d_health.get("models", {}).get("baseline_checkpoint_available"))

# 2. Deployed Model Architecture & Governance Info
r_info = client.get("/api/v1/model/info")
run_test("Model Info HTTP 200", r_info.status_code == 200)
d_info = r_info.json()
arch = d_info.get("deployed_architecture", {})
run_test("11 Input Features", arch.get("input_dimension") == 11, f"Features: {arch.get('input_features')}")
run_test("256-D Latent Dimension", arch.get("latent_dimension") == 256)
run_test("15 Output Depths", len(arch.get("output_depths_m", [])) == 15)
gov = d_info.get("dataset_governance", {})
run_test("Governance 2024/2025/2026", str(gov.get("training_partition")).startswith("2024") and str(gov.get("audited_oos_holdout")).startswith("2025") and str(gov.get("operational_synoptic_data")).startswith("2026"))

# 3. Canonical /reconstruction/profile
r_prof = client.get("/api/v1/reconstruction/profile?lat=15.0&lon=65.0&date=2026-09-20&model=physics")
run_test("Profile Inference HTTP 200", r_prof.status_code == 200)
d_prof = r_prof.json()
run_test("Profile Matched Snapshot Exists", d_prof.get("matched_snapshot_date") is not None and "delta_hours" in d_prof)
run_test("Profile Surface Inputs (7 channels)", len(d_prof.get("surface_inputs", {})) == 7, f"Channels: {list(d_prof.get('surface_inputs', {}).keys())}")
run_test("Profile 15-Depth Predicted Temp", len(d_prof.get("predicted_temperature", [])) == 15 and all(isinstance(v, (int, float)) for v in d_prof.get("predicted_temperature", [])))
run_test("Profile Derived Sound Speed & Density", len(d_prof.get("sound_speed", [])) == 15 and len(d_prof.get("potential_density", [])) == 15)
run_test("Profile MLD & Thermocline Computed", isinstance(d_prof.get("mixed_layer_depth_m"), (int, float)) and isinstance(d_prof.get("thermocline_depth_m"), (int, float)))

# Land-mask test
r_land = client.get("/api/v1/reconstruction/profile?lat=25.0&lon=75.0&date=2026-09-20")
run_test("Land Mask Enforced Fail-Closed", r_land.json().get("is_ocean") is False and r_land.json().get("predicted_temperature") is None)

# 4. /reconstruction/grid
r_grid = client.get("/api/v1/reconstruction/grid?date=2026-09-20&depth=100&model=physics")
run_test("Grid Inference HTTP 200", r_grid.status_code == 200)
d_grid = r_grid.json()
run_test("Grid is Real (Not Synthetic)", d_grid.get("is_synthetic") is False)
run_test("Grid Prediction Array Valid", len(d_grid.get("temperature", [])) > 0 or len(d_grid.get("grid_data", [])) > 0 or len(d_grid.get("values", [])) > 0 or len(d_grid.get("predicted_grid", [])) > 0)

# 5. /reconstruction/volume3d
r_vol = client.get("/api/v1/reconstruction/volume3d?date=2026-09-20&model=physics")
run_test("Volume3D HTTP 200", r_vol.status_code == 200)
d_vol = r_vol.json()
run_test("Volume3D Model-Driven", d_vol.get("is_synthetic") is False and "Model" in d_vol.get("source_of_truth", ""))

# 6. /reconstruction/transect
r_trans = client.get("/api/v1/reconstruction/transect?lat_start=10&lon_start=60&lat_end=20&lon_end=70&date=2026-09-20&model=physics")
run_test("Transect HTTP 200", r_trans.status_code == 200)

# 7. /reconstruction/timeseries
r_ts = client.get("/api/v1/reconstruction/timeseries?lat=15.0&lon=65.0&depth=100&model=physics")
run_test("Timeseries HTTP 200", r_ts.status_code == 200)
d_ts = r_ts.json()
run_test("Timeseries 142 Snapshots", len(d_ts.get("series", [])) == 142, f"Count: {len(d_ts.get('series', []))}")
run_test("Timeseries Real Predictions", d_ts.get("is_synthetic") is False and all("prediction" in item for item in d_ts.get("series", [])[:5]))

# 8. Phase 6 Forward Validation (2026-09-28)
r_val_p6 = client.get("/api/v1/validation/argo?dataset=forward_20260928")
run_test("Phase 6 Validation HTTP 200", r_val_p6.status_code == 200)
d_val_p6 = r_val_p6.json()
run_test("Phase 6 Target 2026-09-28", d_val_p6.get("target_date") == "2026-09-28")
run_test("Phase 6 Surface Snapshot 2026-09-27", d_val_p6.get("surface_snapshot_used") == "2026-09-27")
run_test("Phase 6 18 Profiles", d_val_p6.get("evaluated_profiles_count") == 18)
run_test("Phase 6 248 Valid Soundings", d_val_p6.get("valid_soundings_count") == 248)
p6_m = d_val_p6.get("overall_metrics", {})
run_test("Phase 6 Physics RMSE 0.8807", abs(p6_m.get("physics_rmse", 0) - 0.8807) < 0.005, f"Value: {p6_m.get('physics_rmse')}")
run_test("Phase 6 Baseline RMSE 0.9379", abs(p6_m.get("baseline_rmse", 0) - 0.9379) < 0.005, f"Value: {p6_m.get('baseline_rmse')}")
run_test("Phase 6 Physics MAE 0.6607", abs(p6_m.get("physics_mae", 0) - 0.6607) < 0.005, f"Value: {p6_m.get('physics_mae')}")
run_test("Phase 6 Baseline MAE 0.6934", abs(p6_m.get("baseline_mae", 0) - 0.6934) < 0.005, f"Value: {p6_m.get('baseline_mae')}")
run_test("Phase 6 RMSE Wins 13/18 (72.2%)", p6_m.get("physics_profile_wins_rmse") == 13 and abs(p6_m.get("rmse_win_rate_pct", 0) - 72.2) < 0.2)
run_test("Phase 6 Zero Inversions", p6_m.get("stratification_inversion_violations") == 0)

# 9. Historical Validation (Phase 4)
r_val_h = client.get("/api/v1/validation/argo?dataset=historical")
run_test("Historical Validation HTTP 200", r_val_h.status_code == 200)
d_val_h = r_val_h.json()
run_test("Historical 66 Profiles", d_val_h.get("evaluated_profiles_count") == 66)
run_test("Historical 52 Platforms", d_val_h.get("unique_wmo_platforms") == 52)
hm = d_val_h.get("overall_metrics", {})
run_test("Historical Physics RMSE 1.0191", abs(hm.get("physics_rmse", 0) - 1.0191) < 0.005)
run_test("Historical Baseline RMSE 1.0561", abs(hm.get("baseline_rmse", 0) - 1.0561) < 0.005)

# 10. ARGO Floats List & Matchup
r_floats = client.get("/api/v1/validation/argo/floats?dataset=forward_20260928")
run_test("ARGO Floats List HTTP 200", r_floats.status_code == 200)
floats_list = r_floats.json().get("floats", [])
run_test("18 Forward Floats Returned", len(floats_list) == 18)
if floats_list:
    first_wmo = floats_list[0].get("wmoId")
    r_matchup = client.get(f"/api/v1/validation/argo/matchup/{first_wmo}?dataset=forward_20260928")
    run_test(f"ARGO Matchup {first_wmo} HTTP 200", r_matchup.status_code == 200)
    d_m = r_matchup.json()
    run_test("Real Collocation Distance Reported", d_m.get("collocation_distance_km") is not None and d_m.get("collocation_distance_km") >= 0)
    run_test("Real Profile Winner Reported", d_m.get("winner") in ["Physics", "Baseline"])

# 11. Intelligence & Diagnostics Endpoints
r_mhw = client.get("/api/v1/intelligence/mhw?date=2026-09-20")
run_test("MHW Intelligence HTTP 200", r_mhw.status_code == 200)

r_gaps = client.get("/api/v1/intelligence/gaps?date=2026-09-20")
run_test("Observation Gaps HTTP 200", r_gaps.status_code == 200)

# 12. Export Endpoints
r_exp_csv = client.get("/api/v1/export/csv?lat=15.0&lon=65.0&date=2026-09-20&model=physics")
run_test("Export CSV HTTP 200", r_exp_csv.status_code == 200 and "depth_m,temperature_degC" in r_exp_csv.text)

r_exp_nc = client.get("/api/v1/export/netcdf?lat=15.0&lon=65.0&date=2026-09-20&model=physics")
run_test("Export NetCDF HTTP 200", r_exp_nc.status_code == 200 and len(r_exp_nc.content) > 100)

print("=====================================================================")
passed = sum(1 for _, s, _ in results if s == "PASS")
failed = sum(1 for _, s, _ in results if s == "FAIL")
print(f"SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL {len(results)})")
print("=====================================================================")

if failed > 0:
    sys.exit(1)
else:
    sys.exit(0)
