from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
import json
import os
import time

import httpx
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv
import asyncio
from contextlib import asynccontextmanager

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan including background tasks."""
    # Startup
    global _graphcast_task
    if os.getenv("GRAPHCAST_INGESTION_ENABLED", "").lower() in {"1", "true", "yes"}:
        try:
            from .graphcast_ingestion import start_graphcast_ingestion
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


def _db_init_enabled() -> bool:
    v = (os.getenv("AUTO_INIT_DB") or "").strip().lower()
    return v in {"1", "true", "yes", "on"}


def _init_db_schema_and_seed():
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


@app.on_event("startup")
def _on_startup():
    if not _db_init_enabled():
        return
    try:
        _init_db_schema_and_seed()
    except Exception:
        return

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
try:
    _connect_timeout = float(os.getenv("DB_CONNECT_TIMEOUT_SEC") or 8)
    _pool_timeout = float(os.getenv("DB_POOL_TIMEOUT_SEC") or 8)
    pool = ConnectionPool(
        conninfo=_get_database_url(),
        min_size=0,
        max_size=5,
        timeout=_pool_timeout,
        open=False,
        kwargs={"connect_timeout": _connect_timeout},
    )
except Exception as exc:
    pool = None
    pool_error = str(exc)
else:
    pool_error = None


@app.get("/health")
def health():
    status = "healthy"
    db_state = "connected"

    if not pool:
        status = "degraded"
        db_state = f"uninitialized: {pool_error}"
    else:
        try:
            pool.open()
            with pool.connection(timeout=float(os.getenv("DB_POOL_TIMEOUT_SEC") or 8)) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
        except Exception as exc:  # pragma: no cover - defensive
            status = "degraded"
            db_state = f"error: {exc}"

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


@app.get("/api/v1/threats")
def get_threats(limit: int = 100):
    """
    Serve live hazards from PostgreSQL (table: hazard_alerts) without mock data.
    Expected columns: external_id, source, type, severity, title, description,
    lat, lng, event_at, intensity, metadata (JSON).
    """
    if not pool:
        raise HTTPException(status_code=503, detail=f"Database not ready: {pool_error}")

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT external_id, source, type, severity, title, description,
                           lat, lng, event_at, intensity, metadata
                    FROM hazard_alerts
                    WHERE is_active = TRUE
                    ORDER BY event_at DESC NULLS LAST
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB query failed: {exc}")

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
    if pool and convergences:
        try:
            pool.open()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    for conv in convergences:
                        cur.execute(
                            """
                            INSERT INTO hazard_alerts (
                              external_id, source, type, severity, title, description,
                              lat, lng, event_at, intensity, metadata, is_active
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s, TRUE)
                            ON CONFLICT (source, external_id) DO UPDATE SET
                              type = EXCLUDED.type,
                              severity = EXCLUDED.severity,
                              title = EXCLUDED.title,
                              description = EXCLUDED.description,
                              lat = EXCLUDED.lat,
                              lng = EXCLUDED.lng,
                              intensity = EXCLUDED.intensity,
                              metadata = EXCLUDED.metadata,
                              is_active = TRUE,
                              updated_at = NOW()
                            """,
                            (
                                conv["id"],
                                "convergence_engine",
                                "convergence",
                                conv["risk_level"],
                                f"Convergence: {conv['detection_details']['climate_type']} + {conv['detection_details']['health_type']}",
                                "Climate and health threats intersect within radius",
                                conv["center_lat"],
                                conv["center_lng"],
                                conv["detection_details"]["risk_multiplier"],
                                json.dumps({
                                    **conv["detection_details"],
                                    "affected_regions": conv.get("affected_regions") or [],
                                    "lead_time_days": conv.get("lead_time_days"),
                                    "confidence": conv.get("confidence"),
                                }),
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
        except Exception:
            pass

    all_threats = threats + convergences

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
    if not pool:
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "watermarks": [],
            "recent_logs": [],
            "detail": f"Database not ready: {pool_error}",
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
    if not pool:
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "runs": [],
            "detail": f"Database not ready: {pool_error}",
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
    if not pool:
        return {
            "timestamp": _utc_now_iso(),
            "status": "unavailable",
            "fields": [],
            "detail": f"Database not ready: {pool_error}",
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
    if not pool:
        raise HTTPException(status_code=503, detail="Database not available")
    
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
    if not pool:
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


def _persist_anomalies_to_db(result: dict):
    """Write detected anomalies into hazard_alerts so the /threats endpoint can serve them."""
    if not pool:
        return

    hazard_rows = []
    for cyc in result.get('cyclones', []):
        hazard_rows.append({
            "external_id": cyc.get('id', f"cyc-{cyc.get('center_lat', 0):.2f}"),
            "type": "cyclone",
            "severity": cyc.get('intensity', 'unknown'),
            "title": f"Cyclone detected ({cyc.get('intensity', 'unknown')})",
            "description": f"Max wind {cyc.get('max_wind_speed', 0):.0f} km/h, pressure {cyc.get('min_pressure', 0):.0f} hPa",
            "lat": cyc.get('center_lat'),
            "lng": cyc.get('center_lng'),
            "intensity": cyc.get('max_wind_speed', 0),
            "metadata": json.dumps({
                "confidence": cyc.get('detection_confidence', 0),
                "vorticity": cyc.get('vorticity', 0),
                "radius_km": cyc.get('radius_km', 0),
                "affected_regions": cyc.get('affected_regions', []),
                "source_model": "graphcast_anomaly_detector",
            }),
        })

    for fld in result.get('floods', []):
        hazard_rows.append({
            "external_id": fld.get('id', f"fld-{fld.get('center_lat', 0):.2f}"),
            "type": "flood",
            "severity": fld.get('severity', 'unknown'),
            "title": f"Flood risk ({fld.get('severity', 'unknown')})",
            "description": f"Precipitation {fld.get('precipitation_mm_per_hour', 0):.0f} mm/h, risk {fld.get('risk_score', 0):.2f}",
            "lat": fld.get('center_lat'),
            "lng": fld.get('center_lng'),
            "intensity": fld.get('risk_score', 0),
            "metadata": json.dumps({
                "confidence": fld.get('detection_confidence', 0),
                "affected_area_km2": fld.get('affected_area_km2', 0),
                "duration_hours": fld.get('duration_hours', 0),
                "affected_regions": fld.get('affected_regions', []),
                "source_model": "graphcast_anomaly_detector",
            }),
        })

    for lsl in result.get('landslides', []):
        hazard_rows.append({
            "external_id": lsl.get('id', f"lsl-{lsl.get('center_lat', 0):.2f}"),
            "type": "landslide",
            "severity": lsl.get('severity', 'unknown'),
            "title": f"Landslide risk ({lsl.get('severity', 'unknown')})",
            "description": f"Trigger rainfall {lsl.get('trigger_rainfall_mm', 0):.0f} mm, slope {lsl.get('slope_angle', 0):.0f} deg",
            "lat": lsl.get('center_lat'),
            "lng": lsl.get('center_lng'),
            "intensity": lsl.get('risk_score', 0),
            "metadata": json.dumps({
                "confidence": lsl.get('detection_confidence', 0),
                "soil_saturation": lsl.get('soil_saturation', 0),
                "affected_regions": lsl.get('affected_regions', []),
                "source_model": "graphcast_anomaly_detector",
            }),
        })

    if not hazard_rows:
        return

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                for h in hazard_rows:
                    cur.execute("""
                        INSERT INTO hazard_alerts (
                            external_id, source, type, severity, title, description,
                            lat, lng, event_at, intensity, metadata, is_active
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s, %s::jsonb, TRUE)
                        ON CONFLICT (source, external_id) DO UPDATE SET
                            severity = EXCLUDED.severity,
                            title = EXCLUDED.title,
                            description = EXCLUDED.description,
                            lat = EXCLUDED.lat,
                            lng = EXCLUDED.lng,
                            intensity = EXCLUDED.intensity,
                            metadata = EXCLUDED.metadata,
                            is_active = TRUE,
                            updated_at = NOW()
                    """, (
                        h["external_id"],
                        "graphcast_anomaly_detector",
                        h["type"],
                        h["severity"],
                        h["title"],
                        h["description"],
                        h["lat"],
                        h["lng"],
                        h["intensity"],
                        h["metadata"],
                    ))
    except Exception as e:
        print(f"⚠️ Failed to persist anomalies to DB: {e}")


def _load_anomalies_from_db() -> dict | None:
    """Try to load recent anomaly detections from the database."""
    if not pool:
        return None

    try:
        pool.open()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT external_id, type, severity, title, description,
                           lat, lng, intensity, metadata, event_at
                    FROM hazard_alerts
                    WHERE is_active = TRUE
                      AND source IN ('graphcast_anomaly_detector', 'graphcast')
                      AND event_at > NOW() - INTERVAL '24 hours'
                    ORDER BY event_at DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()

        if not rows:
            return None

        buckets: dict = {"cyclones": [], "floods": [], "landslides": [], "convergences": []}
        for row in rows:
            (ext_id, htype, severity, title, description, lat, lng, intensity, metadata, event_at) = row
            try:
                meta = metadata if isinstance(metadata, dict) else json.loads(metadata or "{}")
            except Exception:
                meta = {}

            entry = {
                "id": ext_id,
                "type": htype,
                "severity": severity,
                "title": title,
                "description": description,
                "center_lat": lat,
                "center_lng": lng,
                "intensity": intensity,
                "detection_confidence": meta.get("confidence", 0),
                "affected_regions": meta.get("affected_regions", []),
                "timestamp": event_at.isoformat() if event_at else None,
            }

            bucket_key = {
                "cyclone": "cyclones",
                "flood": "floods",
                "landslide": "landslides",
                "storm": "cyclones",
            }.get(htype, None)

            if bucket_key and bucket_key in buckets:
                buckets[bucket_key].append(entry)

        return buckets
    except Exception as e:
        print(f"⚠️ Failed to load anomalies from DB: {e}")
        return None


@app.get("/api/v1/weather/anomalies")
async def get_weather_anomalies():
    """Detect cyclones, floods, landslides from GraphCast data using MoScripts.

    Strategy:
    1. Try to load recent detections from the database (written by ingestion or previous calls).
    2. If no DB data, run detection algorithms against available forecast data.
    3. Persist new detections to hazard_alerts for the /threats endpoint.
    """
    # Step 1: Try DB first
    db_anomalies = _load_anomalies_from_db()
    if db_anomalies and any(len(v) > 0 for v in db_anomalies.values()):
        total = sum(len(v) for k, v in db_anomalies.items() if k != "convergences")
        return {
            "timestamp": _utc_now_iso(),
            "cyclones": db_anomalies["cyclones"],
            "floods": db_anomalies["floods"],
            "landslides": db_anomalies["landslides"],
            "convergences": db_anomalies["convergences"],
            "total_hazards": total,
            "detection_time": 0,
            "data_source": "database",
            "moscripts_enabled": MOSCRIPTS_AVAILABLE,
            "intelligence_system": "MoScripts Backend v2.0"
        }

    # Step 2: Run detection algorithms on forecast data
    # Try to load the latest forecast fields from the DB
    graphcast_data = _load_forecast_data_from_db()

    if MOSCRIPTS_AVAILABLE:
        try:
            result = detect_weather_anomalies(graphcast_data)

            # Step 3: Persist to DB so /threats endpoint can serve them
            _persist_anomalies_to_db(result)

            return {
                "timestamp": result['timestamp'],
                "cyclones": result['cyclones'],
                "floods": result['floods'],
                "landslides": result['landslides'],
                "convergences": result['convergences'],
                "total_hazards": result['total_hazards'],
                "detection_time": result['detection_time'],
                "data_source": "live_detection",
                "moscripts_enabled": True,
                "intelligence_system": "MoScripts Backend v2.0"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MoScripts detection failed: {str(e)}")
    else:
        if WeatherAnomalyDetector is None:
            raise HTTPException(status_code=501, detail="Weather anomaly detection module not available")

        try:
            detector = WeatherAnomalyDetector()
            results = detector.detect_all_hazards(graphcast_data)

            _persist_anomalies_to_db(results)

            return {
                "timestamp": datetime.now().isoformat(),
                "cyclones": results['cyclones'],
                "floods": results['floods'],
                "landslides": results['landslides'],
                "convergences": results['convergences'],
                "total_hazards": len(results['cyclones']) + len(results['floods']) + len(results['landslides']),
                "detection_time": 0,
                "data_source": "live_detection",
                "moscripts_enabled": False,
                "intelligence_system": "Legacy Weather Detection"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Weather anomaly detection failed: {str(e)}")


def _load_forecast_data_from_db() -> dict:
    """Try to load the latest forecast fields from the DB for detection.
    Falls back to a sample dataset if the DB has no forecast data."""
    if pool:
        try:
            pool.open()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    # Get the latest completed graphcast run
                    cur.execute("""
                        SELECT run_id FROM forecast_runs
                        WHERE source = 'graphcast' AND status = 'completed'
                        ORDER BY created_at DESC LIMIT 1
                    """)
                    row = cur.fetchone()
                    if row:
                        run_id = row[0]
                        # Load GeoJSON forecast fields
                        cur.execute("""
                            SELECT variable, storage_geojson
                            FROM forecast_fields
                            WHERE run_id = %s AND storage_type = 'geojson' AND storage_geojson IS NOT NULL
                        """, (run_id,))
                        fields = cur.fetchall()
                        if fields:
                            print(f"✅ Loaded forecast data from DB run {run_id}")
                            # Convert GeoJSON features to grid arrays for the detector
                            return _geojson_fields_to_grid(fields)
        except Exception as e:
            print(f"⚠️ Could not load forecast data from DB: {e}")

    # Fallback sample data
    return _get_sample_graphcast_data()


def _geojson_fields_to_grid(fields: list) -> dict:
    """Convert DB forecast fields (GeoJSON) into grid arrays the detector expects.
    This is a best-effort conversion for the anomaly detector."""
    import numpy as np

    grid_size = 10  # Reasonable grid for detection
    data = {
        'u_component_of_wind': np.zeros((grid_size, grid_size)).tolist(),
        'v_component_of_wind': np.zeros((grid_size, grid_size)).tolist(),
        'sea_level_pressure': np.full((grid_size, grid_size), 1013.0).tolist(),
        'total_precipitation': np.zeros((grid_size, grid_size)).tolist(),
        'soil_moisture': np.full((grid_size, grid_size), 0.5).tolist(),
    }

    for variable, geojson in fields:
        if not geojson or not isinstance(geojson, dict):
            continue
        features = geojson.get("features", [])
        for feat in features:
            props = feat.get("properties", {})
            value = props.get("value", 0)
            coords = feat.get("geometry", {}).get("coordinates", [0, 0])
            lon, lat = coords[0], coords[1]

            # Map lat/lon to grid indices (Africa: lat -40 to 40, lon -20 to 55)
            lat_idx = max(0, min(grid_size - 1, int((lat + 40) / 80 * grid_size)))
            lon_idx = max(0, min(grid_size - 1, int((lon + 20) / 75 * grid_size)))

            if variable == "wind_speed":
                # Split into u/v components (simplified)
                data['u_component_of_wind'][lat_idx][lon_idx] = value * 0.7
                data['v_component_of_wind'][lat_idx][lon_idx] = value * 0.7
            elif variable == "precipitation":
                data['total_precipitation'][lat_idx][lon_idx] = value / 24.0  # mm/h to daily fraction
            elif variable == "pressure":
                data['sea_level_pressure'][lat_idx][lon_idx] = value

    return data


def _get_sample_graphcast_data() -> dict:
    """Return sample GraphCast data for detection when no DB data is available."""
    return {
        'u_component_of_wind': [
            [10, 15, 20, 25, 30], [35, 40, 45, 50, 55],
            [60, 65, 70, 75, 80], [85, 90, 95, 100, 105],
            [110, 115, 120, 125, 130]
        ],
        'v_component_of_wind': [
            [5, 10, 15, 20, 25], [30, 35, 40, 45, 50],
            [55, 60, 65, 70, 75], [80, 85, 90, 95, 100],
            [105, 110, 115, 120, 125]
        ],
        'sea_level_pressure': [
            [1010, 1005, 1000, 995, 990], [985, 980, 975, 970, 965],
            [960, 955, 950, 945, 940], [935, 930, 925, 920, 915],
            [910, 905, 900, 895, 890]
        ],
        'total_precipitation': [
            [0.01, 0.05, 0.1, 0.15, 0.2], [0.25, 0.3, 0.35, 0.4, 0.45],
            [0.5, 0.55, 0.6, 0.65, 0.7], [0.75, 0.8, 0.85, 0.9, 0.95],
            [1.0, 1.05, 1.1, 1.15, 1.2]
        ],
        'soil_moisture': [
            [0.6, 0.7, 0.8, 0.85, 0.9], [0.92, 0.94, 0.96, 0.98, 1.0],
            [0.95, 0.97, 0.99, 1.0, 1.0], [0.9, 0.92, 0.94, 0.96, 0.98],
            [0.85, 0.87, 0.89, 0.91, 0.93]
        ],
    }


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
