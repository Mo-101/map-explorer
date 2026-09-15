import sys
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
import json
import os
import time
import logging

import httpx
import psycopg2
from psycopg2 import pool as psycopg2_pool
from dotenv import load_dotenv
import asyncio
from contextlib import asynccontextmanager, contextmanager
from threading import Lock

# Avoid UnicodeEncodeError on Windows consoles when MoScripts log emoji/unicode.
for _stream in (getattr(sys, "stdout", None), getattr(sys, "stderr", None)):
    try:
        if _stream and hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logger = logging.getLogger(__name__)

# Import weather anomaly detection
try:
    from weather_anomaly_detection import WeatherAnomalyDetector
except ImportError as e:
    print(f"Weather anomaly detection module not available: {e}")
    WeatherAnomalyDetector = None

# Import MoScripts intelligence modules
try:
    from moscripts.mo_graphcast_detector import detect_weather_anomalies
    from moscripts.mo_mostar_ai import analyze_with_mostar
    MOSCRIPTS_AVAILABLE = True
    print("🔥 MoScripts backend modules loaded successfully")
except ImportError as e:
    print(f"MoScripts not available: {e}")
    MOSCRIPTS_AVAILABLE = False

# Load env for local dev only; Azure App Service should provide env vars via App Settings.
if os.getenv("WEBSITE_SITE_NAME") is None:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

# Global background task for GraphCast ingestion
_graphcast_task: Optional[asyncio.Task] = None

# In-memory persistence for "confirmed" detections.
# Keyed by a stable geo-key so detections don't disappear due to ID churn.
_threat_persistence: Dict[str, Dict[str, Any]] = {}


