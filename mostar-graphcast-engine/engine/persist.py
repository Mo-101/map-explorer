"""xarray → Neo4j Whisper Graph writer.

Two-pass batched MERGE:
  Pass 1: ForecastCycle + ForecastNode + HAS_FORECAST + PRODUCED
  Pass 2: NEXT chain per location (ordered by lead_hours)

All writes are idempotent. Re-running a cycle overwrites scalar properties
via `f += r.props`.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Iterable, List, Dict, Any

import numpy as np
import xarray as xr
from neo4j import GraphDatabase, Driver

from config import (
    NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE,
    MODEL_VERSION, WRITE_BATCH_SIZE,
)
from engine.grid import location_id, forecast_node_id, nearest_grid_index

log = logging.getLogger(__name__)


WRITE_FORECAST_CYPHER = """
UNWIND $rows AS r
MATCH  (l:WeatherLocation { id: r.location_id })
MERGE  (c:ForecastCycle   { id: r.cycle_id })
  ON CREATE SET c.base_time      = datetime(r.base_time),
                c.model_version  = r.model_version,
                c.ingested_at    = datetime(),
                c.status         = 'active'
MERGE  (f:ForecastNode    { id: r.fn_id })
  ON CREATE SET f.cycle_id    = r.cycle_id,
                f.location_id = r.location_id,
                f.lead_hours  = r.lead_hours,
                f.valid_time  = datetime(r.valid_time)
SET    f += r.props
MERGE  (l)-[:HAS_FORECAST]->(f)
MERGE  (c)-[:PRODUCED]->(f)
"""

STITCH_NEXT_CYPHER = """
UNWIND $location_ids AS lid
MATCH (l:WeatherLocation { id: lid })-[:HAS_FORECAST]->(f:ForecastNode)
WHERE f.cycle_id = $cycle_id
WITH lid, f
ORDER BY f.lead_hours
WITH lid, collect(f) AS chain
UNWIND range(0, size(chain) - 2) AS i
WITH chain[i] AS a, chain[i + 1] AS b
MERGE (a)-[:NEXT]->(b)
"""


def _driver() -> Driver:
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def _extract_props(ds: xr.Dataset, t_idx: int, i: int, j: int) -> Dict[str, Any]:
    """Pull the scalar properties we persist per ForecastNode."""
    def pick(name: str):
        if name not in ds:
            return None
        v = ds[name].isel(time=t_idx, latitude=i, longitude=j).values
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return float(v)

    u10 = pick("10m_u_component_of_wind") or 0.0
    v10 = pick("10m_v_component_of_wind") or 0.0
    tp = pick("total_precipitation_6hr") or 0.0

    return {
        "t2m":       pick("2m_temperature"),
        "u10":       u10,
        "v10":       v10,
        "msl":       pick("mean_sea_level_pressure"),
        "tp":        tp,
        "tcwv":      pick("total_column_water_vapour"),
        "wind_speed_10m": float(np.sqrt(u10 * u10 + v10 * v10)),
        "precip_rate":    tp / 6.0,  # 6h accumulation → mm/h
        # Risk scores (cheap heuristics; refined by reflex pass)
        "flood_risk": min(1.0, (tp / 50.0)) if tp else 0.0,
        "storm_risk": 0.0,
        "heat_risk":  0.0,
    }


def write_forecast(ds: xr.Dataset, cycle_id: str, base_time: str,
                   lead_hours: List[int]) -> List[str]:
    """Persist the rollout. Returns the list of touched location ids."""
    base_dt = datetime.fromisoformat(base_time.replace("Z", "+00:00"))
    touched: set[str] = set()
    rows: List[Dict[str, Any]] = []

    n_lat = ds.dims["latitude"]
    n_lon = ds.dims["longitude"]

    for t_idx, lead in enumerate(lead_hours):
        valid_dt = base_dt.replace(tzinfo=timezone.utc).timestamp() + lead * 3600
        valid_iso = datetime.utcfromtimestamp(valid_dt).isoformat() + "Z"

        for i in range(n_lat):
            for j in range(n_lon):
                lat = float(ds.latitude.values[i])
                lon = float(ds.longitude.values[j])
                li, lj = nearest_grid_index(lat, lon)
                lid = location_id(li, lj)
                touched.add(lid)
                rows.append({
                    "fn_id":        forecast_node_id(cycle_id, li, lj, lead),
                    "cycle_id":     cycle_id,
                    "location_id":  lid,
                    "lead_hours":   lead,
                    "valid_time":   valid_iso,
                    "base_time":    base_time,
                    "model_version": MODEL_VERSION,
                    "props":        _extract_props(ds, t_idx, i, j),
                })

    log.info("Writing %d forecast nodes for cycle %s", len(rows), cycle_id)
    with _driver() as drv, drv.session(database=NEO4J_DATABASE) as s:
        for batch_start in range(0, len(rows), WRITE_BATCH_SIZE):
            batch = rows[batch_start:batch_start + WRITE_BATCH_SIZE]
            s.run(WRITE_FORECAST_CYPHER, rows=batch).consume()

        # Pass 2: stitch NEXT chains
        s.run(STITCH_NEXT_CYPHER,
              location_ids=list(touched),
              cycle_id=cycle_id).consume()

    return list(touched)
