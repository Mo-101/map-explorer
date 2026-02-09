#!/usr/bin/env python3
"""
Add sample threat data to PostgreSQL database for testing
"""

import psycopg2
import os
from datetime import datetime, timezone
import json

# Database connection
DB_URL = "postgresql://dunoamtpmx:afro2025@afro-server.postgres.database.azure.com:5432/afro-database?sslmode=require"

def add_sample_threats():
    """Add sample threat data for testing"""
    
    sample_threats = [
        {
            "external_id": "cyclone-001",
            "source": "graphcast",
            "hazard_type": "cyclone",
            "severity": "high",
            "title": "Tropical Cyclone Darian",
            "description": "Category 4 cyclone detected in Indian Ocean",
            "lat": -18.6,
            "lng": 45.1,
            "event_at": datetime.now(timezone.utc).isoformat(),
            "intensity": 4,
            "metadata": json.dumps({
                "max_wind_kt": 95,
                "min_pressure_hpa": 975,
                "category": 4,
                "confidence": 0.8,
                "lead_time_days": 2,
                "affected_regions": ["Madagascar", "Mauritius"],
                "detection_method": "GraphCast ML Anomaly Detection",
                "detection_source": "MoScripts Intelligence System",
                "model": "GraphCast v1.0"
            })
        },
        {
            "external_id": "flood-001", 
            "source": "graphcast",
            "hazard_type": "flood",
            "severity": "moderate",
            "title": "Heavy Rainfall Alert",
            "description": "Significant flooding detected in coastal regions",
            "lat": -12.5,
            "lng": 55.2,
            "event_at": datetime.now(timezone.utc).isoformat(),
            "intensity": 2,
            "metadata": json.dumps({
                "expected_runoff_mm": 150,
                "confidence": 0.7,
                "lead_time_days": 1,
                "affected_regions": ["Comoros", "Mayotte"],
                "detection_method": "Precipitation Anomaly Detection",
                "detection_source": "MoScripts Intelligence System", 
                "model": "GraphCast v1.0"
            })
        },
        {
            "external_id": "convergence-001",
            "source": "convergence_engine",
            "hazard_type": "convergence",
            "severity": "critical",
            "title": "Compound Emergency",
            "description": "Cyclone and flood threats converging in same region",
            "lat": -15.0,
            "lng": 50.0,
            "event_at": datetime.now(timezone.utc).isoformat(),
            "intensity": 5,
            "metadata": json.dumps({
                "risk_multiplier": 2.5,
                "confidence": 0.9,
                "lead_time_days": 1,
                "affected_regions": ["Madagascar", "Comoros"],
                "detection_method": "Convergence Analysis",
                "detection_source": "MoScripts Intelligence System",
                "model": "Convergence Engine v1.0"
            })
        }
    ]
    
    try:
        print("🔥 Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        
        print("🗑️ Clearing existing threat data...")
        cursor.execute("DELETE FROM hazard_alerts WHERE is_active = TRUE")
        
        print("📊 Adding sample threat data...")
        for threat in sample_threats:
            cursor.execute("""
                INSERT INTO hazard_alerts (
                    external_id, source, hazard_type, severity, title, description,
                    lat, lng, event_at, intensity, metadata, is_active, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)
            """, (
                threat["external_id"],
                threat["source"], 
                threat["hazard_type"],
                threat["severity"],
                threat["title"],
                threat["description"],
                threat["lat"],
                threat["lng"],
                threat["event_at"],
                threat["intensity"],
                threat["metadata"],
                datetime.now(timezone.utc)
            ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ Successfully added {len(sample_threats)} sample threats to database!")
        print("🔥 These will now appear in the AFRO STORM map with tooltips!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    add_sample_threats()