def _load_detections_config() -> Dict[str, Any]:
    """
    Load realtime detections config from JSON.
    No YAML dependency on purpose (keep deployment light).
    """
    cfg_path = os.getenv("DETECTIONS_CONFIG_PATH") or os.path.join(os.path.dirname(__file__), "detections_config.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}

    gating = cfg.get("gating") or {}
    thresholds = cfg.get("thresholds") or {}

    def _env_float(name: str, default: float) -> float:
        raw = os.getenv(name)
        try:
            return float(raw) if raw is not None and str(raw).strip() != "" else default
        except Exception:
            return default

    def _env_int(name: str, default: int) -> int:
        raw = os.getenv(name)
        try:
            return int(raw) if raw is not None and str(raw).strip() != "" else default
        except Exception:
            return default

    # Env overrides let you sharpen/relax without code changes.
    gating["confidence_candidate_min"] = _env_float("DETECTIONS_CONFIDENCE_CANDIDATE_MIN", float(gating.get("confidence_candidate_min", 0.5)))
    gating["confidence_confirmed_min"] = _env_float("DETECTIONS_CONFIDENCE_CONFIRMED_MIN", float(gating.get("confidence_confirmed_min", 0.7)))
    gating["persistence_steps"] = _env_int("DETECTIONS_PERSISTENCE_STEPS", int(gating.get("persistence_steps", 2)))
    gating["persistence_window_seconds"] = _env_int("DETECTIONS_PERSISTENCE_WINDOW_SECONDS", int(gating.get("persistence_window_seconds", 21600)))

    cfg["gating"] = gating
    cfg["thresholds"] = thresholds
    return cfg


def _as_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        if isinstance(v, bool):
            return None
        return float(v)
    except Exception:
        return None


def _wind_kmh_to_kt(kmh: float) -> float:
    return kmh / 1.852


def _stable_geo_key(threat_type: str, lat: float, lng: float) -> str:
    return f"{threat_type}:{round(lat, 2)}:{round(lng, 2)}"


def _normalize_to_threats(anomalies: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert the mixed anomaly payload (cyclones/floods/...) into a single list of Threat-like dicts.
    """
    out: List[Dict[str, Any]] = []

    def push(kind: str, items: Any):
        if not isinstance(items, list):
            return
        for item in items:
            if not isinstance(item, dict):
                continue

            t_type = str(item.get("threat_type") or item.get("type") or item.get("disaster_type") or kind)
            lat = _as_float(item.get("center_lat") or item.get("latitude") or item.get("lat"))
            lng = _as_float(item.get("center_lng") or item.get("center_lon") or item.get("longitude") or item.get("lng") or item.get("lon"))
            if lat is None or lng is None:
                continue

            # Prefer an explicit confidence; fall back to detection_confidence if present.
            conf = _as_float(item.get("confidence"))
            if conf is None:
                conf = _as_float(item.get("detection_confidence"))

            # Normalize cyclone wind to knots when possible.
            wind_kt = _as_float(item.get("max_wind_kt"))
            if wind_kt is None:
                wind_kmh = _as_float(item.get("max_wind_speed"))
                if wind_kmh is not None:
                    wind_kt = _wind_kmh_to_kt(wind_kmh)

            risk_score = _as_float(item.get("risk_score"))
            risk_multiplier = _as_float(item.get("risk_multiplier"))

            geo_key = _stable_geo_key(t_type, lat, lng)
            threat_id = str(item.get("id") or geo_key)

            out.append(
                {
                    "id": threat_id,
                    "threat_type": t_type,
                    "center_lat": lat,
                    "center_lng": lng,
                    "confidence": conf,
                    "severity": item.get("severity"),
                    "timestamp": item.get("timestamp") or item.get("created_at") or anomalies.get("timestamp"),
                    "lead_time_hours": item.get("lead_time_hours"),
                    "max_wind_kt": wind_kt,
                    "risk_score": risk_score,
                    "risk_multiplier": risk_multiplier,
                    "detection_details": item.get("detection_details") or item,
                    "_geo_key": geo_key,
                }
            )

    push("cyclone", anomalies.get("cyclones"))
    push("flood", anomalies.get("floods"))
    push("landslide", anomalies.get("landslides"))
    push("convergence", anomalies.get("convergences"))

    return out


def _is_confirmed(threat: Dict[str, Any], cfg: Dict[str, Any]) -> bool:
    gating = cfg.get("gating") or {}
    thresholds = cfg.get("thresholds") or {}

    conf_min = float(gating.get("confidence_confirmed_min", 0.7))
    conf = _as_float(threat.get("confidence"))
    if conf is not None and conf < conf_min:
        return False

    t = str(threat.get("threat_type") or "").lower()
    if t == "cyclone":
        wind_kt = _as_float(threat.get("max_wind_kt")) or 0.0
        min_wind = float((thresholds.get("cyclone") or {}).get("confirmed_min_wind_kt", 34))
        return wind_kt >= min_wind

    if t == "flood":
        rs = _as_float(threat.get("risk_score"))
        if rs is None:
            # If a backend doesn't compute risk_score, accept based on confidence alone.
            return True
        return rs >= float((thresholds.get("flood") or {}).get("confirmed_min_risk_score", 0.7))

    if t == "landslide":
        rs = _as_float(threat.get("risk_score"))
        if rs is None:
            return True
        return rs >= float((thresholds.get("landslide") or {}).get("confirmed_min_risk_score", 0.7))

    if t == "convergence":
        rm = _as_float(threat.get("risk_multiplier"))
        if rm is None:
            return True
        return rm >= float((thresholds.get("convergence") or {}).get("confirmed_min_risk_multiplier", 1.5))

    # Unknown types are not confirmed by default.
    return False


def _apply_persistence(threats: List[Dict[str, Any]], cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    gating = cfg.get("gating") or {}
    steps_required = int(gating.get("persistence_steps", 2))
    window_s = int(gating.get("persistence_window_seconds", 21600))
    now = time.time()

    # prune stale entries
    stale_cutoff = now - window_s
    for k in list(_threat_persistence.keys()):
        if float(_threat_persistence[k].get("last_seen", 0)) < stale_cutoff:
            _threat_persistence.pop(k, None)

    confirmed: List[Dict[str, Any]] = []
    for th in threats:
        geo_key = str(th.get("_geo_key") or _stable_geo_key(str(th.get("threat_type")), float(th.get("center_lat")), float(th.get("center_lng"))))
        state = _threat_persistence.get(geo_key)

        if state is None or float(state.get("last_seen", 0)) < stale_cutoff:
            state = {"count": 0, "last_seen": now}

        state["count"] = int(state.get("count", 0)) + 1
        state["last_seen"] = now
        _threat_persistence[geo_key] = state

        if steps_required <= 1 or state["count"] >= steps_required:
            confirmed.append({k: v for k, v in th.items() if k != "_geo_key"})

    return confirmed

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan including background tasks."""
    # Startup
    global _graphcast_task
    if os.getenv("GRAPHCAST_INGESTION_ENABLED", "").lower() in {"1", "true", "yes"}:
        try:
            from .graphcast_ingestion import start_graphcast_ingestion
            _initialize_pool()
            if pool is None:
                _log_db_unavailable("graphcast_ingestion_startup")
            else:
                _graphcast_task = asyncio.create_task(start_graphcast_ingestion(pool))
                print("GraphCast ingestion started")
        except Exception as e:
            print(f"Failed to start GraphCast ingestion: {e}")
    
    yield
    
    # Shutdown
    if _graphcast_task:
        _graphcast_task.cancel()
        try:
            await _graphcast_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="AfriGuard Model Service", lifespan=lifespan)

# Allow local dev clients (Next/Vite) to call this service without CORS issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _seed_data_enabled() -> bool:
    v = (os.getenv("ENABLE_SEED_DATA") or "false").strip().lower()
    return v in {"1", "true", "yes", "on"}


def _init_db_schema_and_seed():
    if not _seed_data_enabled():
        return
    if not pool:
        return

    pool.open()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS hazard_alerts (
                  id BIGSERIAL PRIMARY KEY,
                  external_id TEXT,
                  source TEXT NOT NULL DEFAULT 'manual',
                  type TEXT NOT NULL,
                  severity TEXT,
                  title TEXT,
                  description TEXT,
                  lat DOUBLE PRECISION,
                  lng DOUBLE PRECISION,
                  event_at TIMESTAMPTZ,
                  intensity DOUBLE PRECISION,
                  metadata JSONB,
                  data_source_run_id TEXT,
                  forecast_hour INTEGER,
                  source_artifact JSONB,
                  is_active BOOLEAN NOT NULL DEFAULT TRUE,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  UNIQUE (source, external_id)
                );
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_hazard_alerts_active ON hazard_alerts (is_active);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_hazard_alerts_event_at ON hazard_alerts (event_at DESC);")

            # Create forecast_runs table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS forecast_runs (
                  run_id TEXT PRIMARY KEY,
                  source TEXT NOT NULL,
                  model_name TEXT NOT NULL,
                  version TEXT,
                  status TEXT NOT NULL DEFAULT 'pending',
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  completed_at TIMESTAMPTZ,
                  metadata JSONB
                );
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_forecast_runs_source ON forecast_runs (source);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_forecast_runs_created_at ON forecast_runs (created_at DESC);")

            # Create forecast_fields table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS forecast_fields (
                  id BIGSERIAL PRIMARY KEY,
                  run_id TEXT NOT NULL REFERENCES forecast_runs(run_id) ON DELETE CASCADE,
                  field_name TEXT NOT NULL,
                  variable TEXT NOT NULL,
                  units TEXT,
                  storage_type TEXT NOT NULL DEFAULT 'uri',
                  storage_uri TEXT,
                  storage_geojson JSONB,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  metadata JSONB
                );
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_forecast_fields_run_id ON forecast_fields (run_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_forecast_fields_variable ON forecast_fields (variable);")

            cur.execute("SELECT COUNT(*) FROM hazard_alerts WHERE is_active = TRUE;")
            active_count = int(cur.fetchone()[0] or 0)

            if active_count == 0:
                cur.execute(
                    """
                    INSERT INTO hazard_alerts (
                      external_id, source, type, severity, title, description,
                      lat, lng, event_at, intensity, metadata, is_active
                    ) VALUES
                      (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s::jsonb, TRUE),
                      (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s::jsonb, TRUE)
                    ON CONFLICT (source, external_id) DO UPDATE
                    SET updated_at = NOW(), is_active = TRUE;
                    """,
                    (
                        "seed-cyclone-001",
                        "seed",
                        "cyclone",
                        "high",
                        "Seed Cyclone",
                        "Test cyclone for map rendering",
                        -18.6,
                        45.1,
                        80,
                        json.dumps({"confidence": 0.8, "lead_time_days": 2, "wind_speed": 95, "min_pressure_hpa": 975}),
                        "seed-cholera-001",
                        "seed",
                        "cholera",
                        "moderate",
                        "Seed Cholera",
                        "Test outbreak for convergence testing",
                        -18.9,
                        47.5,
                        None,
                        json.dumps({"confidence": 0.7, "lead_time_days": 1, "cases": 156, "deaths": 22}),
                    ),
                )


class InferenceRequest(BaseModel):
    region: str
    fields: List[str]
    timestamp: Optional[str] = None


class AiAnalyzeRequest(BaseModel):
    prompt: str
    context: Optional[str] = None


class ClaudeAnalyzeRequest(BaseModel):
    prompt: str
    model: Optional[str] = None


_pushed_threats_cache: dict | None = None


def _require_ingest_key(request: Request):
    expected = os.getenv("AFRO_STORM_API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="AFRO_STORM_API_KEY is not configured")
    key = request.headers.get("X-API-Key")
    if key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _canonical_threat_type(raw_type: str | None) -> str:
    if not raw_type:
        return "unknown"

    v = raw_type.strip().lower()
    taxonomy = {
        "cyclone": {"cyclone", "tropical_cyclone", "tc", "tropical storm", "hurricane", "typhoon", "tropical_depression"},
        "flood": {"flood", "flooding", "flash_flood", "river_flood"},
        "drought": {"drought", "dry_spell", "water_scarcity"},
        "cholera": {"cholera", "awd"},
        "lassa": {"lassa", "lassa_fever", "lassa fever", "lf"},
        "meningitis": {"meningitis", "meningococcal", "cerebro-spinal meningitis"},
        "malaria": {"malaria"},
        "ebola": {"ebola", "evd", "ebola virus disease"},
        "measles": {"measles", "rubeola"},
        "convergence": {"convergence"},
    }

    for canonical, aliases in taxonomy.items():
        if v in aliases:
            return canonical
    return v


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)

    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


def _get_database_url() -> str:
    candidates = [
        os.getenv("NEON_DATABASE_URL"),
        os.getenv("VITE_NEON_DATABASE_URL"),
        os.getenv("DATABASE_URL"),
        os.getenv("PGDATABASE_URL"),
        os.getenv("PGDATABASE"),
        os.getenv("VITE_PGDATABASE_URL"),
    ]
    for url in candidates:
        if url:
            return url
    raise RuntimeError("DATABASE_URL/PGDATABASE_URL is not configured")


def _db_host_from_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        return parsed.hostname
    except Exception:
        return None


# Minimal connection pool; keeps queries warm and avoids reconnect storms
class _Psycopg2PoolAdapter:
    """Compatibility wrapper for modules expecting psycopg_pool-style APIs."""

    def __init__(self, conn_pool: psycopg2_pool.SimpleConnectionPool):
        self._conn_pool = conn_pool

    def open(self) -> None:
        # psycopg2 pools are eagerly available once instantiated.
        return

    @contextmanager
    def connection(self, *args, **kwargs):
        conn = self._conn_pool.getconn()
        try:
            yield conn
        finally:
            self._conn_pool.putconn(conn)


_pool = None
pool = None
pool_error = None
_pool_lock = Lock()


def _initialize_pool() -> None:
    global _pool, pool, pool_error
    if _pool is not None:
        return

    with _pool_lock:
        if _pool is not None:
            return

        try:
            _connect_timeout = int(os.getenv("DB_CONNECT_TIMEOUT_SEC") or 8)
            db_url = _get_database_url()
            _pool = psycopg2_pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=db_url,
                connect_timeout=_connect_timeout,
            )
            pool = _Psycopg2PoolAdapter(_pool)
            pool_error = None
            logger.info("Database connection pool initialized to %s", _db_host_from_url(db_url))
        except Exception as exc:
            _pool = None
            pool = None
            pool_error = str(exc)
            logger.exception("Failed to initialize database pool")


