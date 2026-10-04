"""
Phase 3: Multi-Year Physics-Constrained OceanEmbedNet vs. Baseline Benchmark Engine
Trains:
  1. Model A: Baseline Model (L_data only, no physics constraints)
  2. Model B: Physics-Constrained OceanEmbedNet (L_data + lambda_mono * L_mono + lambda_lapse * L_lapse)
Evaluates on Out-of-Sample 2025 Validation Set (52 weeks, 118,300 profiles).
Outputs comparative performance table and persists trained checkpoints.
"""

import os
import sys
import time
import json
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, r"C:\adrishta-66")
sys.path.insert(0, r"C:\adrishta-66\GLORYS")

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from pipeline.dataset_multiyear import get_multiyear_dataloaders, STANDARD_DEPTHS, NUM_DEPTHS
from backend.model.ocean_embed_net import OceanEmbedNet

CHECKPOINT_DIR_LOCAL = Path(r"C:\adrishta-66\checkpoints")
CHECKPOINT_DIR_G = Path(r"G:\My Drive\oceanembed_data\checkpoints")
BENCHMARK_JSON_LOCAL = Path(r"C:\adrishta-66\pipeline\phase3_benchmark_results.json")
BENCHMARK_JSON_G = Path(r"G:\My Drive\oceanembed_data\phase3_benchmark_results.json")

DEPTH_NAMES = [f"{int(d)}m" for d in STANDARD_DEPTHS]


class PhysicsLoss(nn.Module):
    """Hydrostatic stratification monotonicity + bounded lapse rate penalty."""
    def __init__(self, lambda_mono: float = 0.35, lambda_lapse: float = 0.15, max_lapse: float = 0.25):
        super().__init__()
        self.lambda_mono = lambda_mono
        self.lambda_lapse = lambda_lapse
        self.max_lapse = max_lapse

        depths = torch.tensor(STANDARD_DEPTHS, dtype=torch.float32)
        self.register_buffer("dz", depths[1:] - depths[:-1])

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, float]]:
        loss_data = F.mse_loss(pred, target)

        if self.lambda_mono == 0.0 and self.lambda_lapse == 0.0:
            return loss_data, {"loss_data": loss_data.item(), "loss_mono": 0.0, "loss_lapse": 0.0}

        # Subsurface layers: depth index 4 is 30m, index 5 is 50m... 1000m
        # Water cools downward: T_{z+1} - T_z <= 0. Penalize if > 0 (inversion)
        subsurface = pred[:, 4:] # depths 30m to 1000m
        diff = subsurface[:, 1:] - subsurface[:, :-1]
        loss_mono = torch.mean(F.relu(diff) ** 2)

        # Vertical temperature gradient |dT/dz|
        all_diff = torch.abs(pred[:, 1:] - pred[:, :-1])
        grads = all_diff / self.dz.unsqueeze(0)
        loss_lapse = torch.mean(F.relu(grads - self.max_lapse) ** 2)

        loss_total = loss_data + self.lambda_mono * loss_mono + self.lambda_lapse * loss_lapse

        return loss_total, {
            "loss_data": loss_data.item(),
            "loss_mono": loss_mono.item(),
            "loss_lapse": loss_lapse.item()
        }


