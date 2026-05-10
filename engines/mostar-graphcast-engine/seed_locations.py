"""Whisper subgraph seed.

Runs three steps against the SAME Neo4j instance that hosts Grid Core and the
Phantom subgraph (logical isolation via the `W_` label prefix):

  1. Apply whisper_schema.cypher  (constraints + indexes)
  2. MERGE the full Africa 0.25° grid as :W_Location nodes (~96,000)
  3. Install the stormscribe APOC reflex trigger (apoc_trigger.cypher)

Idempotent — safe to re-run.

    python -m seed_locations
"""
from __future__ import annotations
import logging
import sys
from pathlib import Path

from neo4j import GraphDatabase

from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE
from grid import iter_grid, location_id, grid_size, infer_region

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper.seed")

SCHEMA_DIR = Path(__file__).parent / "schema"


SEED_LOCATIONS_CYPHER = """
UNWIND $rows AS r
MERGE (l:W_Location { id: r.id })
  ON CREATE SET l.lat     = r.lat,
                l.lon     = r.lon,
                l.lat_idx = r.lat_idx,
                l.lon_idx = r.lon_idx,
                l.region  = r.region,
                l.point   = point({ latitude: r.lat, longitude: r.lon, srid: 4326 })
"""


def _exec_cypher_file(session, path: Path) -> None:
    """Execute every statement in a .cypher file (semicolon-separated)."""
    text = path.read_text()
    for stmt in [s.strip() for s in text.split(";") if s.strip() and not s.strip().startswith("//")]:
        # Skip comment-only fragments after split
        if not stmt or stmt.startswith("//"):
            continue
        log.info("%s …", stmt.splitlines()[0][:80])
        session.run(stmt).consume()


def main() -> int:
    n_lat, n_lon = grid_size()
    total = n_lat * n_lon
    log.info("Whisper grid: %d x %d = %d :W_Location nodes", n_lat, n_lon, total)

    with GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as drv:
        with drv.session(database=NEO4J_DATABASE) as s:

            # 1. Schema
            log.info("Applying whisper_schema.cypher")
            _exec_cypher_file(s, SCHEMA_DIR / "whisper_schema.cypher")

            # 2. Locations — batched MERGE
            batch_size = 5000
            rows = []
            seeded = 0
            for i, j, lat, lon in iter_grid():
                rows.append({
                    "id":      location_id(i, j),
                    "lat":     lat,
                    "lon":     lon,
                    "lat_idx": i,
                    "lon_idx": j,
                    "region":  infer_region(lat, lon),
                })
                if len(rows) >= batch_size:
                    s.run(SEED_LOCATIONS_CYPHER, rows=rows).consume()
                    seeded += len(rows)
                    log.info("Seeded %d / %d", seeded, total)
                    rows = []
            if rows:
                s.run(SEED_LOCATIONS_CYPHER, rows=rows).consume()
                seeded += len(rows)
                log.info("Seeded %d / %d", seeded, total)

            # 3. APOC stormscribe trigger (shared :ViolationFlag)
            try:
                log.info("Installing stormscribe APOC trigger")
                _exec_cypher_file(s, SCHEMA_DIR / "apoc_trigger.cypher")
            except Exception as e:
                log.warning("APOC trigger not installed (%s) — reflex.py covers it", e)

    log.info("Whisper seed complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
