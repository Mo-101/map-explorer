"""One-shot seed: schema + 96k :WeatherLocation nodes + APOC anomaly trigger.

Run once before starting the worker:

    python -m seed.seed_locations
"""
from __future__ import annotations
import logging
import sys

from neo4j import GraphDatabase

from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE, ANOMALY
from engine.grid import iter_grid, location_id, grid_size

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper.seed")


SCHEMA = [
    "CREATE CONSTRAINT loc_id IF NOT EXISTS FOR (l:WeatherLocation) REQUIRE l.id IS UNIQUE",
    "CREATE CONSTRAINT cyc_id IF NOT EXISTS FOR (c:ForecastCycle)   REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT fn_id  IF NOT EXISTS FOR (f:ForecastNode)    REQUIRE f.id IS UNIQUE",
    "CREATE CONSTRAINT an_id  IF NOT EXISTS FOR (a:Anomaly)         REQUIRE a.id IS UNIQUE",
    "CREATE POINT INDEX loc_point IF NOT EXISTS FOR (l:WeatherLocation) ON (l.point)",
    "CREATE INDEX fn_valid_time   IF NOT EXISTS FOR (f:ForecastNode)    ON (f.valid_time)",
    "CREATE INDEX fn_lead         IF NOT EXISTS FOR (f:ForecastNode)    ON (f.lead_hours)",
    "CREATE INDEX fn_cycle        IF NOT EXISTS FOR (f:ForecastNode)    ON (f.cycle_id)",
    "CREATE INDEX fn_flood_risk   IF NOT EXISTS FOR (f:ForecastNode)    ON (f.flood_risk)",
    "CREATE INDEX fn_precip_rate  IF NOT EXISTS FOR (f:ForecastNode)    ON (f.precip_rate)",
    "CREATE INDEX fn_msl          IF NOT EXISTS FOR (f:ForecastNode)    ON (f.msl)",
    "CREATE INDEX fn_wind         IF NOT EXISTS FOR (f:ForecastNode)    ON (f.wind_speed_10m)",
]


SEED_LOCATIONS_CYPHER = """
UNWIND $rows AS r
MERGE (l:WeatherLocation { id: r.id })
  ON CREATE SET l.lat     = r.lat,
                l.lon     = r.lon,
                l.lat_idx = r.lat_idx,
                l.lon_idx = r.lon_idx,
                l.point   = point({ latitude: r.lat, longitude: r.lon, srid: 4326 })
"""


# APOC trigger — fires whenever ForecastNode nodes are created or updated.
# Requires APOC + apoc.trigger.enabled=true in neo4j.conf.
TRIGGER_CYPHER = """
CALL apoc.trigger.install(
  'whisper',
  'phantom_anomaly_reflex',
  "UNWIND [n IN $createdNodes WHERE 'ForecastNode' IN labels(n)] AS f
   WITH f
   WHERE f.msl < $msl_low OR f.precip_rate > $precip_high OR f.wind_speed_10m > $wind_high
   WITH f,
     CASE WHEN f.msl < $msl_low THEN 'low_pressure'
          WHEN f.precip_rate > $precip_high THEN 'heavy_precip'
          ELSE 'high_wind' END AS kind
   MATCH (l:WeatherLocation { id: f.location_id })
   MERGE (a:Anomaly { id: f.id + ':' + kind })
     ON CREATE SET a.kind = kind, a.triggered_at = datetime()
   MERGE (f)-[:TRIGGERED]->(a)
   MERGE (a)-[:AT]->(l)",
  { phase: 'afterAsync', params: { msl_low: $msl_low, precip_high: $precip_high, wind_high: $wind_high } }
)
"""


def main() -> int:
    n_lat, n_lon = grid_size()
    log.info("Grid: %d x %d = %d locations", n_lat, n_lon, n_lat * n_lon)

    rows = [
        {"id": location_id(i, j), "lat_idx": i, "lon_idx": j, "lat": lat, "lon": lon}
        for i, j, lat, lon in iter_grid()
    ]

    with GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as drv:
        with drv.session(database=NEO4J_DATABASE) as s:
            for stmt in SCHEMA:
                log.info(stmt)
                s.run(stmt).consume()

            batch = 5000
            for k in range(0, len(rows), batch):
                s.run(SEED_LOCATIONS_CYPHER, rows=rows[k:k + batch]).consume()
                log.info("Seeded %d / %d", min(k + batch, len(rows)), len(rows))

            try:
                s.run(TRIGGER_CYPHER,
                      msl_low=ANOMALY["msl_low_hpa"] * 100.0,
                      precip_high=ANOMALY["precip_high_mm_h"],
                      wind_high=ANOMALY["wind_high_m_s"]).consume()
                log.info("APOC anomaly trigger installed")
            except Exception as e:
                log.warning("APOC trigger not installed (%s) — reflex pass will cover it", e)

    log.info("Seed complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
