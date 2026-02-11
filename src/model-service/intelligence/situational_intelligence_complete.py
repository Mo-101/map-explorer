"""AFRO STORM - Complete Situational Intelligence Modules"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _severity_from_status(status: str) -> str:
    if status == "ACTIVE NOW":
        return "high"
    if status in ("MONITORING", "UNUSUAL"):
        return "moderate"
    return "low"


class ComprehensiveSituationalAnalyzer:
    async def analyze_all_threats(self, data: Dict[str, Any]) -> Dict[str, Any]:
        region = str(data.get("region", "Unknown"))
        lat = float(data.get("lat", 0.0))
        lng = float(data.get("lng", 0.0))

        markers: List[Dict[str, Any]] = []
        voices: List[str] = []

        def add_marker(
            threat_type: str,
            status: str,
            description: str,
            context: str,
            factors: List[str],
            confidence: float,
            metadata: Dict[str, Any] | None = None,
        ) -> None:
            markers.append(
                {
                    "id": f"{threat_type}-{datetime.now().timestamp()}",
                    "type": threat_type,
                    "location": region,
                    "lat": lat,
                    "lng": lng,
                    "status": status,
                    "description": description,
                    "context": context,
                    "factors": factors,
                    "timestamp": _now_iso(),
                    "confidence": confidence,
                    "metadata": metadata or {},
                }
            )

        rainfall_72h = float(data.get("rainfall_72h", 0) or 0)
        wind_speed = float(data.get("wind_speed", 0) or 0)
        temperature = float(data.get("temperature", 0) or 0)
        humidity = float(data.get("humidity", 0) or 0)
        pressure = float(data.get("pressure", 0) or 0)
        soil_saturation = float(data.get("soil_saturation", 0) or 0)
        elevation = float(data.get("elevation", 0) or 0)
        river_proximity = float(data.get("river_proximity", 0) or 0)

        # Cyclone / rotating wind pattern proxy
        if wind_speed >= 60:
            add_marker(
                "cyclonic_pattern",
                "ACTIVE NOW",
                f"High winds detected: {wind_speed:.0f} km/h",
                "Wind field suggests a potentially organized circulation pattern.",
                ["high_wind"],
                0.8,
                {"wind_speed": wind_speed, "pressure": pressure},
            )
            voices.append("Cyclonic pattern proxy: high wind field present.")
        elif wind_speed >= 40:
            add_marker(
                "cyclonic_pattern",
                "MONITORING",
                f"Elevated winds detected: {wind_speed:.0f} km/h",
                "Wind field is elevated; monitoring for persistence and structure.",
                ["elevated_wind"],
                0.6,
                {"wind_speed": wind_speed, "pressure": pressure},
            )
            voices.append("Cyclonic pattern proxy: elevated winds.")

        # Flood risk
        if rainfall_72h >= 150:
            add_marker(
                "flood_risk",
                "ACTIVE NOW",
                f"72h rainfall accumulation: {rainfall_72h:.0f} mm",
                "Accumulation is high; conditions consistent with elevated runoff potential.",
                ["heavy_rain", "runoff_potential"],
                0.85,
                {"rainfall_72h": rainfall_72h, "river_proximity": river_proximity},
            )
            voices.append("Flood risk proxy: very high 72h rainfall.")
        elif rainfall_72h >= 100:
            add_marker(
                "flood_risk",
                "MONITORING",
                f"72h rainfall accumulation: {rainfall_72h:.0f} mm",
                "Accumulation is elevated; monitoring hydrology indicators.",
                ["elevated_rain"],
                0.65,
                {"rainfall_72h": rainfall_72h, "river_proximity": river_proximity},
            )
            voices.append("Flood risk proxy: elevated 72h rainfall.")

        # Wildfire risk proxy
        if temperature >= 38 and humidity <= 30:
            add_marker(
                "wildfire_risk",
                "ACTIVE NOW",
                f"Hot/dry conditions: {temperature:.0f}°C, RH {humidity:.0f}%",
                "Hot and dry conditions can increase ignition/spread potential.",
                ["heat", "low_humidity"],
                0.75,
                {"temperature": temperature, "humidity": humidity},
            )
            voices.append("Wildfire risk proxy: hot/dry combination present.")
        elif temperature >= 34 and humidity <= 40:
            add_marker(
                "wildfire_risk",
                "MONITORING",
                f"Warm/dry conditions: {temperature:.0f}°C, RH {humidity:.0f}%",
                "Warm and relatively dry conditions; monitoring.",
                ["warm", "reduced_humidity"],
                0.55,
                {"temperature": temperature, "humidity": humidity},
            )
            voices.append("Wildfire risk proxy: warm/dry conditions.")

        # Landslide monitoring proxy
        if rainfall_72h >= 120 and soil_saturation >= 0.75 and elevation >= 300:
            add_marker(
                "landslide_risk",
                "ACTIVE NOW",
                f"Wet ground conditions with elevated rainfall: {rainfall_72h:.0f} mm",
                "Combined rainfall + saturation + terrain elevation suggests slope instability potential.",
                ["heavy_rain", "high_soil_saturation", "terrain"],
                0.7,
                {"rainfall_72h": rainfall_72h, "soil_saturation": soil_saturation, "elevation": elevation},
            )
            voices.append("Landslide monitoring proxy: rainfall + saturation + terrain factors present.")
        elif rainfall_72h >= 100 and soil_saturation >= 0.65:
            add_marker(
                "landslide_risk",
                "MONITORING",
                f"Wet ground conditions: saturation {soil_saturation:.2f}",
                "Monitoring for localized slope instability factors.",
                ["wet_ground"],
                0.5,
                {"rainfall_72h": rainfall_72h, "soil_saturation": soil_saturation},
            )
            voices.append("Landslide monitoring proxy: wet ground conditions.")

        # Drought conditions proxy
        if rainfall_72h <= 10 and temperature >= 32:
            add_marker(
                "drought_conditions",
                "UNUSUAL",
                f"Low recent rainfall: {rainfall_72h:.0f} mm (72h)",
                "Short-term precipitation deficit; tracking persistence.",
                ["low_rain", "heat"],
                0.5,
                {"rainfall_72h": rainfall_72h, "temperature": temperature},
            )
            voices.append("Drought conditions proxy: low short-term rainfall.")

        # Disease risk proxy (environmental suitability)
        if humidity >= 80 and 24 <= temperature <= 32:
            add_marker(
                "disease_risk",
                "SITUATIONAL",
                f"Environmental suitability factors: {temperature:.0f}°C, RH {humidity:.0f}%",
                "Environmental conditions can affect vector/activity patterns; situational context only.",
                ["high_humidity", "warm_temperature"],
                0.45,
                {"temperature": temperature, "humidity": humidity},
            )
            voices.append("Disease risk proxy: warm/humid suitability factors.")

        analytics = self._build_analytics(markers, region)
        moscripts_voice = self._summary_voice(analytics)

        return {
            "markers": markers,
            "analytics": analytics,
            "moscripts_voice": moscripts_voice,
            "detailed_voices": voices,
        }

    def _build_analytics(self, markers: List[Dict[str, Any]], region: str) -> Dict[str, Any]:
        by_type: Dict[str, int] = {}
        by_severity: Dict[str, int] = {"high": 0, "moderate": 0, "low": 0}

        for m in markers:
            t = str(m.get("type", "unknown"))
            by_type[t] = by_type.get(t, 0) + 1

            sev = _severity_from_status(str(m.get("status", "SITUATIONAL")))
            by_severity[sev] = by_severity.get(sev, 0) + 1

        regions = [region] if markers else []

        return {
            "total_threats": len(markers),
            "by_type": by_type,
            "by_severity": by_severity,
            "regions_affected": regions,
            "timestamp": _now_iso(),
        }

    def _summary_voice(self, analytics: Dict[str, Any]) -> str:
        total = int(analytics.get("total_threats", 0) or 0)
        if total == 0:
            return "Analysis mode: no active situational markers detected."

        by_type = analytics.get("by_type", {}) or {}
        top: List[Tuple[str, int]] = sorted(
            [(str(k), int(v)) for k, v in by_type.items()], key=lambda kv: kv[1], reverse=True
        )
        top_str = ", ".join([f"{k}({v})" for k, v in top[:3]])
        return f"Analysis mode: {total} situational marker(s) detected. Top types: {top_str}."
