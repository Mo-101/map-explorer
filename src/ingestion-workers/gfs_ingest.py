#!/usr/bin/env python
"""
Neon GFS ingestion worker.

Fetches GFS proxy data from Open-Meteo for monitored Africa points,
derives hazards using fixed thresholds, and upserts into hazard_alerts.
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List


def _bootstrap_venv() -> None:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    venv_python = os.path.join(repo_root, ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_python) and os.path.abspath(sys.executable) != os.path.abspath(venv_python):
        os.execv(venv_python, [venv_python, os.path.abspath(__file__), *sys.argv[1:]])


_bootstrap_venv()

import httpx  # noqa: E402
import psycopg2  # noqa: E402
from psycopg2.extras import Json  # noqa: E402
from dotenv import load_dotenv  # noqa: E402


AFRICA_POINTS = [
    {"lat": -18.6, "lon": 45.1, "name": "Madagascar"},
    {"lat": 13.5, "lon": 2.1, "name": "Niger"},
    {"lat": -15.4, "lon": 35.0, "name": "Malawi"},
    {"lat": 6.5, "lon": 3.4, "name": "Lagos"},
    {"lat": -4.3, "lon": 15.3, "name": "Kinshasa"},
    {"lat": -1.3, "lon": 36.8, "name": "Nairobi"},
    {"lat": 9.0, "lon": 38.7, "name": "Addis Ababa"},
    {"lat": 14.7, "lon": -17.5, "name": "Dakar"},
    {"lat": -26.2, "lon": 28.0, "name": "Johannesburg"},
    {"lat": 30.0, "lon": 31.2, "name": "Cairo"},
    {"lat": 0.3, "lon": 32.6, "name": "Kampala"},
    {"lat": -6.8, "lon": 39.3, "name": "Dar es Salaam"},
]

THRESHOLDS = {
    "wind_high": 20.0,
    "wind_extreme": 30.0,
    "mslp_high": 990.0,
    "mslp_extreme": 970.0,
    "rain_high_6h": 50.0,
    "rain_extreme_6h": 100.0,
}

SEVERITY_RANK = {"low": 1, "moderate": 2, "high": 3, "extreme": 4}
MAX_HAZARDS_PER_RUN = 5000
FETCH_TIMEOUT_SECONDS = 15.0
FORECAST_HOURS = 72


@dataclass
class Hazard:
    external_id: str
    source: str
    type: str
    severity: str
    title: str
    description: str
    lat: float
    lng: float
    intensity: float
    data_source_run_id: str
    forecast_hour: int
    metadata: Dict[str, Any]
    source_artifact: Dict[str, Any]


def _load_env() -> None:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    load_dotenv(os.path.join(repo_root, ".env.local"), override=False)
    load_dotenv(os.path.join(repo_root, ".env"), override=False)


def _db_url() -> str:
    for key in (
        "NEON_DATABASE_URL",
        "DATABASE_URL",
        "PGDATABASE_URL",
        "PGDATABASE",
    ):
        value = os.getenv(key, "").strip()
        if value:
            return value.strip('"').strip("'")
    raise RuntimeError("Missing NEON_DATABASE_URL/DATABASE_URL")


def _latest_run(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    available = now - timedelta(hours=5)
    run_hour = max(h for h in (0, 6, 12, 18) if h <= available.hour)
    run_date = available.strftime("%Y%m%d")
    return f"gfs_{run_date}_{run_hour:02d}z"


def _make_external_id(run_id: str, forecast_hour: int, variable: str, lat: float, lon: float) -> str:
    return f"{run_id}_f{forecast_hour:03d}_{variable}_{lat:.2f}_{lon:.2f}"


def _build_hazard(
    *,
    run_id: str,
    forecast_hour: int,
    variable: str,
    hazard_type: str,
    severity: str,
    lat: float,
    lon: float,
    intensity: float,
    measured_value: float,
    threshold: float,
    unit: str,
    extras: Dict[str, Any],
) -> Hazard:
    return Hazard(
        external_id=_make_external_id(run_id, forecast_hour, variable, lat, lon),
        source="gfs",
        type=hazard_type,
        severity=severity,
        title=f"{'Extreme' if severity == 'extreme' else 'High'} {hazard_type} signal",
        description=f"GFS {variable} threshold exceeded at f+{forecast_hour}h",
        lat=lat,
        lng=lon,
        intensity=float(intensity),
        data_source_run_id=run_id,
        forecast_hour=forecast_hour,
        metadata={
            "variable": variable,
            "measured_value": measured_value,
            "threshold": threshold,
            "unit": unit,
            "data_source_run_id": run_id,
            "forecast_hour": forecast_hour,
            "source_system": "neon_gfs_ingest_worker",
            "detection_source": "noaa_gfs_via_open_meteo",
            "model": "GFS 0.25",
            "detection_method": "threshold_exceedance",
            **extras,
        },
        source_artifact={
            "source": "open-meteo-gfs-proxy",
            "variable": variable,
            "measured_value": measured_value,
            "threshold": threshold,
            "unit": unit,
            "run_id": run_id,
            "forecast_hour": forecast_hour,
            **extras,
        },
    )


def _to_num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        fv = float(value)
        if math.isfinite(fv):
            return fv
    return None


def _detect_point_hazards(point: Dict[str, Any], run_id: str, hourly: Dict[str, Any]) -> List[Hazard]:
    hazards: List[Hazard] = []

    times = hourly.get("time") or []
    wind = hourly.get("wind_speed_10m") or []
    gust = hourly.get("wind_gusts_10m") or []
    pressure = hourly.get("pressure_msl") or []
    precip = hourly.get("precipitation") or []

    for i in range(len(times)):
        forecast_hour = i
        wind_ms = _to_num(wind[i] if i < len(wind) else None)
        gust_ms = _to_num(gust[i] if i < len(gust) else None)
        p_hpa = _to_num(pressure[i] if i < len(pressure) else None)

        if wind_ms is not None:
            if wind_ms > THRESHOLDS["wind_extreme"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="wind_10m",
                        hazard_type="cyclone",
                        severity="extreme",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=wind_ms,
                        measured_value=wind_ms,
                        threshold=THRESHOLDS["wind_extreme"],
                        unit="m/s",
                        extras={"point_name": point["name"], "gust_ms": gust_ms},
                    )
                )
            elif wind_ms > THRESHOLDS["wind_high"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="wind_10m",
                        hazard_type="storm",
                        severity="high",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=wind_ms,
                        measured_value=wind_ms,
                        threshold=THRESHOLDS["wind_high"],
                        unit="m/s",
                        extras={"point_name": point["name"], "gust_ms": gust_ms},
                    )
                )

        if p_hpa is not None:
            if p_hpa < THRESHOLDS["mslp_extreme"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="mslp",
                        hazard_type="cyclone",
                        severity="extreme",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=1013.0 - p_hpa,
                        measured_value=p_hpa,
                        threshold=THRESHOLDS["mslp_extreme"],
                        unit="hPa",
                        extras={"point_name": point["name"]},
                    )
                )
            elif p_hpa < THRESHOLDS["mslp_high"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="mslp",
                        hazard_type="cyclone",
                        severity="high",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=1013.0 - p_hpa,
                        measured_value=p_hpa,
                        threshold=THRESHOLDS["mslp_high"],
                        unit="hPa",
                        extras={"point_name": point["name"]},
                    )
                )

        if i >= 5:
            rain_6h = 0.0
            for j in range(i - 5, i + 1):
                rain_6h += _to_num(precip[j] if j < len(precip) else None) or 0.0

            if rain_6h > THRESHOLDS["rain_extreme_6h"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="precip_6h",
                        hazard_type="flood",
                        severity="extreme",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=rain_6h,
                        measured_value=rain_6h,
                        threshold=THRESHOLDS["rain_extreme_6h"],
                        unit="mm/6h",
                        extras={"point_name": point["name"]},
                    )
                )
            elif rain_6h > THRESHOLDS["rain_high_6h"]:
                hazards.append(
                    _build_hazard(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        variable="precip_6h",
                        hazard_type="flood",
                        severity="high",
                        lat=point["lat"],
                        lon=point["lon"],
                        intensity=rain_6h,
                        measured_value=rain_6h,
                        threshold=THRESHOLDS["rain_high_6h"],
                        unit="mm/6h",
                        extras={"point_name": point["name"]},
                    )
                )

    return hazards


def _dedupe(hazards: Iterable[Hazard]) -> List[Hazard]:
    by_id: Dict[str, Hazard] = {}
    for h in hazards:
        existing = by_id.get(h.external_id)
        if existing is None:
            by_id[h.external_id] = h
            continue
        old_rank = SEVERITY_RANK.get(existing.severity, 0)
        new_rank = SEVERITY_RANK.get(h.severity, 0)
        if new_rank > old_rank or h.intensity > existing.intensity:
            by_id[h.external_id] = h
    return list(by_id.values())


def _table_columns(conn: psycopg2.extensions.connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'hazard_alerts'
            """
        )
        return {row[0] for row in cur.fetchall()}


