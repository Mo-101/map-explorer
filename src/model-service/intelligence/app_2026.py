"""
AFRO STORM - Auto-Scanning Situational Intelligence
===================================================

Features:
- Automatic scanning of ALL threat types
- Real-time analytics output
- Comprehensive situational markers
- MoScripts voice lines for each threat type
"""

import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from situational_intelligence_complete import ComprehensiveSituationalAnalyzer
    from realtime_data_service import RealtimeWeatherService

    INTELLIGENCE_AVAILABLE = True
    print("🔥 [AFRO STORM] Complete intelligence system loaded")
except ImportError as e:
    print(f"⚠️  [AFRO STORM] Intelligence unavailable: {e}")
    INTELLIGENCE_AVAILABLE = False


for _stream in (sys.stdout, sys.stderr):
    if _stream and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


class SituationalMarker(BaseModel):
    id: str
    type: str
    location: str
    lat: float
    lng: float
    status: str
    description: str
    context: str
    factors: List[str]
    timestamp: str
    confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class AnalyticsOutput(BaseModel):
    total_threats: int
    by_type: Dict[str, int]
    by_severity: Dict[str, int]
    regions_affected: List[str]
    timestamp: str


class ComprehensiveSituationalResponse(BaseModel):
    timestamp: str
    markers: List[SituationalMarker]
    analytics: AnalyticsOutput
    count: int
    mode: str = "analysis"
    system: str = "AFRO STORM Multi-Threat Intelligence v2.0"
    moscripts_voice: str
    detailed_voices: List[str]


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🔥 [AFRO STORM] Auto-scanning system starting...")

    if INTELLIGENCE_AVAILABLE:
        app.state.analyzer = ComprehensiveSituationalAnalyzer()
        app.state.weather_service = RealtimeWeatherService()
        print("✅ [Intelligence] Multi-threat analyzer initialized")
        print("✅ [Scanner] Auto-scanning: Cyclone, Flood, Wildfire, Landslide, Drought, Disease")

    yield

    print("🔥 [AFRO STORM] Shutting down...")


app = FastAPI(
    title="AFRO STORM Auto-Scanning API",
    description="Automatic Multi-Threat Situational Intelligence for Africa",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/")
async def health_check():
    return {
        "status": "healthy",
        "service": "AFRO STORM Auto-Scanning",
        "version": "2.0.0",
        "mode": "analysis",
        "features": [
            "cyclone_detection",
            "flood_analysis",
            "wildfire_risk",
            "landslide_monitoring",
            "drought_tracking",
            "disease_surveillance",
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "intelligence": INTELLIGENCE_AVAILABLE,
    }


@app.get("/api/v1/situational-markers", response_model=ComprehensiveSituationalResponse)
async def get_comprehensive_situational_intelligence(
    region: str = "Africa",
    threat_types: Optional[str] = None,
):
    if not INTELLIGENCE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Intelligence system not available")

    try:
        weather_service: RealtimeWeatherService = app.state.weather_service
        current_data = await weather_service.get_current_conditions(region)

        analyzer: ComprehensiveSituationalAnalyzer = app.state.analyzer
        result = await analyzer.analyze_all_threats(current_data)

        if threat_types:
            requested_types = set([t.strip() for t in threat_types.lower().split(",") if t.strip()])
            result["markers"] = [
                m
                for m in result["markers"]
                if any(req_type in str(m.get("type", "")).lower() for req_type in requested_types)
            ]

        print(f"🗺️ [Analytics] Detected {result['analytics']['total_threats']} threats")
        print(f"   By type: {result['analytics']['by_type']}")
        print(f"   Regions: {len(result['analytics']['regions_affected'])}")

        return ComprehensiveSituationalResponse(
            timestamp=datetime.now(timezone.utc).isoformat(),
            markers=result["markers"],
            analytics=AnalyticsOutput(**result["analytics"]),
            count=len(result["markers"]),
            mode="analysis",
            system="AFRO STORM Multi-Threat Intelligence v2.0",
            moscripts_voice=result["moscripts_voice"],
            detailed_voices=result["detailed_voices"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-threat analysis failed: {str(e)}")


@app.get("/api/v1/analytics/summary")
async def get_analytics_summary():
    if not INTELLIGENCE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Intelligence unavailable")

    try:
        weather_service: RealtimeWeatherService = app.state.weather_service
        analyzer: ComprehensiveSituationalAnalyzer = app.state.analyzer

        data = await weather_service.get_current_conditions("Africa")
        result = await analyzer.analyze_all_threats(data)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "analytics": result["analytics"],
            "moscripts_voice": result["moscripts_voice"],
            "threat_types_active": [
                k for k, v in (result["analytics"].get("by_type", {}) or {}).items() if int(v) > 0
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/threats/cyclones")
async def get_cyclone_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="cyclone")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats/floods")
async def get_flood_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="flood")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats/wildfires")
async def get_wildfire_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="wildfire")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats/landslides")
async def get_landslide_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="landslide")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats/droughts")
async def get_drought_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="drought")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats/diseases")
async def get_disease_markers():
    result = await get_comprehensive_situational_intelligence(threat_types="disease")
    return {"markers": result.markers, "count": len(result.markers)}


@app.get("/api/v1/threats")
async def get_threats_legacy():
    result = await get_comprehensive_situational_intelligence()

    threats = [
        {
            "id": m.id,
            "threat_type": m.type,
            "risk_level": _status_to_risk(m.status),
            "affected_regions": [m.location],
            "lead_time_days": None,
            "confidence": m.confidence,
            "center_lat": m.lat,
            "center_lng": m.lng,
            "detection_details": {
                "description": m.description,
                "context": m.context,
                "factors": m.factors,
                "metadata": m.metadata,
            },
            "created_at": m.timestamp,
        }
        for m in result.markers
    ]

    return {
        "timestamp": result.timestamp,
        "threats": threats,
        "count": result.count,
        "sources": ["AFRO STORM Multi-Threat Intelligence"],
        "model_version": "2.0.0",
    }


def _status_to_risk(status: str) -> str:
    mapping = {
        "ACTIVE NOW": "high",
        "MONITORING": "moderate",
        "UNUSUAL": "moderate",
        "SITUATIONAL": "low",
    }
    return mapping.get(status, "low")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app_2026:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )
