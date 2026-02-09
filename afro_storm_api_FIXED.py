# Auto-generated AFRO STORM API (mock-first with optional Postgres)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio
import json
import logging
from contextlib import asynccontextmanager

# ============================================================================
# CONFIGURATION
# ============================================================================

# Database settings (OPTIONAL)
ENABLE_DATABASE = False  # Set to True when DB is ready
DATABASE_URL = "postgresql://dunoamtpmx:afro2025%40@afro-server.postgres.database.azure.com:5432/postgres"

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# FASTAPI APP
# ============================================================================

app = FastAPI(
    title="AFRO STORM API",
    description="Health Intelligence & Weather Convergence System for Africa",
    version="2.0.0",
)

# CORS - Allow frontend to connect
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

# ============================================================================
# DATA MODELS
# ============================================================================

class HealthThreat(BaseModel):
    id: str
    threat_type: str
    risk_level: str
    center_lat: float
    center_lng: float
    affected_regions: List[str]
    lead_time_days: int
    confidence: float
    detection_details: Optional[Dict[str, Any]] = None
    timestamp: str

class ThreatsResponse(BaseModel):
    timestamp: str
    threats: List[HealthThreat]
    count: int
    source: str  # "mock" or "graphcast"
    backend_available: bool

# ============================================================================
# MOCK DATA
# ============================================================================

def generate_mock_threats() -> List[HealthThreat]:
    now = datetime.utcnow()
    return [
        HealthThreat(
            id="threat-001",
            threat_type="cyclone",
            risk_level="severe",
            center_lat=-20.5,
            center_lng=40.2,
            affected_regions=["Mozambique", "Malawi", "Zimbabwe"],
            lead_time_days=3,
            confidence=0.87,
            detection_details={
                "mslp": 985,
                "wind_speed": 120,
                "vorticity": 0.0012,
                "source": "GraphCast 10-day forecast",
            },
            timestamp=now.isoformat(),
        ),
        HealthThreat(
            id="threat-002",
            threat_type="lassa",
            risk_level="high",
            center_lat=6.5244,
            center_lng=3.3792,
            affected_regions=["Lagos", "Edo", "Ondo", "Ebonyi"],
            lead_time_days=7,
            confidence=0.73,
            detection_details={
                "rainfall_24h": 68.5,
                "rodent_displacement_risk": "high",
                "belt_zone": "Lassa Heartland",
                "source": "AFRO STORM LassaSentinel",
            },
            timestamp=now.isoformat(),
        ),
        HealthThreat(
            id="threat-003",
            threat_type="meningitis",
            risk_level="moderate",
            center_lat=13.5127,
            center_lng=2.1128,
            affected_regions=["Niger", "Chad", "Northern Nigeria", "Burkina Faso"],
            lead_time_days=14,
            confidence=0.69,
            detection_details={
                "humidity": 22.5,
                "dust_concentration": "high",
                "harmattan_conditions": True,
                "belt_zone": "Sahel Meningitis Corridor",
                "source": "AFRO STORM MeningitisWatcher",
            },
            timestamp=now.isoformat(),
        ),
        HealthThreat(
            id="threat-004",
            threat_type="cholera",
            risk_level="high",
            center_lat=-1.2864,
            center_lng=36.8172,
            affected_regions=["Nairobi", "Mombasa", "Kisumu"],
            lead_time_days=5,
            confidence=0.78,
            detection_details={
                "flood_risk": "severe",
                "water_contamination_probability": 0.82,
                "population_at_risk": 2_500_000,
                "source": "AFRO STORM CholeraGuardian",
            },
            timestamp=now.isoformat(),
        ),
        HealthThreat(
            id="threat-005",
            threat_type="cyclone",
            risk_level="high",
            center_lat=-25.7479,
            center_lng=28.2293,
            affected_regions=["Johannesburg", "Pretoria", "Durban"],
            lead_time_days=4,
            confidence=0.71,
            detection_details={
                "mslp": 992,
                "wind_speed": 95,
                "vorticity": 0.0009,
                "source": "GraphCast 10-day forecast",
            },
            timestamp=now.isoformat(),
        ),
    ]

# ============================================================================
# DATABASE CONNECTION (OPTIONAL)
# ============================================================================

async def get_threats_from_database() -> List[HealthThreat]:
    if not ENABLE_DATABASE:
        logger.info("📦 Database disabled, using mock data")
        return generate_mock_threats()

    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, threat_type, risk_level, center_lat, center_lng,
                           affected_regions, lead_time_days, confidence,
                           detection_details, timestamp
                    FROM health_threats
                    WHERE timestamp > NOW() - INTERVAL '24 hours'
                    ORDER BY confidence DESC
                    LIMIT 20
                    """
                )
                rows = cur.fetchall()

        threats = [HealthThreat(**row) for row in rows]
        logger.info(f"✅ Fetched {len(threats)} threats from database")
        return threats
    except Exception as e:
        logger.warning(f"⚠️ Database connection failed: {e}")
        logger.info("📦 Falling back to mock data")
        return generate_mock_threats()

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    return {
        "service": "AFRO STORM API",
        "version": "2.0.0",
        "status": "operational",
        "description": "Health Intelligence & Weather Convergence for Africa",
        "endpoints": {
            "health": "/health",
            "threats": "/api/v1/threats",
            "threats_by_type": "/api/v1/threats/{type}",
            "websocket": "/ws/threats",
        },
        "database": "connected" if ENABLE_DATABASE else "mock_mode",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected" if ENABLE_DATABASE else "mock_mode",
    }

@app.get("/api/v1/threats", response_model=ThreatsResponse)
async def get_all_threats():
    threats = await get_threats_from_database()
    return ThreatsResponse(
        timestamp=datetime.utcnow().isoformat(),
        threats=threats,
        count=len(threats),
        source="mock" if not ENABLE_DATABASE else "graphcast",
        backend_available=True,
    )

@app.get("/api/v1/threats/{threat_type}", response_model=ThreatsResponse)
async def get_threats_by_type(threat_type: str):
    valid_types = ["cyclone", "lassa", "meningitis", "cholera"]
    if threat_type.lower() not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid threat type. Must be one of: {', '.join(valid_types)}",
        )

    all_threats = await get_threats_from_database()
    filtered = [t for t in all_threats if t.threat_type.lower() == threat_type.lower()]
    return ThreatsResponse(
        timestamp=datetime.utcnow().isoformat(),
        threats=filtered,
        count=len(filtered),
        source="mock" if not ENABLE_DATABASE else "graphcast",
        backend_available=True,
    )

# ============================================================================
# WEBSOCKET - Real-time threat updates
# ============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"🔌 WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"🔌 WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"❌ Failed to send to client: {e}")
                dead.append(connection)
        for conn in dead:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

manager = ConnectionManager()

@app.websocket("/ws/threats")
async def websocket_threats(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            threats = await get_threats_from_database()
            message = {
                "type": "threat_update",
                "timestamp": datetime.utcnow().isoformat(),
                "threats": [t.dict() for t in threats],
                "count": len(threats),
            }
            await websocket.send_json(message)
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("🔌 Client disconnected")
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")
        manager.disconnect(websocket)

# ============================================================================
# EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    logger.info("🔥 AFRO STORM API starting...")
    logger.info(f"📊 Database mode: {'ENABLED' if ENABLE_DATABASE else 'MOCK'}")
    logger.info("✅ Server ready on http://0.0.0.0:8000")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 AFRO STORM API shutting down...")

# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=False,
    )
