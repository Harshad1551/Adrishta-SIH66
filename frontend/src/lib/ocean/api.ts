/**
 * ADRISHTA Ocean AI - Production FastAPI Backend Client
 * Connects the React/TanStack frontend directly to the operational Python scientific engine.
 * Zero synthetic fallback in REAL mode. Fail-closed error handling.
 */

const rawEnvUrl = (typeof import.meta !== "undefined" && (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL)) || "";
export const BACKEND_URL = rawEnvUrl
  ? (rawEnvUrl.endsWith("/api/v1") ? rawEnvUrl : `${rawEnvUrl.replace(/\/+$/, "")}/api/v1`)
  : "http://localhost:8000/api/v1";

export interface BackendHealthResponse {
  status: "online" | "degraded";
  service: string;
  domain: string;
  grid: string;
  depths: number;
  data_status: "READY" | "UNAVAILABLE";
  fail_closed_mode: boolean;
  storage: {
    zarr_available: boolean;
    configured_path: string;
    snapshot_count: number;
    date_range: [string, string] | null;
    storage_mode: string;
  };
  models: {
    physics_checkpoint_available: boolean;
    baseline_checkpoint_available: boolean;
    normalization_available: boolean;
  };
  governance: {
    training_partition: string;
    audited_oos_holdout: string;
    operational_synoptic_data: string;
  };
  version: string;
}

export interface RealProfileResponse {
  lat: number;
  lon: number;
  location: { lat: number; lon: number };
  date: string;
  requested_date: string;
  matched_snapshot_date: string;
  synoptic_delta_days: number;
  delta_hours: number;
  timestamp: string;
  depths: number[];
  depths_m: number[];
  predicted_temperature: number[] | null;
  temperature?: number[] | null;
  temperature_degC?: number[] | null;
  uncertainty?: number[] | null;
  uncertainty_degC?: number[] | null;
  ground_truth?: number[] | null;
  glorys_reference?: number[] | null;
  rmse_vs_target?: number | null;
  sound_speed?: number[];
  potential_density?: number[];
  pressure_dbar?: number[];
  mixed_layer_depth_m?: number;
  thermocline_depth_m?: number;
  vertical_lapse_diagnostics?: {
    max_gradient_degC_per_m: number;
    thermocline_depth_m: number;
    stratification_inversion_violations: number;
    physical_consistency_statement: string;
  };
  surface_inputs?: {
    sst: number;
    sss: number;
    ssh: number;
    current_u: number;
    current_v: number;
    wind_u: number;
    wind_v: number;
  } | null;
  is_ocean: boolean;
  qc_status: string;
  data_quality?: string;
  latent_embedding_norm?: number;
  model_name: string;
  checkpoint_identifier?: string;
  source_of_truth?: string;
  provenance: string;
  version: string;
  message?: string;
}

export interface RealGridPoint {
  lat: number;
  lon: number;
  value: number;
  prediction: number;
  uncertainty: number;
  ocean: boolean;
  glorys_reference?: number | null;
}

export interface RealGridResponse {
  requested_date: string;
  snapshot_used: string;
  matched_snapshot_date: string;
  delta_days: number;
  delta_hours: number;
  timestamp: string;
  depth: number;
  depth_m: number;
  model: string;
  model_type: string;
  checkpoint_identifier: string;
  variable: string;
  grid_shape: [number, number];
  dimensions: { lat: number; lon: number };
  lats: number[];
  lons: number[];
  latitude_array: number[];
  longitude_array: number[];
  values: (number | null)[][];
  prediction_array: (number | null)[][];
  valid_mask: boolean[][];
  points: RealGridPoint[];
  min: number;
  max: number;
  mean: number;
  unit: string;
  source_of_truth: string;
  provenance: string;
  is_synthetic: boolean;
  data_status: string;
}

export interface RealVoxel {
  x: number;
  y: number;
  z: number;
  temp: number;
  prediction: number;
  uncertainty: number;
  norm: number;
  lat: number;
  lon: number;
  depth: number;
  glorys_reference?: number | null;
}

