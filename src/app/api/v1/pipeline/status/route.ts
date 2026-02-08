import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const watermarks = await db.query('SELECT * FROM source_watermarks');
    const logs = await db.query(`
      SELECT source, status, records_synced, latency_ms, created_at 
      FROM ingestion_logs 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    return NextResponse.json({
      watermarks: watermarks.rows,
      recent_logs: logs.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
