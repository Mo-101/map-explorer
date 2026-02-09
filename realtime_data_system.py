"""
AFRO STORM - REAL-TIME DYNAMIC DATA SYSTEM
------------------------------------------
Generates and evolves threats continuously (no static mocks).
"""

import asyncio
import math
import random
import os
from datetime import datetime
from typing import List, Dict, Optional, Tuple
import logging
from dataclasses import dataclass, asdict

from dotenv import load_dotenv

# Optional: plug OpenWeather once a key is set
try:
    import requests  # noqa: F401
except Exception:  # pragma: no cover
    requests = None  # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------

# load .env.local so we can reuse frontend keys for backend
load_dotenv(".env.local")

OPENWEATHER_API_KEY = (
    os.getenv("OPENWEATHER_API_KEY")
    or os.getenv("VITE_OPENWEATHER_API")
    or ""
)
OPENWEATHER_ENABLED = bool(OPENWEATHER_API_KEY)

THREAT_UPDATE_INTERVAL = 30  # seconds
INTENSITY_CHANGE_RATE = 0.05

# -----------------------------------------------------------------------------
# DATA MODEL
# -----------------------------------------------------------------------------


@dataclass
class DynamicThreat:
    id: str
    threat_type: str
    risk_level: str
    center_lat: float
    center_lng: float
    affected_regions: List[str]
    lead_time_days: float
    confidence: float
    detection_details: Dict
    timestamp: str
    movement_vector: Tuple[float, float]
    intensity: float
    age_hours: float

    def update(self):
        # Move
        self.center_lat += self.movement_vector[0]
        self.center_lng += self.movement_vector[1]

        # Intensity evolution
        if self.threat_type == "cyclone":
            self._update_cyclone_intensity()
        elif self.threat_type == "lassa":
            self._update_lassa_intensity()
        elif self.threat_type == "meningitis":
            self._update_meningitis_intensity()
        elif self.threat_type == "cholera":
            self._update_cholera_intensity()

        # Age and lead time
        self.age_hours += THREAT_UPDATE_INTERVAL / 3600
        if self.lead_time_days > 0:
            self.lead_time_days = max(0, self.lead_time_days - THREAT_UPDATE_INTERVAL / 86400)

        # Risk level
        self._update_risk_level()
        self.timestamp = datetime.utcnow().isoformat()

    def _update_cyclone_intensity(self):
        self.intensity *= (1.0 - INTENSITY_CHANGE_RATE * random.uniform(0.5, 1.5))
        self.detection_details["wind_speed"] = int(120 * self.intensity)
        self.detection_details["mslp"] = int(1000 - 15 * self.intensity)

    def _update_lassa_intensity(self):
        rain = self.detection_details.get("rainfall_24h", 60)
        self.detection_details["rainfall_24h"] = rain * random.uniform(0.95, 1.1)
        self.intensity = min(1.0, self.intensity + INTENSITY_CHANGE_RATE * 0.5)

    def _update_meningitis_intensity(self):
        humidity = self.detection_details.get("humidity", 22)
        self.detection_details["humidity"] = humidity * random.uniform(0.9, 1.1)
        self.intensity = max(0.3, 1.0 - (humidity / 50))

    def _update_cholera_intensity(self):
        pop = self.detection_details.get("population_at_risk", 2_000_000)
        self.detection_details["population_at_risk"] = int(pop * random.uniform(0.95, 1.05))
        self.detection_details["water_contamination_probability"] = min(0.95, self.intensity * 0.9)

    def _update_risk_level(self):
        if self.intensity > 0.8:
            self.risk_level = "severe"
        elif self.intensity > 0.6:
            self.risk_level = "high"
        elif self.intensity > 0.4:
            self.risk_level = "moderate"
        else:
            self.risk_level = "low"

    def should_expire(self) -> bool:
        return self.intensity < 0.2 or self.age_hours > 240  # ~10 days

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "threat_type": self.threat_type,
            "risk_level": self.risk_level,
            "center_lat": round(self.center_lat, 4),
            "center_lng": round(self.center_lng, 4),
            "affected_regions": self.affected_regions,
            "lead_time_days": round(self.lead_time_days, 1),
            "confidence": round(self.confidence, 2),
            "detection_details": self.detection_details,
            "timestamp": self.timestamp,
        }


