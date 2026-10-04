"""
OceanEmbed Training and Comparative Benchmarking Engine (Phase 5 and 6)
Trains:
1. Model A: Baseline Model (L_data only, no physics loss)
2. Model B: Physics-Constrained Model (L_data + lambda * L_physics)

Compares:
- Overall Validation RMSE and MAE (deg C)
- Stratification Inversion Rate (% of unphysical vertical inversions)
- Maximum Gradient Stability
"""

import json
import time
import sys
from pathlib import Path
from typing import Dict, Tuple, List
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from backend.pipeline.dataset_builder import OceanEmbedDataset
from backend.model.ocean_embed_net import OceanEmbedNet
from backend.model.physics_loss import OceanPhysicsLoss


def evaluate_model(
    model: nn.Module,
    val_loader: DataLoader,
) -> Dict[str, float]:
    model.eval()
    all_preds = []
    all_targets = []

    with torch.no_grad():
        for batch in val_loader:
            x = batch["x"]
            y = batch["y"]
            pred_temp, _, _ = model(x)
            all_preds.append(pred_temp.cpu().numpy())
            all_targets.append(y.cpu().numpy())

    preds = np.concatenate(all_preds, axis=0)
    targets = np.concatenate(all_targets, axis=0)

    # 1. Metric: Root Mean Squared Error (RMSE)
    diff = preds - targets
    rmse = float(np.sqrt(np.mean(diff ** 2)))

    # 2. Metric: Mean Absolute Error (MAE)
    mae = float(np.mean(np.abs(diff)))

    # 3. Metric: Stratification Inversion Violation Rate (%)
    subsurface = preds[:, 4:]
    inversions = np.sum((subsurface[:, 1:] - subsurface[:, :-1]) > 0.05)
    total_subsurface_layers = subsurface[:, 1:].size
    inversion_rate = float(inversions / total_subsurface_layers * 100.0)

    # 4. Metric: Maximum Vertical Temperature Gradient
    dz = np.array([5, 5, 10, 10, 20, 25, 25, 25, 25, 50, 100, 200, 200, 300], dtype=np.float32)
    gradients = np.abs(preds[:, 1:] - preds[:, :-1]) / dz
    max_gradient = float(np.max(gradients))

    return {
        "rmse_degC": round(rmse, 4),
        "mae_degC": round(mae, 4),
        "inversion_violation_rate_pct": round(inversion_rate, 2),
        "max_gradient_degC_per_m": round(max_gradient, 4),
    }


def render_progress_bar(current: int, total: int, bar_length: int = 24) -> str:
    fraction = min(1.0, current / max(1, total))
    filled = int(fraction * bar_length)
    bar = "=" * filled + (">" if filled < bar_length else "")
    bar = bar.ljust(bar_length, ".")
    pct = int(fraction * 100)
    return f"[{bar}] {pct:3d}%"