def _log_db_unavailable(context: str) -> None:
    if pool_error:
        logger.error("Database unavailable during %s: %s", context, pool_error)
    else:
        logger.error("Database unavailable during %s", context)


@app.get("/health")
def health():
    _initialize_pool()
    status = "healthy"
    db_state = "connected"
    threats_count = 0

    if not pool:
        status = "degraded"
        db_state = f"uninitialized: {pool_error or 'Database pool not initialized'}"
    else:
        try:
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) FROM hazard_alerts WHERE is_active = TRUE;")
                    threats_count = int(cur.fetchone()[0] or 0)
        except Exception as exc:  # pragma: no cover - defensive
            status = "degraded"
            db_state = f"error: {exc}"
            threats_count = 0

    db_host = None
    try:
        db_host = _db_host_from_url(_get_database_url())
    except Exception:
        db_host = None

    return {
        "status": status,
        "engine": "GraphCast-V3-Core",
        "db": db_state,
        "db_host": db_host,
        "threats_count": threats_count,
    }


@app.get("/api/v1/debug/api-key")
def debug_api_key():
    """Debug endpoint to check API key configuration."""
    return {
        "AFRO_STORM_API_KEY": os.getenv("AFRO_STORM_API_KEY"),
        "AFRO_STORM_API_KEY_set": bool(os.getenv("AFRO_STORM_API_KEY")),
        "AFRO_STORM_API_KEY_length": len(os.getenv("AFRO_STORM_API_KEY", "")),
    }


@app.get("/api/v1/debug/db")
def debug_database():
    """Debug endpoint to check database URL selection."""
    # Debug database URL selection
    candidates = [
        ("NEON_DATABASE_URL", os.getenv("NEON_DATABASE_URL")),
        ("VITE_NEON_DATABASE_URL", os.getenv("VITE_NEON_DATABASE_URL")),
        ("DATABASE_URL", os.getenv("DATABASE_URL")),
        ("PGDATABASE_URL", os.getenv("PGDATABASE_URL")),
        ("PGDATABASE", os.getenv("PGDATABASE")),
        ("VITE_PGDATABASE_URL", os.getenv("VITE_PGDATABASE_URL")),
    ]
    
    selected_url = _get_database_url()
    selected_host = _db_host_from_url(selected_url)
    
    return {
        "candidates": candidates,
        "selected_url": selected_url,
        "selected_host": selected_host
    }