export interface RealVolume3dResponse {
  total_voxels: number;
  grid_dims: [number, number, number];
  domain: string;
  depth_range_m: [number, number];
  depths_m: number[];
  requested_date: string;
  matched_snapshot_date: string;
  snapshot_used: string;
  delta_hours: number;
  model_name: string;
  model_type: string;
  voxels: RealVoxel[];
  source: string;
  source_of_truth: string;
  is_synthetic: boolean;
  data_status: string;
}

export interface RealTransectResponse {
  orientation: "zonal" | "meridional";
  fixed_latitude?: number;
  fixed_longitude?: number;
  requested_date: string;
  matched_snapshot_date: string;
  delta_hours: number;
  model_name: string;
  model_type: string;
  longitudes?: number[];
  latitudes?: number[];
  depths_m: number[];
  temperature_matrix: (number | null)[][];
  prediction_matrix: (number | null)[][];
  uncertainty_matrix: (number | null)[][];
  glorys_reference_matrix?: (number | null)[][];
  source: string;
  source_of_truth: string;
  is_synthetic: boolean;
  data_status: string;
}

export interface RealTimeseriesEntry {
  date: string;
  snapshot_date: string;
  temperature: number;
  prediction: number;
  anomaly: number;
  uncertainty: number;
  glorys_reference?: number | null;
}

export interface RealTimeseriesResponse {
  location: { lat: number; lon: number };
  depth_m: number;
  model_name: string;
  model_type: string;
  climate_event: string;
  snapshot_frequency: string;
  total_snapshots: number;
  source_of_truth: string;
  provenance: string;
  series: RealTimeseriesEntry[];
  is_ocean?: boolean;
  is_synthetic: boolean;
  data_status: string;
}

export interface RealArgoValidationResponse {
  dataset_id: "forward_20260928" | "historical";
  dataset_label: string;
  target_date: string;
  surface_snapshot_used: string;
  temporal_offset_hours: number;
  temporal_offset_label: string;
  evaluation_rule: string;
  supervision_target: string;
  validation_dataset: string;
  evaluated_profiles_count: number;
  valid_soundings_count: number;
  unique_wmo_platforms: number;
  sample_description: string;
  overall_metrics: {
    rmse_degC: number;
    physics_rmse: number;
    baseline_rmse: number;
    delta_rmse: number;
    mae_degC: number;
    physics_mae: number;
    baseline_mae: number;
    delta_mae: number;
    mbe_phys: number;
    mbe_base?: number;
    r2_score: number;
    r2_phys?: number;
    r2_base?: number;
    physics_profile_wins_rmse: number;
    baseline_profile_wins_rmse: number;
    rmse_win_rate_pct: number;
    physics_profile_wins_mae: number;
    baseline_profile_wins_mae: number;
    mae_win_rate_pct: number;
    stratification_inversion_violations: number;
    bootstrap_95_ci_mae?: [number, number];
    statistical_significance?: string;
    physical_consistency_statement: string;
  };
  depth_resolved_metrics: {
    depths_m: number[];
    physics_constrained_rmse: number[];
    baseline_rmse: number[];
    physics_constrained_mae?: number[];
    baseline_mae?: number[];
    climatology_rmse?: number[];
  };
  layer_breakdown: {
    mixed_layer_0_30m: {
      physics_rmse: number;
      baseline_rmse: number;
      physics_mae?: number;
      baseline_mae?: number;
      soundings?: number;
    };
    thermocline_50_200m: {
      physics_rmse: number;
      baseline_rmse: number;
      physics_mae?: number;
      baseline_mae?: number;
      soundings?: number;
    };
    abyssal_300_1000m: {
      physics_rmse: number;
      baseline_rmse: number;
      physics_mae?: number;
      baseline_mae?: number;
      soundings?: number;
    };
  };
  provenance_statement: string;
  source: string;
  is_synthetic: boolean;
}

