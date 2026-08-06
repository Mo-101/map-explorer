"""Africa regional grid helpers — W_Location indexing."""
from __future__ import annotations
from typing import Iterator, Tuple
from config import BBOX


def grid_size() -> Tuple[int, int]:
    n_lat = int(round((BBOX["lat_max"] - BBOX["lat_min"]) / BBOX["res"])) + 1
    n_lon = int(round((BBOX["lon_max"] - BBOX["lon_min"]) / BBOX["res"])) + 1
    return n_lat, n_lon


def iter_grid() -> Iterator[Tuple[int, int, float, float]]:
    n_lat, n_lon = grid_size()
    for i in range(n_lat):
        lat = BBOX["lat_min"] + i * BBOX["res"]
        for j in range(n_lon):
            lon = BBOX["lon_min"] + j * BBOX["res"]
            yield i, j, lat, lon


def location_id(lat_idx: int, lon_idx: int) -> str:
    """Stable W_Location id — idempotent MERGE key."""
    return f"w_loc_{lat_idx}_{lon_idx}"


def forecast_node_id(cycle_id: str, lat_idx: int, lon_idx: int, lead_hours: int) -> str:
    return f"{cycle_id}:{lat_idx}:{lon_idx}:{lead_hours:03d}"


def nearest_grid_index(lat: float, lon: float) -> Tuple[int, int]:
    i = int(round((lat - BBOX["lat_min"]) / BBOX["res"]))
    j = int(round((lon - BBOX["lon_min"]) / BBOX["res"]))
    n_lat, n_lon = grid_size()
    return max(0, min(i, n_lat - 1)), max(0, min(j, n_lon - 1))


# Coarse region tagging — useful for stormscribe-003 region filters
# without spinning a separate geocoder. Bounds are approximate.
_REGIONS = [
    ("West Africa",     -5,  25,  -20, 15),
    ("Sahel",            8,  18,  -18, 40),
    ("North Africa",    18,  37,  -18, 35),
    ("Horn of Africa",  -5,  18,   30, 52),
    ("East Africa",    -12,   5,   28, 42),
    ("Central Africa",  -8,  10,    8, 30),
    ("Southern Africa",-35,  -8,   10, 42),
    ("Indian Ocean",   -28,   0,   42, 75),
    ("Atlantic Ocean", -35,  20,  -25, -5),
]


def infer_region(lat: float, lon: float) -> str:
    for name, lat_lo, lat_hi, lon_lo, lon_hi in _REGIONS:
        if lat_lo <= lat <= lat_hi and lon_lo <= lon <= lon_hi:
            return name
    return "Other"
