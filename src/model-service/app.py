from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
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

        threats.append(
            {
                "id": external_id or f"{source}-{event_at.isoformat() if event_at else _utc_now_iso()}",
                "threat_type": hazard_type or "unknown",
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

    return {
        "timestamp": _utc_now_iso(),
        "threats": threats,
        "count": len(threats),
        "sources": sorted({t["detection_details"]["source"] for t in threats if t["detection_details"].get("source")}),
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