def evaluate(model: nn.Module, loader: DataLoader) -> Dict[str, any]:
    """Computes comprehensive evaluation metrics on out-of-sample data."""
    model.eval()
    all_preds = []
    all_targets = []

    with torch.no_grad():
        for batch in loader:
            x = batch["x"]
            y = batch["y"]
            pred, _, _ = model(x)
            all_preds.append(pred.cpu().numpy())
            all_targets.append(y.cpu().numpy())

    preds = np.concatenate(all_preds, axis=0) # (N, 15)
    targets = np.concatenate(all_targets, axis=0) # (N, 15)

    diff = preds - targets

    # Overall metrics
    rmse_overall = float(np.sqrt(np.mean(diff ** 2)))
    mae_overall = float(np.mean(np.abs(diff)))

    # Layer-by-layer RMSE
    depth_rmse = {}
    for d_idx, d_name in enumerate(DEPTH_NAMES):
        d_diff = diff[:, d_idx]
        depth_rmse[d_name] = round(float(np.sqrt(np.mean(d_diff ** 2))), 4)

    # Regime groupings
    # Mixed layer: 0m, 5m, 10m, 20m, 30m (indices 0..4)
    mld_rmse = float(np.sqrt(np.mean(diff[:, :5] ** 2)))
    # Thermocline: 50m, 75m, 100m, 125m, 150m, 200m (indices 5..10)
    therm_rmse = float(np.sqrt(np.mean(diff[:, 5:11] ** 2)))
    # Abyssal: 300m, 500m, 700m, 1000m (indices 11..14)
    abyssal_rmse = float(np.sqrt(np.mean(diff[:, 11:] ** 2)))

    # Inversion rate (% of adjacent subsurface layers where T_{z+1} > T_z + 0.05 C)
    subsurface = preds[:, 4:]
    inversions = np.sum((subsurface[:, 1:] - subsurface[:, :-1]) > 0.05)
    total_pairs = subsurface[:, 1:].size
    inversion_rate = float((inversions / total_pairs) * 100.0)

    # Maximum vertical temperature gradient (C/m)
    dz_np = STANDARD_DEPTHS[1:] - STANDARD_DEPTHS[:-1]
    all_grads = np.abs(preds[:, 1:] - preds[:, :-1]) / dz_np
    max_gradient = float(np.max(all_grads))
    mean_gradient = float(np.mean(all_grads))

    # Pearson correlation coefficient R^2
    p_flat = preds.ravel()
    t_flat = targets.ravel()
    corr = np.corrcoef(p_flat, t_flat)[0, 1]
    r2 = float(corr ** 2)

    return {
        "rmse_overall_deg_c": round(rmse_overall, 4),
        "mae_overall_deg_c": round(mae_overall, 4),
        "r2_score": round(r2, 4),
        "inversion_violation_rate_pct": round(inversion_rate, 3),
        "max_vertical_gradient_c_per_m": round(max_gradient, 4),
        "mean_vertical_gradient_c_per_m": round(mean_gradient, 4),
        "regime_rmse": {
            "mixed_layer_0_30m": round(mld_rmse, 4),
            "thermocline_50_200m": round(therm_rmse, 4),
            "abyssal_300_1000m": round(abyssal_rmse, 4)
        },
        "depth_by_depth_rmse": depth_rmse
    }