@app.get("/api/v1/health")
def health_v1():
    h = health()
    h.update({"service": "model-service"})
    return h


@app.get("/api/v1/")
def health_v1_root():
    return health_v1()


@app.get("/api/v1/analysis")
def get_analysis(limit: int = 200):
    """
    Build an analysis-mode summary directly from Neon (hazard_alerts).
    Output shape matches the frontend analysis panel contract.
    """
    _initialize_pool()
    now_iso = _utc_now_iso()

    if not _pool:
        _log_db_unavailable("get_analysis")
        return {
            "mode": "analysis",
            "timestamp": now_iso,
            "artifacts_used": ["neon:hazard_alerts"],
            "analysis": [
                {
                    "module": "Situational Summary",
                    "text": "Database currently unavailable. Analysis is running in degraded mode.",
                    "timestamp": now_iso,
                    "tags": ["observational", "degraded"],
                }
            ],
            "metadata": {
                "system_mode": "analysis",
                "provenance": "neon_db_unavailable",
            },
        }

    limit = max(1, min(2000, int(limit)))

    try:
        conn = _pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT type, severity, source, COALESCE(event_at, created_at) AS observed_at
                    FROM hazard_alerts
                    WHERE is_active = TRUE
                    ORDER BY observed_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        finally:
            _pool.putconn(conn)
    except Exception:
        logger.exception("Analysis query failed")
        return {
            "mode": "analysis",
            "timestamp": now_iso,
            "artifacts_used": ["neon:hazard_alerts"],
            "analysis": [
                {
                    "module": "Situational Summary",
                    "text": "Analysis query failed. Please retry shortly.",
                    "timestamp": now_iso,
                    "tags": ["observational", "degraded"],
                }
            ],
            "metadata": {
                "system_mode": "analysis",
                "provenance": "neon_db_query_failed",
            },
        }

    by_type: Dict[str, int] = {}
    by_severity: Dict[str, int] = {}
    by_source: Dict[str, int] = {}

    latest_observed = None
    for r_type, r_severity, r_source, observed_at in rows:
        t = _canonical_threat_type(r_type)
        s = (r_severity or "unknown").lower()
        src = (r_source or "unknown").lower()

        by_type[t] = by_type.get(t, 0) + 1
        by_severity[s] = by_severity.get(s, 0) + 1
        by_source[src] = by_source.get(src, 0) + 1

        if observed_at is not None and latest_observed is None:
            latest_observed = observed_at

    total = len(rows)
    high_impact = int(by_severity.get("high", 0) + by_severity.get("extreme", 0))

    top_types = ", ".join(
        [f"{k}:{v}" for k, v in sorted(by_type.items(), key=lambda kv: kv[1], reverse=True)[:3]]
    ) or "none"
    top_sources = ", ".join(
        [f"{k}:{v}" for k, v in sorted(by_source.items(), key=lambda kv: kv[1], reverse=True)[:3]]
    ) or "none"
    latest_text = latest_observed.isoformat() if latest_observed else "n/a"

    statements = [
        f"Current analysis window includes {total} active hazard record(s).",
        f"High-impact records (high/extreme): {high_impact}.",
        f"Dominant hazard types: {top_types}.",
        f"Dominant data sources: {top_sources}.",
        f"Most recent observed record timestamp: {latest_text}.",
    ]

    return {
        "mode": "analysis",
        "timestamp": now_iso,
        "artifacts_used": ["neon:hazard_alerts"],
        "analysis": [
            {
                "module": "Situational Summary",
                "text": text,
                "timestamp": now_iso,
                "tags": ["observational", "neon"],
            }
            for text in statements
        ],
        "metadata": {
            "system_mode": "analysis",
            "provenance": "neon_db_hazard_alerts",
        },
    }


