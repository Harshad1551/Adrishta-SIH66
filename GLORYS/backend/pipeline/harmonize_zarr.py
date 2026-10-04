"""
Consistent Zarr Harmonization & Canonical Storage Engine (Phase 1 & 2)
Unifies data ingestion, QC, storage schema, model training, and inference.
"""

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json
import numpy as np
import zarr

from pipeline.grid_spec import (
    GRID_LATS,
    GRID_LONS,
    NUM_LATS,
    NUM_LONS,
    GRID_SHAPE,
    CHANNELS,
    CHANNEL_SPECS,
    QC_FLAG_GOOD,
    QC_FLAG_DEGRADED,
    QC_FLAG_OUT_OF_BOUNDS,
    QC_FLAG_MISSING,
)
from pipeline.adapters import (
    SSTAdapter,
    SSSAdapter,
    SSHAdapter,
    CurrentsAdapter,
    WindsAdapter,
    AdapterResult,
)


class SurfaceHarmonizer:
    def __init__(self, output_dir: str = "data/zarr"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sst_adapter = SSTAdapter()
        self.sss_adapter = SSSAdapter()
        self.ssh_adapter = SSHAdapter()
        self.currents_adapter = CurrentsAdapter()
        self.winds_adapter = WindsAdapter()

    def harmonize_date(
        self,
        date_str: str,
        input_files: Optional[Dict[str, str]] = None,
    ) -> Path:
        """
        Harmonizes all 7 surface channels onto the authoritative 0.25 deg NIO mesh
        and exports to canonical Zarr storage.
        """
        input_files = input_files or {}
        results: Dict[str, AdapterResult] = {}

        # 1. Ingest SST
        sst_path = input_files.get("sst", f"data/raw/{date_str}/sst.nc")
        results["sst"] = self.sst_adapter.read_file(sst_path, date_str)

        # 2. Ingest SSS
        sss_path = input_files.get("sss", f"data/raw/{date_str}/sss.nc")
        results["sss"] = self.sss_adapter.read_file(sss_path, date_str)

        # 3. Ingest SSH
        ssh_path = input_files.get("ssh", f"data/raw/{date_str}/ssh.nc")
        results["ssh"] = self.ssh_adapter.read_file(ssh_path, date_str)

        # 4. Ingest Currents (U, V)
        curr_path = input_files.get("currents", f"data/raw/{date_str}/currents.nc")
        u_curr, v_curr = self.currents_adapter.read_file(curr_path, date_str)
        results["current_u"] = u_curr
        results["current_v"] = v_curr

        # 5. Ingest Winds (U, V)
        wind_path = input_files.get("winds", f"data/raw/{date_str}/winds.nc")
        u_wind, v_wind = self.winds_adapter.read_file(wind_path, date_str)
        results["wind_u"] = u_wind
        results["wind_v"] = v_wind

        # 6. Assess Data Mode and Missing Channels
        missing_channels = [ch for ch, res in results.items() if res.status == "MISSING"]
        degraded_channels = [ch for ch, res in results.items() if res.status == "DEGRADED"]

        if len(missing_channels) == 0:
            overall_status = "REAL_AVAILABLE" if len(degraded_channels) == 0 else "REAL_DEGRADED"
        else:
            overall_status = "REAL_PARTIAL_MISSING"

        # 7. Write to Canonical Zarr Store
        out_zarr = self.output_dir / f"surface_harmonized_{date_str}.zarr"
        root = zarr.open_group(str(out_zarr), mode="w")

        # Global Metadata
        root.attrs["domain"] = "North Indian Ocean 5N-30N, 45E-105E"
        root.attrs["resolution_deg"] = 0.25
        root.attrs["channels"] = CHANNELS
        root.attrs["date"] = date_str
        root.attrs["created_at"] = datetime.utcnow().isoformat() + "Z"
        root.attrs["overall_status"] = overall_status
        root.attrs["missing_channels"] = missing_channels
        root.attrs["degraded_channels"] = degraded_channels

        coverages = {ch: res.coverage_pct for ch, res in results.items()}
        root.attrs["channel_coverages"] = coverages

        # Coordinates
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        epoch_sec = int(dt.timestamp())
        root.create_dataset("time", data=np.array([epoch_sec], dtype=np.int64))
        root.create_dataset("lat", data=GRID_LATS)
        root.create_dataset("lon", data=GRID_LONS)

        # 7 Channel Arrays [101, 241]
        for ch in CHANNELS:
            res = results[ch]
            ds = root.create_dataset(ch, data=res.data)
            ds.attrs["units"] = res.units
            ds.attrs["source"] = res.source
            ds.attrs["status"] = res.status
            ds.attrs["coverage_pct"] = res.coverage_pct
            if res.missing_reason:
                ds.attrs["missing_reason"] = res.missing_reason

        # Stacked QC Flags Array [7, 101, 241]
        qc_stack = np.stack([results[ch].qc_mask for ch in CHANNELS], axis=0)
        root.create_dataset("qc_flags", data=qc_stack)

        print(f"[OK] Exported canonical Zarr: {out_zarr} (Status: {overall_status})")
        return out_zarr


def read_canonical_surface_zarr(
    zarr_path: str,
) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """
    Authoritative reader for harmonized Zarr files.
    Used identically by Model Training and Inference.
    :return: (
        surface_tensor [7, 101, 241] float32,
        qc_tensor [7, 101, 241] uint8,
        metadata dict
    )
    """
    root = zarr.open_group(zarr_path, mode="r")
    channels_list = root.attrs.get("channels", CHANNELS)

    data_arrays = []
    for ch in channels_list:
        data_arrays.append(np.array(root[ch], dtype=np.float32))

    surface_tensor = np.stack(data_arrays, axis=0)
    qc_tensor = np.array(root["qc_flags"], dtype=np.uint8)

    meta = {
        "date": root.attrs.get("date"),
        "status": root.attrs.get("overall_status"),
        "missing_channels": root.attrs.get("missing_channels", []),
        "coverages": root.attrs.get("channel_coverages", {}),
    }

    return surface_tensor, qc_tensor, meta