def _upsert_hazards(conn: psycopg2.extensions.connection, hazards: List[Hazard]) -> int:
    if not hazards:
        return 0

    cols = _table_columns(conn)
    if "external_id" not in cols or "source" not in cols:
        raise RuntimeError("hazard_alerts schema missing required columns")

    has_run = "data_source_run_id" in cols
    has_fh = "forecast_hour" in cols
    has_artifact = "source_artifact" in cols

    base_columns = [
        "external_id",
        "source",
        "type",
        "severity",
        "title",
        "description",
        "lat",
        "lng",
        "event_at",
        "intensity",
        "metadata",
        "is_active",
    ]
    if has_run:
        base_columns.append("data_source_run_id")
    if has_fh:
        base_columns.append("forecast_hour")
    if has_artifact:
        base_columns.append("source_artifact")

    placeholders = ", ".join(["%s"] * len(base_columns))
    updates = [
        "type = EXCLUDED.type",
        "severity = EXCLUDED.severity",
        "title = EXCLUDED.title",
        "description = EXCLUDED.description",
        "lat = EXCLUDED.lat",
        "lng = EXCLUDED.lng",
        "event_at = EXCLUDED.event_at",
        "intensity = EXCLUDED.intensity",
        "metadata = EXCLUDED.metadata",
        "is_active = EXCLUDED.is_active",
        "updated_at = NOW()",
    ]
    if has_run:
        updates.append("data_source_run_id = EXCLUDED.data_source_run_id")
    if has_fh:
        updates.append("forecast_hour = EXCLUDED.forecast_hour")
    if has_artifact:
        updates.append("source_artifact = EXCLUDED.source_artifact")

    sql = f"""
        INSERT INTO hazard_alerts ({", ".join(base_columns)})
        VALUES ({placeholders})
        ON CONFLICT (source, external_id) DO UPDATE SET
          {", ".join(updates)}
    """

    with conn.cursor() as cur:
        for h in hazards:
            values: List[Any] = [
                h.external_id,
                h.source,
                h.type,
                h.severity,
                h.title,
                h.description,
                h.lat,
                h.lng,
                datetime.now(timezone.utc),
                h.intensity,
                Json(h.metadata),
                True,
            ]
            if has_run:
                values.append(h.data_source_run_id)
            if has_fh:
                values.append(h.forecast_hour)
            if has_artifact:
                values.append(Json(h.source_artifact))
            cur.execute(sql, values)
    conn.commit()
    return len(hazards)


