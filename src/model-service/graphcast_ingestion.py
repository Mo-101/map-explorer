"""
GraphCast Ingestion Module
==========================

This module handles batch ingestion of GraphCast weather forecast data,
persisting forecast runs and fields, and deriving hazards into the hazard_alerts table.

Features:
- Scheduled batch job (every 30 minutes by default)
- Dual storage strategy: URI-based primary, GeoJSON fallback
- Derived hazard generation with provenance tracking
- Configurable intervals and retry logic
- Integration with existing Neon DB schema
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import httpx
import numpy as np
import xarray as xr
from psycopg_pool import ConnectionPool

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GraphCastIngestor:
    """Handles GraphCast data ingestion and hazard derivation."""
    
    def __init__(self, db_pool: ConnectionPool):
        self.db_pool = db_pool
        self.graphcast_api_url = os.getenv("GRAPHCAST_API_URL", "https://graphcast-api.example.com")
        self.ingestion_interval_minutes = int(os.getenv("GRAPHCAST_INGESTION_INTERVAL_MIN", "30"))
        self.max_retries = int(os.getenv("GRAPHCAST_MAX_RETRIES", "3"))
        self.retry_delay_seconds = int(os.getenv("GRAPHCAST_RETRY_DELAY_SEC", "60"))
        
    async def run_scheduled_ingestion(self):
        """Main scheduled ingestion loop."""
        logger.info("Starting GraphCast scheduled ingestion")
        
        while True:
            try:
                await self.ingest_forecast_run()
                # Sleep until next ingestion
                await asyncio.sleep(self.ingestion_interval_minutes * 60)
            except Exception as e:
                logger.error(f"Error in scheduled ingestion: {e}")
                # Wait before retrying
                await asyncio.sleep(self.retry_delay_seconds)
    
    async def ingest_forecast_run(self):
        """Ingest a single GraphCast forecast run."""
        logger.info("Starting GraphCast forecast ingestion")
        
        # Create forecast run record
        run_id = await self._create_forecast_run()
        
        if not run_id:
            logger.error("Failed to create forecast run")
            return
        
        try:
            # Fetch GraphCast data
            forecast_data = await self._fetch_graphcast_data()
            
            if not forecast_data:
                logger.error("Failed to fetch GraphCast data")
                await self._mark_run_failed(run_id)
                return
            
            # Process and persist forecast fields
            await self._process_forecast_fields(run_id, forecast_data)
            
            # Derive and persist hazards
            await self._derive_hazards(run_id, forecast_data)
            
            # Mark run as completed
            await self._mark_run_completed(run_id)
            
            logger.info(f"Successfully completed GraphCast ingestion for run {run_id}")
            
        except Exception as e:
            logger.error(f"Error processing forecast run {run_id}: {e}")
            await self._mark_run_failed(run_id)
    
    async def _create_forecast_run(self) -> Optional[str]:
        """Create a new forecast run record."""
        run_id = f"graphcast_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        
        try:
            # Ensure pool is open
            self.db_pool.open()
            with self.db_pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO forecast_runs (
                            run_id, source, model_name, version, 
                            created_at, status, metadata
                        ) VALUES (
                            %s, 'graphcast', 'GraphCast', '1.0',
                            %s, 'running', %s
                        ) ON CONFLICT (run_id) DO NOTHING
                        RETURNING run_id
                    """, (
                        run_id,
                        datetime.now(timezone.utc),
                        json.dumps({
                            "ingestion_interval_minutes": self.ingestion_interval_minutes,
                            "api_url": self.graphcast_api_url
                        })
                    ))
                    
                    result = cur.fetchone()
                    return result[0] if result else None
                    
        except Exception as e:
            logger.error(f"Failed to create forecast run: {e}")
            return None
    
    async def _fetch_graphcast_data(self) -> Optional[Dict[str, Any]]:
        """Fetch GraphCast forecast data from API or local source."""
        # For now, return mock data that matches GraphCast output structure
        # In production, this would call the actual GraphCast API or load from files
        
        logger.info("Fetching GraphCast data (using mock data for now)")
        
        # Mock GraphCast data structure
        mock_data = {
            "times": [
                datetime.now(timezone.utc) + timedelta(hours=h)
                for h in range(0, 121, 3)  # 0 to 120 hours in 3-hour steps
            ],
            "variables": {
                "wind_speed": {
                    "units": "m/s",
                    "description": "10m wind speed"
                },
                "precipitation": {
                    "units": "mm/h", 
                    "description": "Precipitation rate"
                },
                "temperature": {
                    "units": "K",
                    "description": "2m temperature"
                },
                "pressure": {
                    "units": "hPa",
                    "description": "Mean sea level pressure"
                }
            },
            "spatial_extent": {
                "lat_min": -90, "lat_max": 90,
                "lon_min": -180, "lon_max": 180,
                "resolution": 0.25  # degrees
            }
        }
        
        # Generate some sample forecast data
        mock_data["forecasts"] = self._generate_sample_forecasts(mock_data)
        
        return mock_data
    
    def _generate_sample_forecasts(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate sample forecast data for testing."""
        forecasts = {}
        times = data["times"]
        variables = data["variables"]
        
        # Create sample grid
        lat_points = int((data["spatial_extent"]["lat_max"] - data["spatial_extent"]["lat_min"]) / data["spatial_extent"]["resolution"])
        lon_points = int((data["spatial_extent"]["lon_max"] - data["spatial_extent"]["lon_min"]) / data["spatial_extent"]["resolution"])
        
        for var_name in variables.keys():
            forecasts[var_name] = {
                "data": np.random.rand(len(times), lat_points, lon_points).tolist(),
                "shape": [len(times), lat_points, lon_points],
                "uri": f"memory://graphcast_forecast_{var_name}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.nc"
            }
        
        return forecasts
    
    async def _process_forecast_fields(self, run_id: str, forecast_data: Dict[str, Any]):
        """Process and persist forecast fields."""
        logger.info(f"Processing forecast fields for run {run_id}")
        
        try:
            # Ensure pool is open
            self.db_pool.open()
            with self.db_pool.connection() as conn:
                with conn.cursor() as cur:
                    for var_name, var_info in forecast_data["variables"].items():
                        forecast_info = forecast_data["forecasts"][var_name]
                        
                        # Store URI-based reference (preferred strategy)
                        cur.execute("""
                            INSERT INTO forecast_fields (
                                run_id, field_name, variable, units,
                                storage_type, storage_uri, storage_geojson,
                                created_at, metadata
                            ) VALUES (
                                %s, %s, %s, %s,
                                'uri', %s, NULL,
                                %s, %s
                            )
                        """, (
                            run_id,
                            f"{var_name}_forecast",
                            var_name,
                            var_info["units"],
                            forecast_info["uri"],
                            datetime.now(timezone.utc),
                            json.dumps({
                                "description": var_info["description"],
                                "shape": forecast_info["shape"],
                                "spatial_extent": forecast_data["spatial_extent"]
                            })
                        ))
                        
                        # Also store GeoJSON fallback for critical variables
                        if var_name in ["wind_speed", "precipitation"]:
                            geojson_data = self._convert_to_geojson(forecast_data, var_name)
                            cur.execute("""
                                INSERT INTO forecast_fields (
                                    run_id, field_name, variable, units,
                                    storage_type, storage_uri, storage_geojson,
                                    created_at, metadata
                                ) VALUES (
                                    %s, %s, %s, %s,
                                    'geojson', NULL, %s,
                                    %s, %s
                                )
                            """, (
                                run_id,
                                f"{var_name}_geojson",
                                var_name,
                                var_info["units"],
                                json.dumps(geojson_data),
                                datetime.now(timezone.utc),
                                json.dumps({
                                    "description": var_info["description"],
                                    "fallback": True,
                                    "spatial_extent": forecast_data["spatial_extent"]
                                })
                            ))
            
            logger.info(f"Successfully processed forecast fields for run {run_id}")
            
        except Exception as e:
            logger.error(f"Failed to process forecast fields for run {run_id}: {e}")
            raise
    
    def _convert_to_geojson(self, forecast_data: Dict[str, Any], variable: str) -> Dict[str, Any]:
        """Convert forecast data to GeoJSON format for storage."""
        # Simplified GeoJSON conversion - in production this would properly
        # extract significant weather features
        
        features = []
        forecasts = forecast_data["forecasts"][variable]
        times = forecast_data["times"]
        
        # Extract high-value areas as features
        for t_idx, time in enumerate(times[:6]):  # First 6 time steps
            data = np.array(forecasts["data"][t_idx])
            
            # Find areas with high values (potential hazards)
            if variable == "wind_speed":
                threshold = 15.0  # m/s
                hazard_type = "high_wind"
            elif variable == "precipitation":
                threshold = 10.0  # mm/h
                hazard_type = "heavy_rain"
            else:
                continue
            
            # Find grid points above threshold
            high_value_indices = np.where(data > threshold)
            
            for i in range(min(10, len(high_value_indices[0]))):  # Limit to 10 features
                lat_idx, lon_idx = high_value_indices[0][i], high_value_indices[1][i]
                
                # Convert grid indices to lat/lon
                extent = forecast_data["spatial_extent"]
                lat = extent["lat_min"] + lat_idx * extent["resolution"]
                lon = extent["lon_min"] + lon_idx * extent["resolution"]
                value = float(data[lat_idx, lon_idx])
                
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    },
                    "properties": {
                        "variable": variable,
                        "value": value,
                        "threshold": threshold,
                        "time": time.isoformat(),
                        "hazard_type": hazard_type,
                        "severity": "high" if value > threshold * 1.5 else "medium"
                    }
                }
                features.append(feature)
        
        return {
            "type": "FeatureCollection",
            "features": features
        }
    
    async def _derive_hazards(self, run_id: str, forecast_data: Dict[str, Any]):
        """Derive hazards from forecast data and persist to hazard_alerts."""
        logger.info(f"Deriving hazards for run {run_id}")
        
        try:
            # Ensure pool is open
            self.db_pool.open()
            with self.db_pool.connection() as conn:
                with conn.cursor() as cur:
                    # Process each time step for hazard conditions
                    times = forecast_data["times"]
                    forecasts = forecast_data["forecasts"]
                    
                    for t_idx, time in enumerate(times[:12]):  # First 12 time steps (36 hours)
                        hazards = self._detect_hazards(forecast_data, t_idx, time)
                        
                        for hazard in hazards:
                            # Insert derived hazard with provenance
                            cur.execute("""
                                INSERT INTO hazard_alerts (
                                    external_id, source, type, severity, title, description,
                                    lat, lng, event_at, intensity, metadata, is_active
                                ) VALUES (
                                    %s, 'graphcast', %s, %s, %s, %s,
                                    %s, %s, %s, %s, %s, TRUE
                                ) ON CONFLICT (external_id, source) DO UPDATE SET
                                    severity = EXCLUDED.severity,
                                    title = EXCLUDED.title,
                                    description = EXCLUDED.description,
                                    event_at = EXCLUDED.event_at,
                                    intensity = EXCLUDED.intensity,
                                    metadata = EXCLUDED.metadata,
                                    is_active = EXCLUDED.is_active
                            """, (
                                f"graphcast_{run_id}_{hazard['type']}_{t_idx}_{hazard['lat']:.2f}_{hazard['lng']:.2f}",
                                hazard["type"],
                                hazard["severity"],
                                hazard["title"],
                                hazard["description"],
                                hazard["lat"],
                                hazard["lng"],
                                hazard["event_at"],
                                hazard["intensity"],
                                json.dumps({
                                    **hazard["metadata"],
                                    "forecast_run_id": run_id,
                                    "forecast_time_index": t_idx,
                                    "derived_from": ["wind_speed", "precipitation", "pressure"],
                                    "confidence": hazard.get("confidence", 0.7)
                                })
                            ))
            
            logger.info(f"Successfully derived hazards for run {run_id}")
            
        except Exception as e:
            logger.error(f"Failed to derive hazards for run {run_id}: {e}")
            raise
    
    def _detect_hazards(self, forecast_data: Dict[str, Any], time_idx: int, time: datetime) -> List[Dict[str, Any]]:
        """Detect hazardous conditions from forecast data."""
        hazards = []
        forecasts = forecast_data["forecasts"]
        
        # Get data for this time step
        wind_data = np.array(forecasts["wind_speed"]["data"][time_idx])
        precip_data = np.array(forecasts["precipitation"]["data"][time_idx])
        pressure_data = np.array(forecasts["pressure"]["data"][time_idx])
        
        extent = forecast_data["spatial_extent"]
        
        # Detect high wind areas
        wind_threshold = 20.0  # m/s
        high_wind_indices = np.where(wind_data > wind_threshold)
        
        for i in range(min(5, len(high_wind_indices[0]))):  # Limit to prevent too many hazards
            lat_idx, lon_idx = high_wind_indices[0][i], high_wind_indices[1][i]
            lat = extent["lat_min"] + lat_idx * extent["resolution"]
            lon = extent["lon_min"] + lon_idx * extent["resolution"]
            wind_speed = float(wind_data[lat_idx, lon_idx])
            
            hazards.append({
                "type": "storm",
                "severity": "extreme" if wind_speed > 30 else "high",
                "title": f"High Wind Alert ({wind_speed:.1f} m/s)",
                "description": f"GraphCast predicts wind speeds of {wind_speed:.1f} m/s at this location",
                "lat": lat,
                "lng": lon,
                "event_at": time,
                "intensity": wind_speed,
                "metadata": {
                    "variable": "wind_speed",
                    "value": wind_speed,
                    "threshold": wind_threshold,
                    "model": "GraphCast"
                },
                "confidence": 0.8
            })
        
        # Detect heavy precipitation
        precip_threshold = 25.0  # mm/h
        heavy_precip_indices = np.where(precip_data > precip_threshold)
        
        for i in range(min(5, len(heavy_precip_indices[0]))):
            lat_idx, lon_idx = heavy_precip_indices[0][i], heavy_precip_indices[1][i]
            lat = extent["lat_min"] + lat_idx * extent["resolution"]
            lon = extent["lon_min"] + lon_idx * extent["resolution"]
            precip_rate = float(precip_data[lat_idx, lon_idx])
            
            hazards.append({
                "type": "flood",
                "severity": "extreme" if precip_rate > 50 else "high",
                "title": f"Heavy Rainfall Alert ({precip_rate:.1f} mm/h)",
                "description": f"GraphCast predicts rainfall of {precip_rate:.1f} mm/h at this location",
                "lat": lat,
                "lng": lon,
                "event_at": time,
                "intensity": precip_rate,
                "metadata": {
                    "variable": "precipitation",
                    "value": precip_rate,
                    "threshold": precip_threshold,
                    "model": "GraphCast"
                },
                "confidence": 0.75
            })
        
        return hazards
    
    async def _mark_run_completed(self, run_id: str):
        """Mark forecast run as completed."""
        try:
            # Ensure pool is open
            self.db_pool.open()
            with self.db_pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE forecast_runs 
                        SET status = 'completed', completed_at = %s
                        WHERE run_id = %s
                    """, (datetime.now(timezone.utc), run_id))
        except Exception as e:
            logger.error(f"Failed to mark run {run_id} as completed: {e}")
    
    async def _mark_run_failed(self, run_id: str):
        """Mark forecast run as failed."""
        try:
            # Ensure pool is open
            self.db_pool.open()
            with self.db_pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE forecast_runs 
                        SET status = 'failed', completed_at = %s
                        WHERE run_id = %s
                    """, (datetime.now(timezone.utc), run_id))
        except Exception as e:
            logger.error(f"Failed to mark run {run_id} as failed: {e}")


# Global instance for the ingestion service
_graphcast_ingestor: Optional[GraphCastIngestor] = None

def get_graphcast_ingestor(db_pool: ConnectionPool) -> GraphCastIngestor:
    """Get or create the GraphCast ingestor instance."""
    global _graphcast_ingestor
    if _graphcast_ingestor is None:
        _graphcast_ingestor = GraphCastIngestor(db_pool)
    return _graphcast_ingestor

async def start_graphcast_ingestion(db_pool: ConnectionPool):
    """Start the GraphCast ingestion service."""
    ingestor = get_graphcast_ingestor(db_pool)
    await ingestor.run_scheduled_ingestion()

if __name__ == "__main__":
    # For testing purposes
    import os
    from psycopg_pool import ConnectionPool
    
    # Use the same database configuration as the main app
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
    
    # Create database pool
    pool = ConnectionPool(
        conninfo=_get_database_url(),
        min_size=0,
        max_size=5,
        timeout=8,
    )
    
    # Run ingestion
    asyncio.run(start_graphcast_ingestion(pool))
