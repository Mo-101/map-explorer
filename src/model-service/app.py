from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import time

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

@app.get("/health")
def health():
    return {"status": "healthy", "engine": "GraphCast-V3-Core"}


@app.get("/api/v1/health")
def health_v1():
    return {"status": "healthy", "engine": "GraphCast-V3-Core"}


def generate_mock_threats():
    """Return deterministic mock threats so UI stays stable when real ingestion is offline."""
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    threats = [
        {
            "id": "cyclone-001",
            "threat_type": "cyclone",
            "risk_level": "severe",
            "affected_regions": ["Mozambique", "Madagascar", "Malawi"],
            "lead_time_days": 3,
            "confidence": 0.92,
            "center_lat": -19.5,
            "center_lng": 36.5,
            "detection_details": {
                "name": "Tropical Cyclone Freddy",
                "min_pressure_hpa": 945,
                "max_wind_speed_ms": 55,
                "category": "Category 4",
                "landfall_prediction": "2023-10-25T14:00:00Z",
                "population_at_risk": 2_500_000,
            },
            "created_at": now,
        },
        {
            "id": "cholera-001",
            "threat_type": "cholera",
            "risk_level": "high",
            "affected_regions": ["Beira", "Sofala Province", "Cabo Delgado"],
            "lead_time_days": 7,
            "confidence": 0.78,
            "center_lat": -19.8,
            "center_lng": 34.9,
            "detection_details": {
                "trigger": "Cyclone + Flooding",
                "predicted_cases": 5000,
                "sanitation_risk": "Critical",
                "water_contamination_probability": 0.85,
                "recommended_action": "Pre-position cholera kits, activate oral rehydration points",
            },
            "created_at": now,
        },
        {
            "id": "lassa-001",
            "threat_type": "lassa",
            "risk_level": "moderate",
            "affected_regions": ["Edo State", "Ondo State", "Ebonyi State"],
            "lead_time_days": 14,
            "confidence": 0.65,
            "center_lat": 6.5,
            "center_lng": 5.6,
            "detection_details": {
                "trigger": "Dry season rodent migration pattern",
                "predicted_cases": 200,
                "season_factor": "Peak dry season (Dec-April)",
                "recommended_action": "Enhanced surveillance, rodent control measures",
            },
            "created_at": now,
        },
        {
            "id": "meningitis-001",
            "threat_type": "meningitis",
            "risk_level": "moderate",
            "affected_regions": ["Niger", "Chad", "Northern Nigeria", "Cameroon"],
            "lead_time_days": 30,
            "confidence": 0.71,
            "center_lat": 13.5,
            "center_lng": 13.0,
            "detection_details": {
                "trigger": "Harmattan winds + Low humidity forecast",
                "predicted_cases": 1500,
                "vaccination_gap": "32% coverage in high-risk districts",
                "recommended_action": "Mass vaccination campaign preparation",
            },
            "created_at": now,
        },
        {
            "id": "flood-001",
            "threat_type": "flood",
            "risk_level": "high",
            "affected_regions": ["Nile Delta", "Khartoum", "South Sudan"],
            "lead_time_days": 5,
            "confidence": 0.83,
            "center_lat": 15.5,
            "center_lng": 32.5,
            "detection_details": {
                "trigger": "Heavy rainfall + Ethiopian highlands runoff",
                "river_level_rise": "3.2 meters predicted",
                "affected_population": 850_000,
                "recommended_action": "Evacuation planning, medical supply pre-positioning",
            },
            "created_at": now,
        },
    ]

    return {
        "timestamp": now,
        "threats": threats,
        "count": len(threats),
        "sources": ["graphcast", "ecmwf", "gdacs"],
        "model_version": "GraphCast_operational_v1",
    }


@app.get("/api/v1/threats")
def get_threats():
    """Serve mock threats until ingestion worker populates real data."""
    return generate_mock_threats()


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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
