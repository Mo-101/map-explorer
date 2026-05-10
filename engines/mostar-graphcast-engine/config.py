"""Environment-driven configuration for the Whisper Engine."""
import os

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
JOB_QUEUE = os.environ.get("WHISPER_QUEUE", "whisper:jobs")

GRAPHCAST_MODEL_PATH = os.environ.get("GRAPHCAST_MODEL_PATH", "/models/graphcast/params")
GRAPHCAST_STATS_PATH = os.environ.get("GRAPHCAST_STATS_PATH", "/models/graphcast/stats")
MODEL_VERSION = os.environ.get("MODEL_VERSION", "graphcast-operational-0.25deg")

# Africa bounding box at 0.25° native resolution
BBOX = {
    "lat_min": float(os.environ.get("BBOX_LAT_MIN", -40.0)),
    "lat_max": float(os.environ.get("BBOX_LAT_MAX", 40.0)),
    "lon_min": float(os.environ.get("BBOX_LON_MIN", -20.0)),
    "lon_max": float(os.environ.get("BBOX_LON_MAX", 55.0)),
    "res": float(os.environ.get("GRID_RES", 0.25)),
}

# Anomaly thresholds (kept in sync with APOC trigger in seed_locations.py)
ANOMALY = {
    "msl_low_hpa": 1000.0,
    "precip_high_mm_h": 25.0,
    "wind_high_m_s": 25.0,
}

WRITE_BATCH_SIZE = int(os.environ.get("WRITE_BATCH_SIZE", 5000))
