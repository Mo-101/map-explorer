"""GFS GRIB → xarray adapter for GraphCast.

GraphCast expects:
- A regular lat/lon grid at 0.25° resolution
- Surface variables: 2t, 10u, 10v, msl, tp, tcwv
- Pressure-level variables at 37 levels: z, t, q, u, v, w
- Derived time features: year_progress_sin/cos, day_progress_sin/cos
- Two consecutive timesteps (t-6h, t) as input state

This module shapes GFS forecasts into that contract. The full implementation
requires the vendored `graphcast.data_utils` for stats application; this file
covers the GFS-specific pre-processing.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Iterable

import numpy as np
import xarray as xr

from config import BBOX


GFS_TO_GC_SURFACE = {
    "t2m": "2m_temperature",
    "u10": "10m_u_component_of_wind",
    "v10": "10m_v_component_of_wind",
    "msl": "mean_sea_level_pressure",
    "tp":  "total_precipitation_6hr",
    "tcwv": "total_column_water_vapour",
}

GFS_TO_GC_PRESSURE = {
    "z": "geopotential",
    "t": "temperature",
    "q": "specific_humidity",
    "u": "u_component_of_wind",
    "v": "v_component_of_wind",
    "w": "vertical_velocity",
}

PRESSURE_LEVELS = [
    50, 100, 150, 200, 250, 300, 400, 500, 600, 700,
    850, 925, 1000,
]


def _year_progress(t: datetime) -> float:
    start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(t.year + 1, 1, 1, tzinfo=timezone.utc)
    return (t - start).total_seconds() / (end - start).total_seconds()


def _day_progress(t: datetime) -> float:
    return ((t.hour * 3600) + (t.minute * 60) + t.second) / 86400.0


def add_time_features(ds: xr.Dataset) -> xr.Dataset:
    """Add the sin/cos progress features GraphCast expects."""
    times = [datetime.fromisoformat(str(t).replace("Z", "+00:00")) if isinstance(t, str)
             else datetime.utcfromtimestamp(t.astype("datetime64[s]").astype(int))
             for t in ds.time.values]
    yp = np.array([_year_progress(t) for t in times])
    dp = np.array([_day_progress(t) for t in times])
    ds = ds.assign(
        year_progress_sin=("time", np.sin(2 * math.pi * yp)),
        year_progress_cos=("time", np.cos(2 * math.pi * yp)),
        day_progress_sin=("time", np.sin(2 * math.pi * dp)),
        day_progress_cos=("time", np.cos(2 * math.pi * dp)),
    )
    return ds


def clip_to_africa(ds: xr.Dataset) -> xr.Dataset:
    """Slice the global grid to the Africa bbox."""
    return ds.sel(
        latitude=slice(BBOX["lat_max"], BBOX["lat_min"]),  # GFS lat is descending
        longitude=slice(BBOX["lon_min"], BBOX["lon_max"]),
    )


def load_gfs_state(grib_paths: Iterable[str]) -> xr.Dataset:
    """Load t-6h and t GFS analyses + first-step forecast into one Dataset.

    This is a thin wrapper; production should use the existing `ingest-gfs`
    edge function's output (already on disk in Zarr/NetCDF) instead of
    re-downloading GRIB on the worker.
    """
    parts = []
    for p in grib_paths:
        parts.append(xr.open_dataset(p, engine="cfgrib", backend_kwargs={"indexpath": ""}))
    ds = xr.concat(parts, dim="time").sortby("time")
    ds = clip_to_africa(ds)
    ds = ds.rename({k: v for k, v in GFS_TO_GC_SURFACE.items() if k in ds})
    ds = add_time_features(ds)
    return ds


def normalize(ds: xr.Dataset, stats_dir: str) -> xr.Dataset:
    """Apply GraphCast (mean, std, diff_std) normalization.

    Stats are the pickled dicts shipped alongside GraphCast checkpoints
    (`mean_by_level.nc`, `stddev_by_level.nc`, `diffs_stddev_by_level.nc`).
    Implementation deferred to graphcast.data_utils once the checkpoint is
    mounted in the runtime — this stub exists so worker.py can wire the call.
    """
    return ds  # TODO: load stats_dir, subtract mean, divide std