def main() -> int:
    _load_env()
    started = time.time()
    run_id = _latest_run()
    db_url = _db_url()

    all_hazards: List[Hazard] = []
    points_scanned = 0
    upstream_errors = 0

    with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS) as client:
        for point in AFRICA_POINTS:
            url = (
                "https://api.open-meteo.com/v1/gfs"
                f"?latitude={point['lat']}&longitude={point['lon']}"
                "&hourly=wind_speed_10m,wind_gusts_10m,pressure_msl,precipitation"
                f"&forecast_hours={FORECAST_HOURS}&wind_speed_unit=ms&timezone=UTC"
            )
            try:
                response = client.get(url)
                response.raise_for_status()
                payload = response.json()
                hourly = payload.get("hourly")
                if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
                    upstream_errors += 1
                    continue
                point_hazards = _detect_point_hazards(point, run_id, hourly)
                all_hazards.extend(point_hazards)
                points_scanned += 1
            except Exception:
                upstream_errors += 1

    deduped = _dedupe(all_hazards)
    if len(deduped) > MAX_HAZARDS_PER_RUN:
        raise RuntimeError("Abnormal hazard spike - aborting")

    ingested = 0
    if deduped:
        with psycopg2.connect(db_url) as conn:
            ingested = _upsert_hazards(conn, deduped)

    result = {
        "source": "gfs",
        "run_id": run_id,
        "status": "success",
        "hazards_detected": len(deduped),
        "hazards_inserted": ingested,
        "points_scanned": points_scanned,
        "upstream_errors": upstream_errors,
        "duration_ms": int((time.time() - started) * 1000),
    }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            json.dumps(
                {
                    "source": "gfs",
                    "status": "failed",
                    "error": str(exc),
                }
            ),
            file=sys.stderr,
        )
        raise SystemExit(1)
