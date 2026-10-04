import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.adapters import SSTAdapter, SSSAdapter, SSHAdapter, CurrentsAdapter, WindsAdapter

sst = SSTAdapter().read_file("dummy_sst.nc", "2024-05-15")
print(f"[OK] {sst.channel.upper()} Adapter Result: status={sst.status}, shape={sst.data.shape}, coverage={sst.coverage_pct}%")
print(f"     Missing reason: {sst.missing_reason}")

curr_u, curr_v = CurrentsAdapter().read_file("dummy_curr.nc", "2024-05-15")
print(f"[OK] CURRENTS Adapter Result: u={curr_u.status}, v={curr_v.status}")
print(f"     Missing reason: {curr_u.missing_reason}")
