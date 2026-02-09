#!/usr/bin/env python3
"""
Database Schema Fix for AFRO STORM - Version 3
Fix missing 'source' column in forecast_runs table
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

    # Check current columns in forecast_runs table
    cur.execute("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'forecast_runs' AND table_schema = 'public'
    """)
    columns = [row[0] for row in cur.fetchall()]
    print(f'📋 Current columns: {columns}')

    # Add missing columns
    if 'source' not in columns:
        print('➕ Adding source column...')
        cur.execute('ALTER TABLE forecast_runs ADD COLUMN source VARCHAR(50) DEFAULT \'graphcast\'')
    
    if 'model_name' not in columns:
        print('➕ Adding model_name column...')
        cur.execute('ALTER TABLE forecast_runs ADD COLUMN model_name VARCHAR(50) DEFAULT \'GraphCast\'')
    
    if 'version' not in columns:
        print('➕ Adding version column...')
        cur.execute('ALTER TABLE forecast_runs ADD COLUMN version VARCHAR(20) DEFAULT \'1.0\'')

    conn.commit()
    cur.close()
    conn.close()

    print('✅ Database schema updated successfully')

except Exception as e:
    print(f'❌ Database error: {e}')
    exit(1)