export interface RealArgoFloatItem {
  wmoId: string;
  cycleNumber: number;
  timestamp: string;
  lat: number;
  lon: number;
  dist_km: number;
  winner: "Physics" | "Baseline";
  winner_rmse?: "Physics" | "Baseline";
  winner_mae?: "Physics" | "Baseline";
  rmse_phys?: number;
  rmse_base?: number;
  mae_phys?: number;
  mae_base?: number;
  delta_rmse?: number;
  depths: number[];
  temperatures: number[];
  sst: number;
  source: string;
  isSynthetic: boolean;
}

export interface RealArgoMatchup {
  wmo_id: string;
  cycle_number: number;
  timestamp: string;
  lat: number;
  lon: number;
  argo_sst: number;
  depths_m: number[];
  temperatures_argo: number[];
  temperatures_physics: number[];
  temperatures_baseline: number[];
  temperatures_climatology?: number[];
  profile_rmse: {
    physics_constrained: number;
    baseline: number;
    delta_rmse?: number;
  };
  profile_mae?: {
    physics_constrained: number;
    baseline: number;
    delta_mae?: number;
  };
  winner: "Physics" | "Baseline";
  winner_rmse?: "Physics" | "Baseline";
  winner_mae?: "Physics" | "Baseline";
  mld_m: number;
  thermocline_depth_m: number;
  spatial_collocation_km: number;
  collocation_distance_km: number;
  temporal_collocation_hours: number;
  temporal_offset_label: string;
  qc_status: string;
  dataset: string;
}

export interface RealDerivedPhysicsResponse {
  location: { lat: number; lon: number };
  date: string;
  matched_snapshot_date: string;
  delta_hours: number;
  qc_status: string;
  model_name: string;
  data_status: string;
  depths_m: number[];
  temperature_degC: number[];
  salinity_psu: number[];
  sound_speed_m_s: number[];
  potential_density_kg_m3: number[];
  mixed_layer_depth_m: number;
  thermocline: {
    depth_m: number;
    peak_gradient_c_per_m: number;
    gradient_profile_c_per_m: number[];
  };
  ocean_heat_content: {
    ohc_0_700m_gj_m2: number;
    ohc_integrated_layer: string;
  };
  acoustic_channel: {
    sofar_axis_depth_m: number;
    axis_sound_speed_m_s: number;
    surface_duct: boolean;
  };
}

export interface RealExplainabilityResponse {
  method: string;
  relative_importance_pct: Record<string, number>;
  sensitivities_raw: Record<string, number>;
  strata_impact: {
    mixed_layer_0_30m: Record<string, number>;
    thermocline_50_200m: Record<string, number>;
    abyssal_300_1000m: Record<string, number>;
  };
  top_channel: string;
  top_channel_importance_pct: number;
  physical_interpretation: string;
  is_model_derived: boolean;
}

export interface RealMhwEvent {
  id: string;
  region: string;
  event_type: string;
  category: string;
  severity: string;
  peak_anomaly_c: number;
  mean_anomaly_c: number;
  subsurface_penetration_m: number;
  status: string;
  snapshot_date: string;
  driver: string;
}

export interface RealMhwResponse {
  date: string;
  basin_active_events: RealMhwEvent[];
  events_count: number;
  message: string;
  local_evaluation?: {
    is_active_mhw: boolean;
    category: string;
    severity_label: string;
    color: string;
    intensity_ratio: number;
    surface_anomaly_degC: number;
    max_subsurface_anomaly_degC: number;
    penetration_depth_m: number;
    subsurface_amplified: boolean;
    depth_anomalies_degC: number[];
    warning_advisory: string;
  } | null;
}

export interface RealGapRecommendation {
  target_lat: number;
  target_lon: number;
  priority: string;
  score: number;
  distance_km: number;
  reason: string;
}

export interface RealGapsResponse {
  total_evaluated: number;
  active_argo_floats_count: number;
  priority_grid: Array<{
    lat: number;
    lon: number;
    priority_score: number;
    distance_to_nearest_float_km: number;
    model_uncertainty_degC: number;
    ocean: boolean;
  }>;
  recommendations: RealGapRecommendation[];
  methodology: string;
  is_synthetic: boolean;
}