def train_single_model(
    model_name: str,
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    loss_fn: OceanPhysicsLoss,
    num_epochs: int,
    lr: float,
) -> Tuple[nn.Module, Dict[str, float], List[Dict]]:
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    total_batches = len(train_loader)
    history = []

    print(f"\n>>> Starting Training: {model_name}")
    print(f"    Batches per epoch: {total_batches} | Optimizer: AdamW(lr={lr})\n", flush=True)

    start_total_time = time.time()

    for epoch in range(1, num_epochs + 1):
        epoch_start = time.time()
        model.train()
        running_total_loss = 0.0
        running_data_loss = 0.0
        running_phys_loss = 0.0

        for b_idx, batch in enumerate(train_loader, 1):
            x, y = batch["x"], batch["y"]
            optimizer.zero_grad()
            pred, _, _ = model(x)
            loss, loss_dict = loss_fn(pred, y)
            loss.backward()
            optimizer.step()

            running_total_loss += loss.item()
            running_data_loss += float(loss_dict.get("loss_data", 0.0))
            phys_val = float(loss_dict.get("loss_mono", 0.0)) + float(loss_dict.get("loss_lapse", 0.0)) + float(loss_dict.get("loss_deep", 0.0))
            running_phys_loss += phys_val

            if b_idx % 25 == 0 or b_idx == total_batches:
                cur_total = running_total_loss / b_idx
                cur_data = running_data_loss / b_idx
                cur_phys = running_phys_loss / b_idx
                bar = render_progress_bar(b_idx, total_batches)
                sys.stdout.write(
                    f"\r  Epoch {epoch:02d}/{num_epochs:02d} {bar} (Batch {b_idx:03d}/{total_batches}) | "
                    f"Loss: {cur_total:.4f} (MSE: {cur_data:.4f}, Phys: {cur_phys:.4f})"
                )
                sys.stdout.flush()

        epoch_time = time.time() - epoch_start
        val_eval = evaluate_model(model, val_loader)
        avg_loss = running_total_loss / total_batches

        epoch_rec = {
            "epoch": epoch,
            "train_loss": round(avg_loss, 4),
            "val_rmse": val_eval["rmse_degC"],
            "inversion_rate": val_eval["inversion_violation_rate_pct"],
            "time_sec": round(epoch_time, 2),
        }
        history.append(epoch_rec)

        print(
            f"\r  Epoch {epoch:02d}/{num_epochs:02d} {render_progress_bar(total_batches, total_batches)} | "
            f"Loss: {avg_loss:.4f} | Val RMSE: {val_eval['rmse_degC']:.3f} C | "
            f"Inversions: {val_eval['inversion_violation_rate_pct']:.2f}% | {epoch_time:.2f}s",
            flush=True,
        )

    total_duration = time.time() - start_total_time
    final_metrics = evaluate_model(model, val_loader)
    print(f"\n  [OK] Completed {model_name} in {total_duration:.1f}s")
    print(f"       Final Val RMSE: {final_metrics['rmse_degC']} C | Inversions: {final_metrics['inversion_violation_rate_pct']}%\n", flush=True)

    return model, final_metrics, history