@app.get("/api/v1/threats")
def get_threats(limit: int = 100):
    """
    Serve live hazards from PostgreSQL (table: hazard_alerts) without mock data.
    Expected columns: external_id, source, type, severity, title, description,
    lat, lng, event_at, intensity, metadata (JSON).
    """
    _initialize_pool()
    if not _pool:
        _log_db_unavailable("get_threats")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    try:
        conn = _pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT external_id, source, type, severity, title, description,
                           lat, lng, event_at, intensity, metadata, data_source_run_id, forecast_hour
                    FROM hazard_alerts
                    WHERE is_active = TRUE
                      AND source <> 'convergence_engine'
                    ORDER BY event_at DESC NULLS LAST
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
        finally:
            _pool.putconn(conn)
    except Exception:
        logger.exception("Threat query failed")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    threats = []
    for row in rows:
        (
            external_id,
            source,
            hazard_type,
            severity,
            title,
            description,
            lat,
            lng,
            event_at,
            intensity,
            metadata,
            data_source_run_id,
            forecast_hour,
        ) = row

        try:
            metadata_obj = metadata if isinstance(metadata, dict) else json.loads(metadata or "{}")
        except Exception:
            metadata_obj = {}

        affected_regions = (
            metadata_obj.get("affected_regions")
            or metadata_obj.get("regions")
            or []
        )

        canonical_type = _canonical_threat_type(hazard_type)
        threats.append(
            {
                "id": external_id or f"{source}-{event_at.isoformat() if event_at else _utc_now_iso()}",
                "threat_type": canonical_type,
                "source": source,
                "data_source_run_id": data_source_run_id or metadata_obj.get("data_source_run_id"),
                "forecast_hour": forecast_hour if forecast_hour is not None else metadata_obj.get("forecast_hour"),
                "risk_level": (severity or "unknown").lower(),
                "affected_regions": affected_regions,
                "lead_time_days": metadata_obj.get("lead_time_days"),
                "confidence": metadata_obj.get("confidence"),
                "center_lat": lat,
                "center_lng": lng,
                "detection_details": {
                    "title": title,
                    "description": description,
                    "intensity": intensity,
                    "source": source,
                    "data_source_run_id": data_source_run_id or metadata_obj.get("data_source_run_id"),
                    "forecast_hour": forecast_hour if forecast_hour is not None else metadata_obj.get("forecast_hour"),
                    **{k: v for k, v in metadata_obj.items() if k not in {"affected_regions", "regions"}},
                },
                "created_at": (event_at or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        )

    # --- Convergence persistence (DB-first) ---
    # Convergences are stored back into hazard_alerts as source=convergence_engine
    # so that downstream systems can query history directly from Azure Postgres.
    climate_types = {"cyclone", "flood", "drought", "wildfire"}
    health_types = {"cholera", "lassa", "meningitis", "malaria", "ebola", "measles"}
    radius_km = float(os.getenv("CONVERGENCE_RADIUS_KM") or 500)

    climate = [t for t in threats if t.get("threat_type") in climate_types and t.get("center_lat") is not None and t.get("center_lng") is not None]
    health = [t for t in threats if t.get("threat_type") in health_types and t.get("center_lat") is not None and t.get("center_lng") is not None]

    convergences = []
    now_iso = _utc_now_iso()

    for c in climate:
        for h in health:
            dist = _haversine_km(float(c["center_lat"]), float(c["center_lng"]), float(h["center_lat"]), float(h["center_lng"]))
            if dist > radius_km:
                continue

            risk_multiplier = 1.5
            pair = (c["threat_type"], h["threat_type"])
            multipliers = {
                ("cyclone", "cholera"): 2.5,
                ("cyclone", "lassa"): 2.0,
                ("flood", "cholera"): 3.0,
                ("flood", "meningitis"): 1.5,
                ("drought", "cholera"): 1.8,
                ("drought", "meningitis"): 2.2,
            }
            risk_multiplier = multipliers.get(pair, risk_multiplier)

            conv_id = f"conv-{c['id']}-{h['id']}"
            affected_regions = sorted({*(c.get("affected_regions") or []), *(h.get("affected_regions") or [])})
            conv_lat = (float(c["center_lat"]) + float(h["center_lat"])) / 2
            conv_lng = (float(c["center_lng"]) + float(h["center_lng"])) / 2

            conv = {
                "id": conv_id,
                "threat_type": "convergence",
                "risk_level": "high" if risk_multiplier >= 2 else "moderate",
                "affected_regions": affected_regions,
                "lead_time_days": min([x for x in [c.get("lead_time_days"), h.get("lead_time_days")] if isinstance(x, (int, float))], default=None),
                "confidence": max([x for x in [c.get("confidence"), h.get("confidence")] if isinstance(x, (int, float))], default=None),
                "center_lat": conv_lat,
                "center_lng": conv_lng,
                "detection_details": {
                    "source": "convergence_engine",
                    "climate_threat_id": c["id"],
                    "health_threat_id": h["id"],
                    "climate_type": c["threat_type"],
                    "health_type": h["threat_type"],
                    "distance_km": round(dist, 2),
                    "risk_multiplier": risk_multiplier,
                },
                "created_at": now_iso,
            }
            convergences.append(conv)

    # Store convergences to DB (idempotent upsert). If schema doesn't match,
    # we fail safe by skipping persistence but still return computed convergences.
    if _pool and convergences:
        try:
            conn = _pool.getconn()
            try:
                with conn.cursor() as cur:
                    for conv in convergences:
                        cur.execute(
                            """
                            INSERT INTO hazard_alerts (
                              external_id, source, type, severity, title, description,
                              lat, lng, event_at, intensity, metadata, is_active
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s, TRUE)
                            ON CONFLICT (source, external_id) 
                            DO UPDATE SET 
                              type = EXCLUDED.type,
                              severity = EXCLUDED.severity,
                              title = EXCLUDED.title,
                              description = EXCLUDED.description,
                              lat = EXCLUDED.lat,
                              lng = EXCLUDED.lng,
                              event_at = EXCLUDED.event_at,
                              intensity = EXCLUDED.intensity,
                              metadata = EXCLUDED.metadata,
                              is_active = EXCLUDED.is_active,
                              updated_at = NOW()
                            """,
                            (
                                conv["id"],
                                "convergence_engine",
                                "convergence",
                                conv["risk_level"],
                                f"Convergence: {conv['detection_details']['climate_type']} + {conv['detection_details']['health_type']}",
                                f"Convergence of {conv['detection_details']['climate_type']} and {conv['detection_details']['health_type']} threats",
                                conv["center_lat"],
                                conv["center_lng"],
                                conv["detection_details"].get("intensity") or 0.0,
                                json.dumps(conv["detection_details"]),
                            ),
                        )
                    # Deactivate stale convergence rows (older than 72h since updated)
                    cur.execute(
                        """
                        UPDATE hazard_alerts
                        SET is_active = FALSE
                        WHERE source = %s
                          AND is_active = TRUE
                          AND updated_at < NOW() - INTERVAL '72 hours'
                        """,
                        ("convergence_engine",),
                    )
                    conn.commit()
            finally:
                _pool.putconn(conn)
        except Exception:
            logger.exception("Failed to store convergences; continuing without persistence")

    # Final safeguard: dedupe by id so convergences are never double-counted.
    all_threats = threats + convergences
    deduped: Dict[str, Dict[str, Any]] = {}
    for t in all_threats:
        tid = str(t.get("id"))
        prev = deduped.get(tid)
        if prev is None:
            deduped[tid] = t
            continue
        # Keep the most recent record for this id.
        if str(t.get("created_at") or "") >= str(prev.get("created_at") or ""):
            deduped[tid] = t
    all_threats = list(deduped.values())

    return {
        "timestamp": _utc_now_iso(),
        "threats": all_threats,
        "count": len(all_threats),
        "sources": sorted({t["detection_details"]["source"] for t in all_threats if t.get("detection_details", {}).get("source")}),
        "model_version": os.getenv("MODEL_VERSION") or "live",
    }


@app.get("/api/v1/afro-storm/threats")
def get_threats_alias(limit: int = 100):
    """Compatibility endpoint replacing legacy Next.js route handler."""
    return get_threats(limit=limit)


@app.post("/api/v1/afro-storm/threats")
async def push_threats_alias(request: Request):
    """Optional ingest endpoint (compatibility). Stores last payload in-memory.

    If you want this to persist to Postgres, we can add an upsert into hazard_alerts,
    but keeping it in-memory is the safest default until schema is finalized.
    """
    _require_ingest_key(request)

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    global _pushed_threats_cache
    _pushed_threats_cache = {
        "received_at": _utc_now_iso(),
        "payload": body,
    }
    return {"success": True, "received_at": _pushed_threats_cache["received_at"]}


@app.get("/api/v1/pipeline/status")
def pipeline_status():
    """Replacement for legacy Next.js pipeline/status handler.

    Best-effort: if ingestion tables exist, return recent records. Otherwise,
    return an empty payload with a clear status.
    """
    _initialize_pool()
    if not pool:
        _log_db_unavailable("pipeline_status")
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "watermarks": [],
            "recent_logs": [],
            "detail": "Service temporarily unavailable",
        }

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM source_watermarks")
                watermarks = cur.fetchall()
                cur.execute(
                    """
                    SELECT source, status, records_synced, latency_ms, created_at
                    FROM ingestion_logs
                    ORDER BY created_at DESC
                    LIMIT 20
                    """
                )
                logs = cur.fetchall()
        return {
            "timestamp": _utc_now_iso(),
            "status": "ok",
            "watermarks": watermarks,
            "recent_logs": logs,
        }
    except Exception as exc:
        return {
            "timestamp": _utc_now_iso(),
            "status": "not_configured",
            "watermarks": [],
            "recent_logs": [],
            "detail": str(exc),
        }


@app.get("/api/v1/forecast/runs")
def list_forecast_runs(limit: int = 20):
    _initialize_pool()
    if not pool:
        _log_db_unavailable("list_forecast_runs")
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "runs": [],
            "detail": "Service temporarily unavailable",
        }

    limit = max(1, min(200, int(limit)))

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, source, model, model_version, run_label,
                           init_time, horizon_hours, step_hours,
                           region_bbox, grid_spec, input_provenance, artifact_uris,
                           status, detail, created_at
                    FROM forecast_runs
                    ORDER BY init_time DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()

        runs = []
        for r in rows:
            (
                run_id,
                source,
                model,
                model_version,
                run_label,
                init_time,
                horizon_hours,
                step_hours,
                region_bbox,
                grid_spec,
                input_provenance,
                artifact_uris,
                status,
                detail,
                created_at,
            ) = r

            runs.append(
                {
                    "id": run_id,
                    "source": source,
                    "model": model,
                    "model_version": model_version,
                    "run_label": run_label,
                    "init_time": init_time.isoformat() if init_time else None,
                    "horizon_hours": horizon_hours,
                    "step_hours": step_hours,
                    "region_bbox": region_bbox,
                    "grid_spec": grid_spec,
                    "input_provenance": input_provenance,
                    "artifact_uris": artifact_uris,
                    "status": status,
                    "detail": detail,
                    "created_at": created_at.isoformat() if created_at else None,
                }
            )

        return {
            "timestamp": _utc_now_iso(),
            "status": "ok",
            "runs": runs,
            "count": len(runs),
        }
    except Exception as exc:
        return {
            "timestamp": _utc_now_iso(),
            "status": "not_configured",
            "runs": [],
            "count": 0,
            "detail": str(exc),
        }


