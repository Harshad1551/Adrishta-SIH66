"""
Physics-Informed Ocean Loss Functions (Phase 6)
Implements: L_total = L_data + lambda * L_physics

Terms:
1. L_data: Supervised Mean Squared Error (MSE) / Smooth L1 loss vs. GLORYS target.
2. L_mono: Hydrostatic thermal stratification constraint (penalizes dT/dz > 0 below mixed layer).
3. L_lapse: Bounded vertical lapse rate constraint (prevents extreme non-physical temperature shears).
4. L_deep: Abyssal water asymptotic boundary constraint at 1000 m.
"""

from typing import Dict, Tuple
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.pipeline.grid_spec import STANDARD_DEPTHS, NUM_DEPTHS


class OceanPhysicsLoss(nn.Module):
    def __init__(
        self,
        lambda_mono: float = 0.25,
        lambda_lapse: float = 0.10,
        lambda_deep: float = 0.05,
        max_lapse_rate_c_per_m: float = 0.25,
        abyssal_target_c: float = 4.20,
    ):
        super().__init__()
        self.lambda_mono = lambda_mono
        self.lambda_lapse = lambda_lapse
        self.lambda_deep = lambda_deep
        self.max_lapse = max_lapse_rate_c_per_m
        self.abyssal_target = abyssal_target_c

        depths = torch.tensor(STANDARD_DEPTHS, dtype=torch.float32)
        dz = depths[1:] - depths[:-1]
        self.register_buffer("dz", dz)

    def forward(
        self,
        y_pred: torch.Tensor,
        y_target: torch.Tensor,
    ) -> Tuple[torch.Tensor, Dict[str, float]]:
        loss_data = F.mse_loss(y_pred, y_target)

        if self.lambda_mono == 0 and self.lambda_lapse == 0:
            return loss_data, {
                "loss_total": round(loss_data.item(), 5),
                "loss_data": round(loss_data.item(), 5),
                "loss_mono": 0.0,
                "loss_lapse": 0.0,
                "loss_deep": 0.0,
            }

        subsurface_pred = y_pred[:, 4:]
        diff_downward = subsurface_pred[:, 1:] - subsurface_pred[:, :-1]
        loss_mono = torch.mean(F.relu(diff_downward) ** 2)

        all_diff = torch.abs(y_pred[:, 1:] - y_pred[:, :-1])
        gradients = all_diff / self.dz.unsqueeze(0)
        loss_lapse = torch.mean(F.relu(gradients - self.max_lapse) ** 2)

        deep_pred = y_pred[:, -1]
        loss_deep = torch.mean((deep_pred - self.abyssal_target) ** 2)

        loss_physics = (
            self.lambda_mono * loss_mono
            + self.lambda_lapse * loss_lapse
            + self.lambda_deep * loss_deep
        )
        loss_total = loss_data + loss_physics

        metrics = {
            "loss_total": round(loss_total.item(), 5),
            "loss_data": round(loss_data.item(), 5),
            "loss_mono": round(loss_mono.item(), 5),
            "loss_lapse": round(loss_lapse.item(), 5),
            "loss_deep": round(loss_deep.item(), 5),
        }

        return loss_total, metrics
