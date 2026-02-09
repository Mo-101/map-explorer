import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

type HazardAlertRow = {
  id: number | string;
  type: string;
  severity: string | null;
  title: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  event_at: string | null;
  intensity: number | null;
  metadata: any;
  created_at: string;
  updated_at: string;
};

function dbUrl(): string {
  return (
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.PGDATABASE_URL ||
    ""
  );
}

function initEnabled(): boolean {
  const v = String(process.env.AUTO_INIT_DB || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function ensureSchema(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS hazard_alerts (
      id BIGSERIAL PRIMARY KEY,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      type TEXT NOT NULL,
      severity TEXT,
      title TEXT,
      description TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      event_at TIMESTAMPTZ,
      intensity DOUBLE PRECISION,
      metadata JSONB,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source, external_id)
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_hazard_alerts_active ON hazard_alerts (is_active);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hazard_alerts_event_at ON hazard_alerts (event_at DESC);`;

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM hazard_alerts WHERE is_active = TRUE;
  `;

  if (count === 0) {
    await sql`
      INSERT INTO hazard_alerts (
        external_id, source, type, severity, title, description,
        lat, lng, event_at, intensity, metadata, is_active
      ) VALUES
        (
          'seed-cyclone-001', 'seed', 'cyclone', 'high', 'Seed Cyclone', 'Test cyclone for map rendering',
          -18.6, 45.1, NOW(), 80,
          '{"confidence":0.8,"lead_time_days":2,"wind_speed":95,"min_pressure_hpa":975}'::jsonb,
          TRUE
        ),
        (
          'seed-cholera-001', 'seed', 'cholera', 'moderate', 'Seed Cholera', 'Test outbreak for convergence testing',
          -18.9, 47.5, NOW(), NULL,
          '{"confidence":0.7,"lead_time_days":1,"cases":156,"deaths":22}'::jsonb,
          TRUE
        )
      ON CONFLICT (source, external_id)
      DO UPDATE SET updated_at = NOW(), is_active = TRUE;
    `;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = dbUrl();
  if (!url) {
    res.status(503).json({
      error: "missing NEON_DATABASE_URL",
      threats: [],
      count: 0,
    });
    return;
  }

  const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));

  try {
    const sql = neon(url);

    if (initEnabled()) {
      await ensureSchema(sql);
    }

    const rows = await sql<HazardAlertRow[]>`
      SELECT
        id,
        type,
        severity,
        title,
        description,
        lat,
        lng,
        event_at,
        intensity,
        metadata,
        created_at,
        updated_at
      FROM hazard_alerts
      WHERE is_active = TRUE
      ORDER BY COALESCE(event_at, created_at) DESC
      LIMIT ${limit};
    `;

    const threats = rows
      .filter((r: HazardAlertRow) => Number.isFinite(r.lat as number) && Number.isFinite(r.lng as number))
      .map((r: HazardAlertRow) => ({
        id: String(r.id),
        type: r.type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        timestamp: r.event_at || r.created_at,
        center_lat: r.lat,
        center_lng: r.lng,
        lead_time_days: r.metadata?.lead_time_days ?? null,
        confidence: r.metadata?.confidence ?? null,
        detection_details: r.metadata ?? {},
        created_at: r.created_at,
      }));

    res.status(200).json({
      threats,
      count: threats.length,
      generated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(503).json({
      error: e?.message || String(e),
      threats: [],
      count: 0,
    });
  }
}