export interface RealModelInfoResponse {
  framework: string;
  deployed_architecture: {
    input_dimension: number;
    input_features: string[];
    encoder: string;
    latent_dimension: number;
    decoder: string;
    output_heads: string;
    inference_physics_enforcement: string;
    output_depths_m: number[];
  };
  active_checkpoint: string;
  physics_checkpoint: string;
  baseline_checkpoint: string;
  normalization_file: string;
  dataset_governance: {
    training_partition: string;
    audited_oos_holdout: string;
    operational_synoptic_data: string;
    supervision_target: string;
    independent_validation: string;
  };
  physics_penalties: {
    lambda_mono: number;
    lambda_lapse: number;
    max_lapse_rate: string;
    loss_function: string;
  };
  audited_benchmarks: {
    phase4_historical_argo: {
      dataset: string;
      physics_rmse_degC: number;
      baseline_rmse_degC: number;
      physics_mae_degC: number;
      baseline_mae_degC: number;
      r2_score: number;
      bootstrap_95_ci_mae: [number, number];
      stratification_inversion_violations: number;
    };
    phase6_forward_operational: {
      dataset: string;
      target_date: string;
      surface_snapshot: string;
      physics_rmse_degC: number;
      baseline_rmse_degC: number;
      physics_mae_degC: number;
      baseline_mae_degC: number;
      physics_mbe_degC: number;
      baseline_mbe_degC: number;
      r2_score_physics: number;
      r2_score_baseline: number;
      physics_profile_wins_rmse: string;
      physics_profile_wins_mae: string;
      stratification_inversion_violations: number;
    };
  };
  inference_latency_ms: string;
}

/**
 * Check connectivity and storage health with FastAPI server
 */
export async function checkBackendHealth(): Promise<BackendHealthResponse | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Fetch real reconstructed 15-depth vertical profile from FastAPI backend
 */
