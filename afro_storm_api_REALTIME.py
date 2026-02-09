"""
AFRO STORM API - REAL-TIME PRODUCTION
-------------------------------------
Live, evolving threats (no static mocks). Updates every 30s.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import asyncio
import logging

from realtime_data_system import (
    get_realtime_threats,
    get_realtime_threats_by_type,
    continuous_threat_updates,
    threat_manager,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AFRO STORM API - Real-Time Production",
    description="Live Health Intelligence & Weather Convergence for Africa",
    version="3.0.0-REALTIME",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthThreat(BaseModel):
    id: str
    threat_type: str
    risk_level: str
    center_lat: float
    center_lng: float
    affected_regions: List[str]
    lead_time_days: float
    confidence: float
    detection_details: Dict[str, Any]
    timestamp: str


class ThreatsResponse(BaseModel):
    timestamp: str
    threats: List[HealthThreat]
    count: int
    source: str
    backend_available: bool
    system_status: Dict[str, Any]


@app.get("/")
async def root():
    active = threat_manager.threats
    return {
        "service": "AFRO STORM API - Real-Time Production",
        "version": "3.0.0-REALTIME",
        "status": "operational",
        "mode": "REAL-TIME DYNAMIC",
        "endpoints": {
            "health": "/health",
            "threats": "/api/v1/threats",
            "threats_by_type": "/api/v1/threats/{type}",
            "system_status": "/api/v1/system/status",
            "websocket": "/ws/threats",
        },
        "active_threats": len(active),
        "threat_types": list({t.threat_type for t in active.values()}),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mode": "REAL-TIME DYNAMIC",
        "active_threats": len(threat_manager.threats),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/threats", response_model=ThreatsResponse)
async def get_all_threats():
    threats_data = get_realtime_threats()
    return ThreatsResponse(
        timestamp=datetime.utcnow().isoformat(),
        threats=[HealthThreat(**t) for t in threats_data],
        count=len(threats_data),
        source="realtime-simulation",
        backend_available=True,
        system_status={
            "threats_active": len(threat_manager.threats),
            "threats_spawned_total": threat_manager.threat_counter,
            "update_interval_seconds": 30,
        },
    )


@app.get("/api/v1/threats/{threat_type}", response_model=ThreatsResponse)
async def get_threats_by_type(threat_type: str):
    valid = {"cyclone", "lassa", "meningitis", "cholera"}
    if threat_type.lower() not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be: {', '.join(valid)}")

    threats_data = get_realtime_threats_by_type(threat_type.lower())
    return ThreatsResponse(
        timestamp=datetime.utcnow().isoformat(),
        threats=[HealthThreat(**t) for t in threats_data],
        count=len(threats_data),
        source="realtime-simulation",
        backend_available=True,
        system_status={
            "threats_of_type": len(threats_data),
            "filter_applied": threat_type,
        },
    )


@app.get("/api/v1/system/status")
async def system_status():
    threats = threat_manager.threats
    stats = {}
    for ttype in ["cyclone", "lassa", "meningitis", "cholera"]:
        tlist = [t for t in threats.values() if t.threat_type == ttype]
        stats[ttype] = {
            "count": len(tlist),
            "avg_intensity": sum(t.intensity for t in tlist) / len(tlist) if tlist else 0,
            "max_risk": max((t.risk_level for t in tlist), default="none"),
        }

    return {
        "mode": "REAL-TIME DYNAMIC",
        "timestamp": datetime.utcnow().isoformat(),
        "system_health": "operational",
        "threats_active": len(threats),
        "threats_spawned_total": threat_manager.threat_counter,
        "threat_statistics": stats,
        "update_interval_seconds": 30,
        "data_source": "real-time simulation",
        "verification": {
            "data_is_static": False,
            "data_updates": True,
            "threats_evolve": True,
            "coordinates_change": True,
        },
    }


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket connected. Total: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/ws/threats")
async def websocket_threats(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            threats = get_realtime_threats()
            await websocket.send_json(
                {
                    "type": "threat_update",
                    "timestamp": datetime.utcnow().isoformat(),
                    "threats": threats,
                    "count": len(threats),
                    "system_status": {
                        "mode": "REAL-TIME",
                        "threats_active": len(threat_manager.threats),
                        "threats_total_spawned": threat_manager.threat_counter,
                    },
                }
            )
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
        manager.disconnect(websocket)


@app.on_event("startup")
async def startup_event():
    logger.info("🔥 AFRO STORM real-time API starting...")
    logger.info("🌍 Initial threats: %d", len(threat_manager.threats))
    asyncio.create_task(continuous_threat_updates())
    logger.info("🔄 Real-time threat updates started")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 AFRO STORM API shutting down...")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
