"""Fallback anomaly scan for instances without APOC.

Mirrors apoc_trigger.cypher exactly so behaviour is identical whether the
trigger fires server-side or the worker does the post-write pass.
Writes the SHARED :ViolationFlag (Grid Core namespace, not W_-prefixed).
"""
from __future__ import annotations
import logging

from neo4j import GraphDatabase

from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE, ANOMALY

log = logging.getLogger(__name__)


ANOMALY_SCAN_CYPHER = """
MATCH (f:W_ForecastNode { cycle_id: $cycle_id })
WHERE f.msl              < $msl_low
   OR f.precip_rate      > $precip_high
   OR f.wind_speed_10m   > $wind_high
WITH f,
     CASE WHEN f.msl < $msl_low            THEN 'low_pressure'
          WHEN f.precip_rate > $precip_high THEN 'heavy_precip'
          ELSE                                   'high_wind' END AS kind,
     CASE WHEN f.msl < $msl_low            THEN ($msl_low - f.msl) / $msl_low
          WHEN f.precip_rate > $precip_high THEN (f.precip_rate - $precip_high) / $precip_high
          ELSE                                   (f.wind_speed_10m - $wind_high) / $wind_high END AS severity
MATCH (l:W_Location { id: f.location_id })
MERGE (v:ViolationFlag { id: 'whisper:' + f.id + ':' + kind })
  ON CREATE SET v.source       = 'whisper',
                v.kind         = kind,
                v.severity     = severity,
                v.subgraph     = 'W_',
                v.cycle_id     = f.cycle_id,
                v.lead_hours   = f.lead_hours,
                v.valid_time   = f.valid_time,
                v.lat          = l.lat,
                v.lon          = l.lon,
                v.triggered_at = datetime(),
                v.status       = 'open'
MERGE (f)-[:VIOLATES_THRESHOLD]->(v)
MERGE (v)-[:AT]->(l)
RETURN count(v) AS flags
"""


def scan_cycle(cycle_id: str) -> int:
    with GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as drv:
        with drv.session(database=NEO4J_DATABASE) as s:
            rec = s.run(ANOMALY_SCAN_CYPHER,
                        cycle_id=cycle_id,
                        msl_low=ANOMALY["msl_low_hpa"] * 100.0,  # Pa
                        precip_high=ANOMALY["precip_high_mm_h"],
                        wind_high=ANOMALY["wind_high_m_s"]).single()
            n = rec["flags"] if rec else 0
            log.info("Reflex pass: %d :ViolationFlag raised for %s", n, cycle_id)
            return n