export async function fetchRealProfile(
  lat: number,
  lon: number,
  date: string,
  model: "physics" | "baseline" = "physics"
): Promise<RealProfileResponse> {
  const url = `${BACKEND_URL}/reconstruction/profile?lat=${lat}&lon=${lon}&date=${date}&model=${model}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch profile (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch real 2D gridded horizontal thermal slice from FastAPI backend
 */
export async function fetchRealGridSlice(
  depth: number,
  date: string,
  variable: string = "temp",
  subsample: number = 2,
  model: "physics" | "baseline" = "physics"
): Promise<RealGridResponse> {
  const url = `${BACKEND_URL}/reconstruction/grid?depth=${depth}&date=${date}&variable=${variable}&subsample=${subsample}&model=${model}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch grid slice (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch real 3D volumetric point cloud for Three.js chamber
 */
export async function fetchRealVolume3d(
  date: string = "2026-10-03",
  subsample: number = 4,
  model: "physics" | "baseline" = "physics",
  includeReference: boolean = false
): Promise<RealVolume3dResponse> {
  const url = `${BACKEND_URL}/reconstruction/volume3d?date=${date}&subsample=${subsample}&model=${model}&include_reference=${includeReference}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch 3D volume (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch real transect slice
 */
export async function fetchRealTransect(
  orientation: "zonal" | "meridional",
  coord: number,
  date: string = "2026-10-03",
  model: "physics" | "baseline" = "physics",
  includeReference: boolean = false
): Promise<RealTransectResponse> {
  const url = `${BACKEND_URL}/reconstruction/transect?orientation=${orientation}&coord=${coord}&date=${date}&model=${model}&include_reference=${includeReference}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch transect (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch genuine 142-week neural time series
 */
export async function fetchRealTimeseries(
  lat: number,
  lon: number,
  depth: number = 0,
  model: "physics" | "baseline" = "physics"
): Promise<RealTimeseriesResponse> {
  const url = `${BACKEND_URL}/reconstruction/timeseries?lat=${lat}&lon=${lon}&depth=${depth}&model=${model}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch time series (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch real ARGO validation summary
 */
export async function fetchRealArgoValidation(
  dataset: "forward_20260928" | "historical" = "forward_20260928",
  date?: string
): Promise<RealArgoValidationResponse> {
  const url = `${BACKEND_URL}/validation/argo?dataset=${dataset}${date ? `&date=${date}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch ARGO validation summary (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch real active ARGO floats in NIO domain for selected dataset
 */
export async function fetchRealArgoFloats(
  dataset: "forward_20260928" | "historical" = "forward_20260928"
): Promise<{ dataset: string; count: number; floats: RealArgoFloatItem[] }> {
  const res = await fetch(`${BACKEND_URL}/validation/argo/floats?dataset=${dataset}`);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch ARGO floats (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch single ARGO profile matchup
 */
export async function fetchRealArgoMatchup(
  wmoId: string,
  dataset: "forward_20260928" | "historical" = "forward_20260928"
): Promise<RealArgoMatchup> {
  const res = await fetch(`${BACKEND_URL}/validation/argo/matchup/${encodeURIComponent(wmoId)}?dataset=${dataset}`);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch matchup for float ${wmoId} (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch derived physics diagnostics
 */
export async function fetchDerivedPhysics(
  lat: number,
  lon: number,
  date: string = "2026-10-03",
  model: "physics" | "baseline" = "physics"
): Promise<RealDerivedPhysicsResponse> {
  const url = `${BACKEND_URL}/physics/derived?lat=${lat}&lon=${lon}&date=${date}&model=${model}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch derived physics (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch model-derived feature attribution
 */
export async function fetchExplainability(
  lat: number,
  lon: number,
  date: string = "2026-10-03",
  model: "physics" | "baseline" = "physics"
): Promise<RealExplainabilityResponse> {
  const url = `${BACKEND_URL}/reconstruction/explain?lat=${lat}&lon=${lon}&date=${date}&model=${model}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch explainability (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch Marine Heatwave events
 */
export async function fetchMarineHeatwaves(
  lat?: number,
  lon?: number,
  date: string = "2026-10-03"
): Promise<RealMhwResponse> {
  let url = `${BACKEND_URL}/intelligence/mhw?date=${date}`;
  if (lat !== undefined && lon !== undefined) {
    url += `&lat=${lat}&lon=${lon}`;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch MHW events (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch observation gaps
 */
export async function fetchObservationGaps(
  subsample: number = 4,
  date: string = "2026-10-03"
): Promise<RealGapsResponse> {
  const url = `${BACKEND_URL}/intelligence/gaps?subsample=${subsample}&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`REAL DATA UNAVAILABLE: Failed to fetch observation gaps (${res.statusText})`);
  }
  return await res.json();
}

/**
 * Fetch official architecture metadata and governance
 */
export async function fetchModelInfo(): Promise<RealModelInfoResponse> {
  const res = await fetch(`${BACKEND_URL}/model/info`);
  if (!res.ok) {
    throw new Error("REAL DATA UNAVAILABLE: Failed to fetch model metadata");
  }
  return await res.json();
}
export interface RealClimateContextResponse {
  event: string;
  oni_el_nino_index: number;
  iod_dmi_index: number;
  mean_surface_anomaly_degC: number;
  peak_surface_anomaly_degC: number;
  mhw_basin_coverage_pct: number;
  mhw_category: string;
  monsoon_context: string;
  dates_available: number;
  temporal_range: string;
  data_status?: string;
}

export async function fetchRealClimateContext(): Promise<RealClimateContextResponse> {
  const res = await fetch(`${BACKEND_URL}/diagnostics/climate-context`);
  if (!res.ok) {
    throw new Error("REAL DATA UNAVAILABLE: Failed to fetch climate context");
  }
  return await res.json();
}

export interface IngestionStatusResponse {
  status: string;
  completed_dates: number;
  total_dates: number;
  progress_pct: number;
  temporal_range: string;
  current_date: string;
  soundings_total: number;
  storage_mode: string;
  last_updated: string;
}

export async function fetchIngestionStatus(): Promise<IngestionStatusResponse> {
  const res = await fetch(`${BACKEND_URL}/diagnostics/ingestion-status`);
  if (!res.ok) {
    throw new Error("REAL DATA UNAVAILABLE: Failed to fetch ingestion status");
  }
  return await res.json();
}
