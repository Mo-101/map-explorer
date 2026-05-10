"""Post-write anomaly verification.

The APOC trigger installed by `seed_locations.py` fires on ForecastNode
creation. This reflex pass exists for installs without APOC, and as a
defence-in-depth check.
"""
from __future__ import annotations
import logging
from typing import List

from neo4j import GraphDatabase

from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE, ANOMALY

log = logging.getLogger(__name__)


ANOMALY_SCAN_CYPHER = """
MATCH (f:ForecastNode { cycle_id: $cycle_id })-[:HAS_FORECAST*0..1]-(l:WeatherLocation)
WHERE f.msl              < $msl_low
   OR f.precip_rate      > $precip_high
   OR f.wind_speed_10m   > $wind_high
WITH f, l,
     CASE WHEN f.msl < $msl_low            THEN 'low_pressure'
          WHEN f.precip_rate > $precip_high THEN 'heavy_precip'
          ELSE                                   'high_wind' END AS kind,
     CASE WHEN f.msl < $msl_low            THEN ($msl_low  - f.msl)        / $msl_low
          WHEN f.precip_rate > $precip_high THEN (f.precip_rate - $precip_high) / $precip_high
          ELSE                                   (f.wind_speed_10m - $wind_high) / $wind_high END AS severity
MERGE (a:Anomaly { id: f.id + ':' + kind })
  ON CREATE SET a.kind         = kind,
                a.severity     = severity,
                a.threshold    = CASE kind WHEN 'low_pressure' THEN $msl_low
                                           WHEN 'heavy_precip' THEN $precip_high
                                           ELSE $wind_high END,
                a.triggered_at = datetime()
MERGE (f)-[:TRIGGERED]->(a)
MERGE (a)-[:AT]->(l)
RETURN count(a) AS anomalies
"""


def scan_cycle(cycle_id: str) -> int:
    with GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as drv:
        with drv.session(database=NEO4J_DATABASE) as s:
            rec = s.run(ANOMALY_SCAN_CYPHER,
                        cycle_id=cycle_id,
                        msl_low=ANOMALY["msl_low_hpa"] * 100.0,  # Pa
                        precip_high=ANOMALY["precip_high_mm_h"],
                        wind_high=ANOMALY["wind_high_m_s"]).single()
            n = rec["anomalies"] if rec else 0
            log.info("Reflex pass: %d anomalies for cycle %s", n, cycle_id)
            return n