# -----------------------------------------------------------------------------
# MANAGER
# -----------------------------------------------------------------------------


class RealTimeThreatManager:
    def __init__(self):
        self.threats: Dict[str, DynamicThreat] = {}
        self.threat_counter = 0
        self.last_spawn_time = datetime.utcnow()
        self._spawn_initial_threats()

    # Spawn helpers -----------------------------------------------------------
    def _spawn_initial_threats(self):
        logger.info("Spawning initial real-time threats...")
        self._spawn_cyclone((-18.5, 45.0), 0.85, (-0.05, 0.02))
        self._spawn_lassa((6.5, 3.4), 0.75, (0.01, 0.01))
        self._spawn_meningitis((13.5, 2.1), 0.65, (0.02, -0.01))
        self._spawn_cholera((-1.3, 36.8), 0.78, (0.0, 0.0))

    def _spawn_cyclone(self, center, intensity, movement):
        self._spawn(
            "cyclone",
            center,
            intensity,
            movement,
            lead_time_days=3,
            details={
                "mslp": int(1000 - 15 * intensity),
                "wind_speed": int(120 * intensity),
                "vorticity": round(0.001 * intensity, 4),
                "source": "AFRO STORM Real-Time Simulation",
            },
        )

    def _spawn_lassa(self, center, intensity, movement):
        self._spawn(
            "lassa",
            center,
            intensity,
            movement,
            lead_time_days=7,
            details={
                "rainfall_24h": 60 + random.uniform(0, 20),
                "rodent_displacement_risk": "high",
                "belt_zone": "Lassa Heartland",
                "source": "AFRO STORM LassaSentinel",
            },
        )

    def _spawn_meningitis(self, center, intensity, movement):
        self._spawn(
            "meningitis",
            center,
            intensity,
            movement,
            lead_time_days=14,
            details={
                "humidity": 20 + random.uniform(0, 10),
                "dust_concentration": "high",
                "harmattan_conditions": True,
                "belt_zone": "Sahel Meningitis Corridor",
                "source": "AFRO STORM MeningitisWatcher",
            },
        )

    def _spawn_cholera(self, center, intensity, movement):
        self._spawn(
            "cholera",
            center,
            intensity,
            movement,
            lead_time_days=5,
            details={
                "flood_risk": "severe" if intensity > 0.7 else "high",
                "water_contamination_probability": round(intensity * 0.9, 2),
                "population_at_risk": int(2_000_000 * intensity),
                "source": "AFRO STORM CholeraGuardian",
            },
        )

    def _spawn(self, threat_type, center, intensity, movement, lead_time_days, details):
        self.threat_counter += 1
        threat_id = f"{threat_type}-{self.threat_counter:04d}"
        risk = "severe" if intensity > 0.8 else "high" if intensity > 0.6 else "moderate"
        threat = DynamicThreat(
            id=threat_id,
            threat_type=threat_type,
            risk_level=risk,
            center_lat=center[0],
            center_lng=center[1],
            affected_regions=self._regions_for(center),
            lead_time_days=lead_time_days,
            confidence=min(0.95, 0.6 + random.random() * 0.35),
            detection_details=details,
            timestamp=datetime.utcnow().isoformat(),
            movement_vector=movement,
            intensity=intensity,
            age_hours=0.0,
        )
        self.threats[threat_id] = threat
        logger.info("Spawned %s at (%.2f, %.2f)", threat_id, center[0], center[1])

    def _regions_for(self, center: Tuple[float, float]) -> List[str]:
        lat, lng = center
        if -5 < lat < 5 and 35 < lng < 42:
            return ["Kenya", "Uganda", "Tanzania"]
        if 4 < lat < 15 and -5 < lng < 10:
            return ["Nigeria", "Ghana", "Benin", "Togo"]
        if -35 < lat < -15 and 20 < lng < 35:
            return ["South Africa", "Mozambique", "Zimbabwe"]
        if 10 < lat < 18 and -10 < lng < 15:
            return ["Niger", "Chad", "Mali", "Burkina Faso"]
        if -25 < lat < -12 and 43 < lng < 50:
            return ["Madagascar", "Mauritius", "Reunion"]
        return ["Central Africa"]

    # Updates -----------------------------------------------------------------
    def update_all(self):
        expired = []
        for tid, threat in list(self.threats.items()):
            threat.update()
            if threat.should_expire():
                expired.append(tid)
        for tid in expired:
            self.threats.pop(tid, None)
            logger.info("Expired %s", tid)

        self._maybe_spawn_new()
        logger.info("Updated %d active threats", len(self.threats))

    def _maybe_spawn_new(self):
        if len(self.threats) > 10:
            return
        since = (datetime.utcnow() - self.last_spawn_time).total_seconds() / 3600
        if since > 6 and random.random() < 0.2:
            threat_types = ["cyclone", "lassa", "meningitis", "cholera"]
            ttype = random.choice(threat_types)
            lat = random.uniform(-30, 15)
            lng = random.uniform(-15, 50)
            intensity = random.uniform(0.5, 0.9)
            movement = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1))
            if ttype == "cyclone":
                self._spawn_cyclone((lat, lng), intensity, movement)
            elif ttype == "lassa":
                self._spawn_lassa((lat, lng), intensity, movement)
            elif ttype == "meningitis":
                self._spawn_meningitis((lat, lng), intensity, movement)
            else:
                self._spawn_cholera((lat, lng), intensity, movement)
            self.last_spawn_time = datetime.utcnow()

    # Accessors ---------------------------------------------------------------
    def get_all(self) -> List[Dict]:
        return [t.to_dict() for t in self.threats.values()]

    def get_by_type(self, threat_type: str) -> List[Dict]:
        return [t.to_dict() for t in self.threats.values() if t.threat_type == threat_type]