@app.get("/api/v1/forecast/fields")
def list_forecast_fields(run_id: int, field: Optional[str] = None, limit: int = 200):
    _initialize_pool()
    if not pool:
        _log_db_unavailable("list_forecast_fields")
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "fields": [],
            "detail": "Service temporarily unavailable",
        }

    limit = max(1, min(2000, int(limit)))

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                if field:
                    cur.execute(
                        """
                        SELECT id, run_id, field, level, valid_time,
                               uri, content_type, geojson, metadata, created_at
                        FROM forecast_fields
                        WHERE run_id = %s AND field = %s
                        ORDER BY valid_time ASC
                        LIMIT %s
                        """,
                        (run_id, field, limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, run_id, field, level, valid_time,
                               uri, content_type, geojson, metadata, created_at
                        FROM forecast_fields
                        WHERE run_id = %s
                        ORDER BY valid_time ASC
                        LIMIT %s
                        """,
                        (run_id, limit),
                    )
                rows = cur.fetchall()

        out = []
        for r in rows:
            (
                row_id,
                rid,
                f,
                level,
                valid_time,
                uri,
                content_type,
                geojson,
                metadata,
                created_at,
            ) = r

            out.append(
                {
                    "id": row_id,
                    "run_id": rid,
                    "field": f,
                    "level": level,
                    "valid_time": valid_time.isoformat() if valid_time else None,
                    "uri": uri,
                    "content_type": content_type,
                    "geojson": geojson,
                    "metadata": metadata,
                    "created_at": created_at.isoformat() if created_at else None,
                }
            )

        return {
            "timestamp": _utc_now_iso(),
            "status": "ok",
            "fields": out,
            "count": len(out),
        }
    except Exception as exc:
        return {
            "timestamp": _utc_now_iso(),
            "status": "not_configured",
            "fields": [],
            "count": 0,
            "detail": str(exc),
        }


# GraphCast Ingestion Control Endpoints
@app.get("/api/v1/graphcast/status")
def graphcast_status():
    """Get GraphCast ingestion service status."""
    global _graphcast_task
    
    status = {
        "enabled": os.getenv("GRAPHCAST_INGESTION_ENABLED", "").lower() in {"1", "true", "yes"},
        "task_running": _graphcast_task is not None and not _graphcast_task.done(),
        "interval_minutes": int(os.getenv("GRAPHCAST_INGESTION_INTERVAL_MIN", "30")),
        "max_retries": int(os.getenv("GRAPHCAST_MAX_RETRIES", "3")),
        "retry_delay_seconds": int(os.getenv("GRAPHCAST_RETRY_DELAY_SEC", "60"))
    }
    
    if _graphcast_task and _graphcast_task.done():
        try:
            _graphcast_task.result()
        except Exception as e:
            status["error"] = str(e)
    
    return status


@app.post("/api/v1/graphcast/ingest")
async def trigger_graphcast_ingestion():
    """Manually trigger a GraphCast ingestion run."""
    _initialize_pool()
    if not pool:
        _log_db_unavailable("trigger_graphcast_ingestion")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    
    try:
        from graphcast_ingestion import get_graphcast_ingestor
        ingestor = get_graphcast_ingestor(pool)
        
        # Run ingestion in background
        task = asyncio.create_task(ingestor.ingest_forecast_run())
        
        return {
            "status": "triggered",
            "message": "GraphCast ingestion started",
            "task_id": id(task)
        }
    except ImportError as e:
        raise HTTPException(status_code=501, detail=f"GraphCast ingestion module not available: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger ingestion: {e}")


@app.get("/api/v1/graphcast/runs")
def list_graphcast_runs(limit: int = 20):
    """List recent GraphCast forecast runs."""
    _initialize_pool()
    if not pool:
        _log_db_unavailable("list_graphcast_runs")
        return {
            "timestamp": _utc_now_iso(),
            "status": "no_database",
            "runs": [],
            "count": 0,
        }
    
    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT run_id, source, model_name, version, status,
                           created_at, completed_at, metadata
                    FROM forecast_runs 
                    WHERE source = 'graphcast'
                    ORDER BY created_at DESC 
                    LIMIT %s
                """, (limit,))
                
                rows = cur.fetchall()
                
                runs = []
                for row in rows:
                    runs.append({
                        "run_id": row[0],
                        "source": row[1],
                        "model_name": row[2],
                        "version": row[3],
                        "status": row[4],
                        "created_at": row[5].isoformat() if row[5] else None,
                        "completed_at": row[6].isoformat() if row[6] else None,
                        "metadata": row[7]
                    })
                
                return {
                    "timestamp": _utc_now_iso(),
                    "status": "success",
                    "runs": runs,
                    "count": len(runs)
                }
                
    except Exception as exc:
        return {
            "timestamp": _utc_now_iso(),
            "status": "error",
            "runs": [],
            "count": 0,
            "detail": str(exc)
        }


@app.post("/infer")
def run_inference(req: InferenceRequest):
    # This is the entry point for GraphCast/ML logic.
    # In a real environment, this would call model.predict() on loaded weights.
    try:
        # Simulate heavy compute
        time.sleep(0.5)
        
        return {
            "status": "SUCCESS",
            "region": req.region,
            "prediction_timestamp": str(int(time.time())),
            "risk_vectors": [
                {"field": "tp_6h", "anomaly": 2.4, "unit": "sigma"},
                {"field": "v_10m", "anomaly": 1.8, "unit": "sigma"}
            ],
            "gridded_mesh_id": f"mesh_{req.region}_current"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/infer")
def run_inference_v1(req: InferenceRequest):
    return run_inference(req)


@app.post("/api/v1/ai/analyze")
def ai_analyze(req: AiAnalyzeRequest):
    """Analyze query using MoStar AI Multi-Model Mesh (Azure + Gemini + Claude)"""
    if MOSCRIPTS_AVAILABLE:
        # Use MoScripts for multi-model AI analysis with voice lines
        try:
            result = analyze_with_mostar(req.prompt, req.context or "")

            return {
                "response": result['synthesis'],
                "azure_analysis": result['azure_analysis'],
                "gemini_analysis": result['gemini_analysis'],
                "claude_analysis": result.get('claude_analysis', ''),
                "combined_confidence": result['combined_confidence'],
                "models_used": result['models_used'],
                "safety_flags": result.get('safety_flags', []),
                "processing_time": result['processing_time'],
                "mesh_status": result['mesh_status'],
                "moscripts_enabled": True,
                "intelligence_system": "MoStar AI Multi-Model Mesh v2.0 (Azure + Gemini + Claude)",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MoStar AI analysis failed: {str(e)}")
    else:
        # Fallback to mock response
        return {
            "response": f"AI analysis for: {req.prompt}\n\nNote: MoStar AI Multi-Model Mesh is not available. Please configure Azure OpenAI, Gemini, and Anthropic API keys.",
            "model": "mock-response",
            "moscripts_enabled": False,
            "intelligence_system": "Legacy AI Mock",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@app.post("/api/v1/ai/claude/analyze")
def claude_analyze(req: ClaudeAnalyzeRequest):
    """Dedicated Claude analysis endpoint for strategic reasoning and safety assessment"""
    if MOSCRIPTS_AVAILABLE:
        try:
            from moscripts.mo_mostar_ai import MoClaudeSpirit
            claude = MoClaudeSpirit()
            result = claude.execute({
                'query': req.prompt,
                'context': ''
            })

            if result is None:
                raise HTTPException(status_code=500, detail="Claude analysis returned no result")

            return {
                "response": result.get('analysis', ''),
                "analysis": result.get('analysis', ''),
                "confidence": result.get('confidence', 0),
                "model": result.get('model', 'claude-sonnet'),
                "safety_flags": result.get('safety_flags', []),
                "processing_time": result.get('processing_time', 0),
                "provider": "Anthropic Claude",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        except ImportError:
            raise HTTPException(status_code=501, detail="Claude MoScript module not available")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Claude analysis failed: {str(e)}")
    else:
        return {
            "response": f"Claude analysis for: {req.prompt}\n\nNote: Claude integration requires the anthropic Python package and ANTHROPIC_API_KEY.",
            "model": "mock-response",
            "provider": "Anthropic Claude (mock)",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@app.get("/api/v1/weather/anomalies")
async def get_weather_anomalies(include_candidates: bool = False):
    """Detect cyclones, floods, landslides from GraphCast data using MoScripts"""
    cfg = _load_detections_config()
    if MOSCRIPTS_AVAILABLE:
        # Use MoScripts for intelligent detection with voice lines
        try:
            # Mock GraphCast data for now - in production this would be real data
            mock_graphcast_data = {
                'u_component_of_wind': [[10, 15, 20, 25, 30], [35, 40, 45, 50, 55], [60, 65, 70, 75, 80], 
                                       [85, 90, 95, 100, 105], [110, 115, 120, 125, 130]],
                'v_component_of_wind': [[5, 10, 15, 20, 25], [30, 35, 40, 45, 50], [55, 60, 65, 70, 75],
                                       [80, 85, 90, 95, 100], [105, 110, 115, 120, 125]],
                'sea_level_pressure': [[1010, 1005, 1000, 995, 990], [985, 980, 975, 970, 965], [960, 955, 950, 945, 940],
                                       [935, 930, 925, 920, 915], [910, 905, 900, 895, 890]],
                'total_precipitation': [[0.01, 0.05, 0.1, 0.15, 0.2], [0.25, 0.3, 0.35, 0.4, 0.45], [0.5, 0.55, 0.6, 0.65, 0.7],
                                       [0.75, 0.8, 0.85, 0.9, 0.95], [1.0, 1.05, 1.1, 1.15, 1.2]],
                'soil_moisture': [[0.6, 0.7, 0.8, 0.85, 0.9], [0.92, 0.94, 0.96, 0.98, 1.0], [0.95, 0.97, 0.99, 1.0, 1.0],
                                     [0.9, 0.92, 0.94, 0.96, 0.98], [0.85, 0.87, 0.89, 0.91, 0.93]]
            }
            
            # Use MoScripts for detection with voice lines
            result = detect_weather_anomalies(mock_graphcast_data)

            raw_threats = _normalize_to_threats(result)
            candidate_min = float((cfg.get("gating") or {}).get("confidence_candidate_min", 0.5))
            candidates = [
                {**t, "status": "candidate"}
                for t in raw_threats
                if _as_float(t.get("confidence")) is None or float(_as_float(t.get("confidence")) or 0.0) >= candidate_min
            ]
            candidates_out = [{k: v for k, v in t.items() if k != "_geo_key"} for t in candidates]
            confirmed_now = [{**t, "status": "confirmed"} for t in candidates if _is_confirmed(t, cfg)]
            confirmed = _apply_persistence(confirmed_now, cfg)
            
            return {
                "timestamp": result['timestamp'],
                "cyclones": result['cyclones'],
                "floods": result['floods'],
                "landslides": result['landslides'],
                "convergences": result['convergences'],
                "threats": candidates_out if include_candidates else confirmed,
                "total_hazards": result['total_hazards'],
                "detection_time": result['detection_time'],
                "moscripts_enabled": True,
                "detections_config": cfg.get("gating"),
                "intelligence_system": "MoScripts Backend v1.0"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MoScripts detection failed: {str(e)}")
    else:
        # Fallback to original implementation
        if WeatherAnomalyDetector is None:
            raise HTTPException(status_code=501, detail="Weather anomaly detection module not available")
        
        try:
            detector = WeatherAnomalyDetector()
            
            # TODO: Replace with real GraphCast output - using sample data for now
            # In production, this would fetch from your GraphCast ingestion system
            sample_graphcast_data = {
                'u_component_of_wind': [[10, 15, 20, 25, 30], [35, 40, 45, 50, 55], [60, 65, 70, 75, 80], 
                                       [85, 90, 95, 100, 105], [110, 115, 120, 125, 130]],
                'v_component_of_wind': [[5, 10, 15, 20, 25], [30, 35, 40, 45, 50], [55, 60, 65, 70, 75],
                                       [80, 85, 90, 95, 100], [105, 110, 115, 120, 125]],
                'sea_level_pressure': [[1010, 1005, 1000, 995, 990], [985, 980, 975, 970, 965], [960, 955, 950, 945, 940],
                                       [935, 930, 925, 920, 915], [910, 905, 900, 895, 890]],
                'total_precipitation': [[0.01, 0.05, 0.1, 0.15, 0.2], [0.25, 0.3, 0.35, 0.4, 0.45], [0.5, 0.55, 0.6, 0.65, 0.7],
                                       [0.75, 0.8, 0.85, 0.9, 0.95], [1.0, 1.05, 1.1, 1.15, 1.2]],
                'soil_moisture': [[0.6, 0.7, 0.8, 0.85, 0.9], [0.92, 0.94, 0.96, 0.98, 1.0], [0.95, 0.97, 0.99, 1.0, 1.0],
                                     [0.9, 0.92, 0.94, 0.96, 0.98], [0.85, 0.87, 0.89, 0.91, 0.93]]
            }
            
            results = detector.detect_all_hazards(sample_graphcast_data)

            raw = {
                "timestamp": datetime.now().isoformat(),
                "cyclones": results.get("cyclones", []),
                "floods": results.get("floods", []),
                "landslides": results.get("landslides", []),
                "convergences": results.get("convergences", []),
            }
            raw_threats = _normalize_to_threats(raw)
            candidate_min = float((cfg.get("gating") or {}).get("confidence_candidate_min", 0.5))
            candidates = [
                {**t, "status": "candidate"}
                for t in raw_threats
                if _as_float(t.get("confidence")) is None or float(_as_float(t.get("confidence")) or 0.0) >= candidate_min
            ]
            candidates_out = [{k: v for k, v in t.items() if k != "_geo_key"} for t in candidates]
            confirmed_now = [{**t, "status": "confirmed"} for t in candidates if _is_confirmed(t, cfg)]
            confirmed = _apply_persistence(confirmed_now, cfg)
            
            return {
                "timestamp": raw["timestamp"],
                "cyclones": raw["cyclones"],
                "floods": raw["floods"],
                "landslides": raw["landslides"],
                "convergences": raw["convergences"],
                "threats": candidates_out if include_candidates else confirmed,
                "total_hazards": len(raw["cyclones"]) + len(raw["floods"]) + len(raw["landslides"]),
                "convergence_zones": len(raw["convergences"]),
                "detection_confidence": "high" if len(results['convergences']) > 0 else "moderate",
                "moscripts_enabled": False,
                "detections_config": cfg.get("gating"),
                "intelligence_system": "Legacy Weather Detection"
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Weather anomaly detection failed: {str(e)}")


@app.get("/api/v1/weather/current")
def weather_current(lat: float, lon: float, units: str = "metric"):
    api_key = os.getenv("OPENWEATHER_API_KEY") or os.getenv("VITE_OPENWEATHER_API")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenWeather is not configured on the backend")

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"lat": lat, "lon": lon, "appid": api_key, "units": units}
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(url, params=params)
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"OpenWeather error: {r.status_code} {r.text}")
        return r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)


