"""Africa regional grid: deterministic indexing and bbox helpers."""
from __future__ import annotations
import math
from typing import Iterator, Tuple
from config import BBOX


def grid_size() -> Tuple[int, int]:
    """Return (n_lat, n_lon) for the configured bbox."""
    n_lat = int(round((BBOX["lat_max"] - BBOX["lat_min"]) / BBOX["res"])) + 1
    n_lon = int(round((BBOX["lon_max"] - BBOX["lon_min"]) / BBOX["res"])) + 1
    return n_lat, n_lon


def iter_grid() -> Iterator[Tuple[int, int, float, float]]:
    """Yield (lat_idx, lon_idx, lat, lon) for every grid point."""
    n_lat, n_lon = grid_size()
    for i in range(n_lat):
        lat = BBOX["lat_min"] + i * BBOX["res"]
        for j in range(n_lon):
            lon = BBOX["lon_min"] + j * BBOX["res"]
            yield i, j, lat, lon


def location_id(lat_idx: int, lon_idx: int) -> str:
    """Stable id used for idempotent MERGE."""
    return f"g_{lat_idx}_{lon_idx}"


def forecast_node_id(cycle_id: str, lat_idx: int, lon_idx: int, lead_hours: int) -> str:
    return f"{cycle_id}:{lat_idx}:{lon_idx}:{lead_hours:03d}"


def nearest_grid_index(lat: float, lon: float) -> Tuple[int, int]:
    i = int(round((lat - BBOX["lat_min"]) / BBOX["res"]))
    j = int(round((lon - BBOX["lon_min"]) / BBOX["res"]))
    n_lat, n_lon = grid_size()
    return max(0, min(i, n_lat - 1)), max(0, min(j, n_lon - 1))
