from fastapi import FastAPI, HTTPException
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

# Load env for local dev; production should provide real env vars
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

app = FastAPI(title="AfriGuard Model Service")

# Allow local dev clients (Next/Vite) to call this service without CORS issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class InferenceRequest(BaseModel):
    region: str
    fields: List[str]
    timestamp: Optional[str] = None


class AiAnalyzeRequest(BaseModel):
    prompt: str

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
        os.getenv("DATABASE_URL"),
        os.getenv("PGDATABASE_URL"),
        os.getenv("PGDATABASE"),
        os.getenv("VITE_PGDATABASE_URL"),
    ]
    for url in candidates:
        if url:
            return url
    raise RuntimeError("DATABASE_URL/PGDATABASE_URL is not configured")


# Minimal connection pool; keeps queries warm and avoids reconnect storms
try:
    pool = ConnectionPool(
        conninfo=_get_database_url(),
        min_size=0,
        max_size=5,
        timeout=5,
        open=False,
        kwargs={"connect_timeout": 3},
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
            with pool.connection(timeout=2) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
        except Exception as exc:  # pragma: no cover - defensive
            status = "degraded"
            db_state = f"error: {exc}"

    return {"status": status, "engine": "GraphCast-V3-Core", "db": db_state}


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
        raise HTTPException(status_code=502, detail=f"DB query failed: {exc}")

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
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT") or os.getenv("VITE_AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("VITE_AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION") or os.getenv("VITE_AZURE_OPENAI_API_VERSION")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT") or os.getenv("VITE_AZURE_OPENAI_DEPLOYMENT")
    model_name = os.getenv("AZURE_OPENAI_MODEL_NAME") or os.getenv("VITE_AZURE_OPENAI_MODEL_NAME")

    if not endpoint or not api_key:
        raise HTTPException(status_code=503, detail="Azure OpenAI is not configured on the backend")

    if not api_version:
        api_version = "2024-12-01-preview"
    if not deployment:
        deployment = model_name or "gpt-4o-mini"

    clean_base = endpoint.strip()
    if clean_base.endswith("/"):
        clean_base = clean_base[:-1]

    url = f"{clean_base}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"

    payload = {
        "messages": [
            {
                "role": "system",
                "content": "You are an expert weather and public health risk analyst for Africa.",
            },
            {"role": "user", "content": req.prompt},
        ],
        "max_tokens": 1200,
        "temperature": 0.4,
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(url, headers={"api-key": api_key, "Content-Type": "application/json"}, json=payload)
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Azure OpenAI error: {r.status_code} {r.text}")
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        return {"provider": "azure_openai", "deployment": deployment, "text": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


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
    uvicorn.run(app, host="0.0.0.0", port=8000)
