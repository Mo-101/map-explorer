#!/usr/bin/env python3
"""
Database Schema Fix for AFRO STORM - Version 2
Handles existing tables and adds missing columns
"""

import psycopg2
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(env_path)

# Get database URL
db_url = os.getenv('NEON_DATABASE_URL') or os.getenv('VITE_NEON_DATABASE_URL')
if not db_url:
    print('❌ No database URL found in environment')
    exit(1)

print(f'🔗 Connecting to database...')

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Check existing tables
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
    """)
    tables = [row[0] for row in cur.fetchall()]
    print(f'📋 Existing tables: {tables}')

    # Drop and recreate forecast_runs table properly
    if 'forecast_runs' in tables:
        print('🗑️ Dropping existing forecast_runs table...')
        cur.execute('DROP TABLE forecast_runs CASCADE')
        conn.commit()

    # Create forecast_runs table
    print('📝 Creating forecast_runs table...')
    cur.execute('''
        CREATE TABLE forecast_runs (
            id SERIAL PRIMARY KEY,
            run_id VARCHAR(50) UNIQUE NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            model_version VARCHAR(50),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB
        );
    ''')

    # Create weather_anomalies table if it doesn't exist
    if 'weather_anomalies' not in tables:
        print('📝 Creating weather_anomalies table...')
        cur.execute('''
            CREATE TABLE weather_anomalies (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR(50) REFERENCES forecast_runs(run_id),
                type VARCHAR(30),
                severity VARCHAR(20),
                center_lat FLOAT NOT NULL,
                center_lon FLOAT NOT NULL,
                risk_score FLOAT,
                detection_details JSONB,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        ''')
    else:
        print('📋 weather_anomalies table already exists')

    conn.commit()
    cur.close()
    conn.close()

    print('✅ Database schema fixed successfully')
    print('📊 Tables ready: forecast_runs, weather_anomalies')

except Exception as e:
    print(f'❌ Database error: {e}')
    exit(1)