# -----------------------------------------------------------------------------
# OPTIONAL: OpenWeather enrichment (placeholder, disabled by default)
# -----------------------------------------------------------------------------

class OpenWeatherIntegration:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openweathermap.org/data/2.5"

    def get_weather(self, lat: float, lon: float) -> Optional[Dict]:
        if not requests:
            return None
        try:
            r = requests.get(
                f"{self.base_url}/weather",
                params={"lat": lat, "lon": lon, "appid": self.api_key, "units": "metric"},
                timeout=5,
            )
            if r.status_code == 200:
                return r.json()
        except Exception:  # pragma: no cover
            return None
        return None

    def enrich(self, threat: DynamicThreat):
        data = self.get_weather(threat.center_lat, threat.center_lng)
        if not data:
            return
        threat.detection_details.update(
            {
                "real_temperature": data.get("main", {}).get("temp"),
                "real_humidity": data.get("main", {}).get("humidity"),
                "real_pressure": data.get("main", {}).get("pressure"),
                "real_wind_speed": data.get("wind", {}).get("speed"),
                "weather_source": "OpenWeather",
            }
        )


# -----------------------------------------------------------------------------
# GLOBALS
# -----------------------------------------------------------------------------

threat_manager = RealTimeThreatManager()
weather_integration = OpenWeatherIntegration(OPENWEATHER_API_KEY) if OPENWEATHER_ENABLED else None


async def continuous_threat_updates():
    logger.info("Starting continuous threat updates (every %ss)...", THREAT_UPDATE_INTERVAL)
    while True:
        try:
            threat_manager.update_all()
            if weather_integration:
                for threat in threat_manager.threats.values():
                    weather_integration.enrich(threat)
        except Exception as exc:  # pragma: no cover
            logger.error("Error in threat updates: %s", exc)
        await asyncio.sleep(THREAT_UPDATE_INTERVAL)


def get_realtime_threats() -> List[Dict]:
    return threat_manager.get_all()


def get_realtime_threats_by_type(threat_type: str) -> List[Dict]:
    return threat_manager.get_by_type(threat_type)


logger.info("🔥 Real-time threat system initialized (interval=%ss)", THREAT_UPDATE_INTERVAL)