def train_single_model(
    model_name: str,
    use_physics: bool,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int = 15,
    lr: float = 1e-3
) -> Tuple[nn.Module, Dict[str, any]]:
    print(f"\n{'='*70}")
    print(f"TRAINING: {model_name} (Physics-Constrained: {use_physics})")
    print(f"Architecture: OceanEmbedNet (11 -> 256 -> 128 -> 64 -> 15 depths)")
    print(f"Training Samples: {len(train_loader.dataset):,} | Validation Samples: {len(val_loader.dataset):,}")
    print(f"{'='*70}")

    model = OceanEmbedNet(input_dim=11, latent_dim=256, output_dim=15)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    if use_physics:
        criterion = PhysicsLoss(lambda_mono=0.35, lambda_lapse=0.15, max_lapse=0.25)
    else:
        criterion = PhysicsLoss(lambda_mono=0.0, lambda_lapse=0.0)

    best_val_rmse = 999.0
    best_weights = None
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        train_data_loss = 0.0
        train_mono_loss = 0.0

        t0 = time.time()
        for batch in train_loader:
            x = batch["x"]
            y = batch["y"]

            optimizer.zero_grad()
            pred, _, _ = model(x)
            loss, metrics = criterion(pred, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
            optimizer.step()

            train_loss += loss.item() * len(x)
            train_data_loss += metrics["loss_data"] * len(x)
            train_mono_loss += metrics.get("loss_mono", 0.0) * len(x)

        scheduler.step()
        n_samples = len(train_loader.dataset)
        avg_train_loss = train_loss / n_samples
        epoch_sec = time.time() - t0

        # Fast mid-training validation
        eval_metrics = evaluate(model, val_loader)
        val_rmse = eval_metrics["rmse_overall_deg_c"]
        val_inv = eval_metrics["inversion_violation_rate_pct"]

        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            marker = " *"
        else:
            marker = ""

        print(f"Epoch [{epoch:2d}/{epochs:2d}] ({epoch_sec:4.1f}s) | "
              f"Train Loss: {avg_train_loss:.4f} | "
              f"Val RMSE: {val_rmse:.4f} C | "
              f"Val Inversion: {val_inv:5.2f}%{marker}")

    # Load best weights
    model.load_state_dict(best_weights)
    total_time_min = (time.time() - start_time) / 60.0
    print(f"[DONE] {model_name} trained in {total_time_min:.2f} mins. Best Val RMSE: {best_val_rmse:.4f} C")

    final_eval = evaluate(model, val_loader)
    final_eval["training_time_minutes"] = round(total_time_min, 2)
    final_eval["epochs"] = epochs
    final_eval["best_val_rmse"] = best_val_rmse

    return model, final_eval


def main():
    print("=" * 70)
    print("STARTING PHASE 3: MULTI-YEAR MODEL TRAINING & BENCHMARKING")
    print("=" * 70)

    # 1. Load Train (2024) and Val (2025)
    train_loader, val_loader, test_loader = get_multiyear_dataloaders(
        batch_size=512,
        train_stride=2, # 115,657 profiles
        val_stride=2,   # 118,300 profiles
        full_depth_only=True,
        num_workers=0
    )

    # 2. Train Model A: Baseline
    baseline_model, baseline_eval = train_single_model(
        model_name="Baseline Model (L_data Only)",
        use_physics=False,
        train_loader=train_loader,
        val_loader=val_loader,
        epochs=15
    )

    # 3. Train Model B: Physics-Constrained
    physics_model, physics_eval = train_single_model(
        model_name="Physics-Constrained OceanEmbedNet",
        use_physics=True,
        train_loader=train_loader,
        val_loader=val_loader,
        epochs=15
    )

    # 4. Save Model Weights
    torch.save(baseline_model.state_dict(), str(CHECKPOINT_DIR_LOCAL / "oceanembed_multiyear_baseline.pt"))
    torch.save(physics_model.state_dict(), str(CHECKPOINT_DIR_LOCAL / "oceanembed_multiyear_physics.pt"))
    print(f"\n[OK] Saved local checkpoints to {CHECKPOINT_DIR_LOCAL}")

    # Also save to GLORYS checkpoints for live backend serving
    glorys_ckpt = Path(r"C:\adrishta-66\GLORYS\checkpoints")
    glorys_ckpt.mkdir(parents=True, exist_ok=True)
    torch.save(physics_model.state_dict(), str(glorys_ckpt / "oceanembed_best.pt"))
    torch.save(physics_model.state_dict(), str(glorys_ckpt / "oceanembed_multiyear_physics.pt"))
    print(f"[OK] Saved production backend weights to {glorys_ckpt / 'oceanembed_best.pt'}")

    try:
        torch.save(baseline_model.state_dict(), str(CHECKPOINT_DIR_G / "oceanembed_multiyear_baseline.pt"))
        torch.save(physics_model.state_dict(), str(CHECKPOINT_DIR_G / "oceanembed_multiyear_physics.pt"))
        print(f"[OK] Saved Google Drive checkpoints to {CHECKPOINT_DIR_G}")
    except Exception as e:
        print(f"[WARN] Failed to write Google Drive checkpoints: {e}")

    # 5. Comparative Benchmark Report
    comparison = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "training_dataset": "2024 Real Observations (51 weeks, 115,657 full-depth soundings)",
        "validation_dataset": "2025 Out-of-Sample Observations (52 weeks, 118,300 full-depth soundings)",
        "models": {
            "baseline_model": baseline_eval,
            "physics_constrained_oceanembed": physics_eval
        },
        "relative_improvements": {
            "rmse_reduction_deg_c": round(baseline_eval["rmse_overall_deg_c"] - physics_eval["rmse_overall_deg_c"], 4),
            "mae_reduction_deg_c": round(baseline_eval["mae_overall_deg_c"] - physics_eval["mae_overall_deg_c"], 4),
            "inversion_reduction_pct": round(baseline_eval["inversion_violation_rate_pct"] - physics_eval["inversion_violation_rate_pct"], 3),
            "thermocline_rmse_reduction_deg_c": round(
                baseline_eval["regime_rmse"]["thermocline_50_200m"] - physics_eval["regime_rmse"]["thermocline_50_200m"], 4
            )
        }
    }

    with open(BENCHMARK_JSON_LOCAL, "w", encoding="utf-8") as f:
        json.dump(comparison, f, indent=2)
    print(f"[OK] Saved benchmark report to {BENCHMARK_JSON_LOCAL}")

    try:
        with open(BENCHMARK_JSON_G, "w", encoding="utf-8") as f:
            json.dump(comparison, f, indent=2)
        print(f"[OK] Saved benchmark report to Google Drive: {BENCHMARK_JSON_G}")
    except Exception as e:
        pass

    # Print Comparative Performance Table
    print("\n" + "=" * 80)
    print("PHASE 3 BENCHMARK RESULTS: OUT-OF-SAMPLE 2025 VALIDATION (118,300 SOUNDINGS)")
    print("=" * 80)
    print(f"{'Metric':<36} | {'Baseline (No Physics)':<20} | {'Physics-Constrained':<20} | {'Delta':<10}")
    print("-" * 92)
    
    b_rmse = baseline_eval["rmse_overall_deg_c"]
    p_rmse = physics_eval["rmse_overall_deg_c"]
    print(f"{'Overall RMSE (deg C)':<36} | {b_rmse:<20.4f} | {p_rmse:<20.4f} | {p_rmse - b_rmse:+8.4f}")
    
    b_mae = baseline_eval["mae_overall_deg_c"]
    p_mae = physics_eval["mae_overall_deg_c"]
    print(f"{'Overall MAE (deg C)':<36} | {b_mae:<20.4f} | {p_mae:<20.4f} | {p_mae - b_mae:+8.4f}")

    b_r2 = baseline_eval["r2_score"]
    p_r2 = physics_eval["r2_score"]
    print(f"{'Correlation R^2':<36} | {b_r2:<20.4f} | {p_r2:<20.4f} | {p_r2 - b_r2:+8.4f}")

    b_inv = baseline_eval["inversion_violation_rate_pct"]
    p_inv = physics_eval["inversion_violation_rate_pct"]
    print(f"{'Stratification Inversions (%)':<36} | {b_inv:<19.2f}% | {p_inv:<19.2f}% | {p_inv - b_inv:+7.2f}%")

    b_mld = baseline_eval["regime_rmse"]["mixed_layer_0_30m"]
    p_mld = physics_eval["regime_rmse"]["mixed_layer_0_30m"]
    print(f"{'Mixed Layer RMSE (0-30m) (deg C)':<36} | {b_mld:<20.4f} | {p_mld:<20.4f} | {p_mld - b_mld:+8.4f}")

    b_thm = baseline_eval["regime_rmse"]["thermocline_50_200m"]
    p_thm = physics_eval["regime_rmse"]["thermocline_50_200m"]
    print(f"{'Thermocline RMSE (50-200m) (deg C)':<36} | {b_thm:<20.4f} | {p_thm:<20.4f} | {p_thm - b_thm:+8.4f}")

    b_aby = baseline_eval["regime_rmse"]["abyssal_300_1000m"]
    p_aby = physics_eval["regime_rmse"]["abyssal_300_1000m"]
    print(f"{'Abyssal RMSE (300-1000m) (deg C)':<36} | {b_aby:<20.4f} | {p_aby:<20.4f} | {p_aby - b_aby:+8.4f}")

    print("=" * 80)
    print("\nLayer-by-Layer Depth RMSE Breakdown (deg C):")
    for d_name in DEPTH_NAMES:
        b_d = baseline_eval["depth_by_depth_rmse"][d_name]
        p_d = physics_eval["depth_by_depth_rmse"][d_name]
        print(f"  {d_name:>6s}: Baseline = {b_d:.4f} C | Physics = {p_d:.4f} C | Improvement = {b_d - p_d:+.4f} C")
    print("=" * 80)

if __name__ == "__main__":
    main()
