import { db } from '../lib/db';

/**
 * AfriGuard Ingestion Engine
 * Handles idempotent hazard synchronization and source watermarking.
 */

function canonicalThreatType(rawType: string | null | undefined): string {
  if (!rawType) return 'unknown';
  const v = rawType.trim().toLowerCase();
  const taxonomy: Record<string, Set<string>> = {
    cyclone: new Set(['cyclone', 'tropical_cyclone', 'tc', 'tropical storm', 'hurricane', 'typhoon', 'tropical_depression']),
    flood: new Set(['flood', 'flooding', 'flash_flood', 'river_flood']),
    drought: new Set(['drought', 'dry_spell', 'water_scarcity']),
    cholera: new Set(['cholera', 'awd']),
    lassa: new Set(['lassa', 'lassa_fever', 'lassa fever', 'lf']),
    meningitis: new Set(['meningitis', 'meningococcal', 'cerebro-spinal meningitis']),
    malaria: new Set(['malaria']),
    ebola: new Set(['ebola', 'evd', 'ebola virus disease']),
    measles: new Set(['measles', 'rubeola']),
    convergence: new Set(['convergence']),
  };

  for (const [canonical, aliases] of Object.entries(taxonomy)) {
    if (aliases.has(v)) return canonical;
  }
  return v;
}

export async function syncHazardSource(source: string, fetcher: () => Promise<any[]>) {
  const now = new Date();
  
  // 1. Check Backoff
  const watermarkRes = await db.query('SELECT backoff_until FROM source_watermarks WHERE source = $1', [source]);
  if (watermarkRes.rows[0]?.backoff_until && new Date(watermarkRes.rows[0].backoff_until) > now) {
    console.log(`[Worker] Skipping ${source}: In backoff period.`);
    return;
  }

  const startTime = Date.now();
  try {
    const records = await fetcher();
    
    // 2. Idempotent Upsert (ON CONFLICT)
    for (const record of records) {
      const canonicalType = canonicalThreatType(record.type);
      await db.query(`
        INSERT INTO hazard_alerts (
          external_id, source, type, severity, title, description, lat, lng, event_at, intensity, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (source, external_id) DO UPDATE SET
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          intensity = EXCLUDED.intensity,
          type = EXCLUDED.type,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        record.id, source, canonicalType, record.severity, record.title, 
        record.description, record.lat, record.lng, record.event_at, 
        record.intensity, record.metadata
      ]);
    }

    // 3. Update Watermark & Reset Backoff
    await db.query(`
      INSERT INTO source_watermarks (source, last_timestamp, error_count, backoff_until)
      VALUES ($1, $2, 0, NULL)
      ON CONFLICT (source) DO UPDATE SET 
        last_timestamp = EXCLUDED.last_timestamp,
        error_count = 0,
        backoff_until = NULL
    `, [source, now]);

    // 4. Log Success
    await logIngestion(source, 'SUCCESS', records.length, Date.now() - startTime);

  } catch (error: any) {
    console.error(`[Worker] Error syncing ${source}:`, error);
    
    // 5. Exponential Backoff Logic
    const current = await db.query('SELECT error_count FROM source_watermarks WHERE source = $1', [source]);
    const errorCount = (current.rows[0]?.error_count || 0) + 1;
    const backoffMinutes = Math.min(Math.pow(2, errorCount), 1440); // Max 24h
    const backoffUntil = new Date(Date.now() + backoffMinutes * 60000);

    await db.query(`
      INSERT INTO source_watermarks (source, last_timestamp, error_count, backoff_until)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source) DO UPDATE SET 
        error_count = EXCLUDED.error_count,
        backoff_until = EXCLUDED.backoff_until
    `, [source, now, errorCount, backoffUntil]);

    await logIngestion(source, 'FAILED', 0, Date.now() - startTime, error.message);
  }
}

export async function cleanupStaleAlerts() {
  // Deactivate alerts untouched for > 72h
  const res = await db.query(`
    UPDATE hazard_alerts 
    SET is_active = false 
    WHERE updated_at < NOW() - INTERVAL '72 hours' AND is_active = true
  `);
  console.log(`[Worker] Cleanup: Deactivated ${res.rowCount} stale alerts.`);
}

async function logIngestion(source: string, status: string, count: number, latency: number, error?: string) {
  await db.query(`
    INSERT INTO ingestion_logs (source, status, records_synced, latency_ms, error_message)
    VALUES ($1, $2, $3, $4, $5)
  `, [source, status, count, latency, error]);
}
