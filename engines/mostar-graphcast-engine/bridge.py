"""xarray → Whisper subgraph bridge.

Writes :W_ForecastCycle and :W_ForecastNode nodes into the same Neo4j instance
that hosts Grid Core + Phantom subgraph. Every W_ForecastCycle is anchored to
the shared :SovereignCoreLedger node, mirroring the GridTag registration
pattern.

The APOC trigger installed by seed_locations.py raises shared :ViolationFlag
nodes; reflex.py provides a fallback scan for instances without APOC.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any

import numpy as np
import xarray as xr
from neo4j import GraphDatabase, Driver

from config import (
    NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE,
    MODEL_VERSION, WRITE_BATCH_SIZE,
)
from grid import location_id, forecast_node_id, nearest_grid_index

log = logging.getLogger(__name__)


# Anchor the cycle to SovereignCoreLedger (assumed to exist with id 'core').
# If the ledger node doesn't exist yet we MERGE it as a no-op anchor.
ANCHOR_CYCLE_CYPHER = """
MERGE (ledger:SovereignCoreLedger { id: 'core' })
MERGE (c:W_ForecastCycle { id: $cycle_id })
  ON CREATE SET c.base_time      = datetime($base_time),
                c.model_version  = $model_version,
                c.source         = $source,
                c.resolution_deg = $resolution_deg,
                c.step_hours     = $step_hours,
                c.ingested_at    = datetime(),
                c.status         = 'active'
MERGE (c)-[:ANCHORED_TO]->(ledger)
"""


WRITE_FORECAST_CYPHER = """
UNWIND $rows AS r
MATCH  (l:W_Location { id: r.location_id })
MATCH  (c:W_ForecastCycle { id: r.cycle_id })
MERGE  (f:W_ForecastNode  { id: r.fn_id })
  ON CREATE SET f.cycle_id    = r.cycle_id,
                f.location_id = r.location_id,
                f.lead_hours  = r.lead_hours,
                f.valid_time  = datetime(r.valid_time)
SET    f += r.props
MERGE  (l)-[:HAS_FORECAST]->(f)
MERGE  (c)-[:CONTAINS]->(f)
"""


STITCH_NEXT_CYPHER = """
UNWIND $location_ids AS lid
MATCH (l:W_Location { id: lid })-[:HAS_FORECAST]->(f:W_ForecastNode)
WHERE f.cycle_id = $cycle_id
WITH lid, f ORDER BY f.lead_hours
WITH lid, collect(f) AS chain
UNWIND range(0, size(chain) - 2) AS i
WITH chain[i] AS a, chain[i + 1] AS b
MERGE (a)-[:NEXT]->(b)
"""


def _driver() -> Driver:
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def _extract_props(ds: xr.Dataset, t_idx: int, i: int, j: int) -> Dict[str, Any]:
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
        "precip_rate":    tp / 6.0,
        "flood_risk":     min(1.0, tp / 50.0) if tp else 0.0,
        "storm_risk":     0.0,
        "heat_risk":      0.0,
    }


def anchor_cycle(cycle_id: str, base_time: str, source: str = "gfs",
                 resolution_deg: float = 0.25, step_hours: int = 6) -> None:
    with _driver() as drv, drv.session(database=NEO4J_DATABASE) as s:
        s.run(ANCHOR_CYCLE_CYPHER,
              cycle_id=cycle_id,
              base_time=base_time,
              model_version=MODEL_VERSION,
              source=source,
              resolution_deg=resolution_deg,
              step_hours=step_hours).consume()
    log.info("Anchored W_ForecastCycle %s to SovereignCoreLedger", cycle_id)


def write_forecast(ds: xr.Dataset, cycle_id: str, base_time: str,
                   lead_hours: List[int], source: str = "gfs") -> List[str]:
    """Persist a rollout. Returns the touched W_Location ids."""
    anchor_cycle(cycle_id, base_time, source=source)

    base_dt = datetime.fromisoformat(base_time.replace("Z", "+00:00"))
    touched: set[str] = set()
    rows: List[Dict[str, Any]] = []

    n_lat = ds.dims["latitude"]
    n_lon = ds.dims["longitude"]

    for t_idx, lead in enumerate(lead_hours):
        valid_ts = base_dt.replace(tzinfo=timezone.utc).timestamp() + lead * 3600
        valid_iso = datetime.utcfromtimestamp(valid_ts).isoformat() + "Z"

        for i in range(n_lat):
            for j in range(n_lon):
                lat = float(ds.latitude.values[i])
                lon = float(ds.longitude.values[j])
                li, lj = nearest_grid_index(lat, lon)
                lid = location_id(li, lj)
                touched.add(lid)
                rows.append({
                    "fn_id":       forecast_node_id(cycle_id, li, lj, lead),
                    "cycle_id":    cycle_id,
                    "location_id": lid,
                    "lead_hours":  lead,
                    "valid_time":  valid_iso,
                    "props":       _extract_props(ds, t_idx, i, j),
                })

    log.info("Bridging %d W_ForecastNode rows for %s", len(rows), cycle_id)
    with _driver() as drv, drv.session(database=NEO4J_DATABASE) as s:
        for k in range(0, len(rows), WRITE_BATCH_SIZE):
            s.run(WRITE_FORECAST_CYPHER, rows=rows[k:k + WRITE_BATCH_SIZE]).consume()
        s.run(STITCH_NEXT_CYPHER,
              location_ids=list(touched),
              cycle_id=cycle_id).consume()

    return list(touched)