def train_oceanembed(
    num_epochs: int = 15,
    batch_size: int = 128,
    learning_rate: float = 1e-3,
    output_dir: str = "c:/adrishta-66/checkpoints",
) -> Dict:
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    surf_zarr = "c:/adrishta-66/data/zarr/surface_harmonized_2024-05-15.zarr"
    glorys_zarr = "c:/adrishta-66/data/zarr/glorys_target_2024-05-15.zarr"

    print("\n=======================================================")
    print(" OCEANEMBED PROGRESSIVE TRAINING & PHYSICS BENCHMARKING ")
    print("=======================================================")
    print("Loading dataset into memory for ultra-fast training...")
    full_dataset = OceanEmbedDataset(surf_zarr, glorys_zarr, subsample_stride=1)
    train_size = int(0.8 * len(full_dataset))
    val_size = len(full_dataset) - train_size

    generator = torch.Generator().manual_seed(42)
    train_ds, val_ds = random_split(full_dataset, [train_size, val_size], generator=generator)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    print(f"Dataset: {len(full_dataset)} oceanic profiles (Train: {train_size}, Val: {val_size})")
    print(f"Batch size: {batch_size}, Total Epochs: {num_epochs}")

    # 1. TRAIN MODEL A: BASELINE MODEL (No Physics Regularization)
    baseline_model = OceanEmbedNet()
    loss_fn_base = OceanPhysicsLoss(lambda_mono=0.0, lambda_lapse=0.0, lambda_deep=0.0)
    baseline_model, metrics_base, history_base = train_single_model(
        model_name="Model A: Standard Baseline (Data Loss Only)",
        model=baseline_model,
        train_loader=train_loader,
        val_loader=val_loader,
        loss_fn=loss_fn_base,
        num_epochs=num_epochs,
        lr=learning_rate,
    )

    base_ckpt = out_path / "oceanembed_baseline.pt"
    torch.save(
        {
            "model_state_dict": baseline_model.state_dict(),
            "metrics": metrics_base,
            "history": history_base,
            "architecture": "OceanEmbedNet-Baseline",
            "epochs": num_epochs,
        },
        str(base_ckpt),
    )

    # 2. TRAIN MODEL B: PHYSICS-CONSTRAINED MODEL (L_data + lambda * L_phys)
    physics_model = OceanEmbedNet()
    loss_fn_phys = OceanPhysicsLoss(lambda_mono=0.25, lambda_lapse=0.10, lambda_deep=0.05)
    physics_model, metrics_phys, history_phys = train_single_model(
        model_name="Model B: Physics-Constrained (Hydrostatic + Lapse Regularized)",
        model=physics_model,
        train_loader=train_loader,
        val_loader=val_loader,
        loss_fn=loss_fn_phys,
        num_epochs=num_epochs,
        lr=learning_rate,
    )

    phys_ckpt = out_path / "oceanembed_physics_constrained.pt"
    torch.save(
        {
            "model_state_dict": physics_model.state_dict(),
            "metrics": metrics_phys,
            "history": history_phys,
            "architecture": "OceanEmbedNet-PhysicsConstrained",
            "epochs": num_epochs,
        },
        str(phys_ckpt),
    )

    # Save to GLORYS backend checkpoint directory for live inference
    glorys_ckpt = Path("c:/adrishta-66/GLORYS/checkpoints/best_model.pt")
    glorys_ckpt.parent.mkdir(parents=True, exist_ok=True)
    torch.save(physics_model.state_dict(), str(glorys_ckpt))

    # 3. SAVE COMPARATIVE METRICS REPORT
    comparison_report = {
        "dataset": "North Indian Ocean (0.25 deg Daily)",
        "train_samples": train_size,
        "val_samples": val_size,
        "epochs": num_epochs,
        "batch_size": batch_size,
        "models": {
            "baseline_cnn": {
                "checkpoint": str(base_ckpt),
                "metrics": metrics_base,
                "history": history_base,
            },
            "physics_constrained_cnn": {
                "checkpoint": str(phys_ckpt),
                "metrics": metrics_phys,
                "history": history_phys,
            },
        },
        "scientific_gain": {
            "rmse_reduction_degC": round(metrics_base["rmse_degC"] - metrics_phys["rmse_degC"], 4),
            "inversion_eliminated_pct": round(metrics_base["inversion_violation_rate_pct"] - metrics_phys["inversion_violation_rate_pct"], 2),
        },
    }

    report_path = out_path / "training_metrics.json"
    with open(report_path, "w") as f:
        json.dump(comparison_report, f, indent=2)

    print("\n=======================================================")
    print("               BENCHMARK COMPARISON SUMMARY            ")
    print("=======================================================")
    print(f" Metric                      | Baseline     | Physics-Constrained")
    print("-------------------------------------------------------")
    print(f" Validation RMSE (deg C)     | {metrics_base['rmse_degC']:<12} | {metrics_phys['rmse_degC']:<12}")
    print(f" Validation MAE (deg C)      | {metrics_base['mae_degC']:<12} | {metrics_phys['mae_degC']:<12}")
    print(f" Inversion Violations (%)    | {metrics_base['inversion_violation_rate_pct']:<11}% | {metrics_phys['inversion_violation_rate_pct']:<11}%")
    print(f" Max Gradient (deg C/m)      | {metrics_base['max_gradient_degC_per_m']:<12} | {metrics_phys['max_gradient_degC_per_m']:<12}")
    print("-------------------------------------------------------")
    print(f" Scientific Gain: Inversion Rate reduced by {comparison_report['scientific_gain']['inversion_eliminated_pct']}%")
    print(f" Report written to: {report_path}")
    print("=======================================================\n", flush=True)

    return comparison_report


if __name__ == "__main__":
    train_oceanembed(num_epochs=15, batch_size=128)
