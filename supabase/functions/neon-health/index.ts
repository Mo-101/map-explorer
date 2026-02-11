import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = Deno.env.get("NEON_DATABASE_URL");
  if (!url) {
    return new Response(
      JSON.stringify({ status: "degraded", db: "missing NEON_DATABASE_URL", checked_at: new Date().toISOString() }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sql = neon(url);

    // Auto-init schema
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

    // Seed if empty
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM hazard_alerts WHERE is_active = TRUE;`;
    if (count === 0) {
      await sql`
        INSERT INTO hazard_alerts (external_id, source, type, severity, title, description, lat, lng, event_at, intensity, metadata, is_active)
        VALUES
          ('seed-cyclone-001', 'seed', 'cyclone', 'high', 'Cyclone Freddy', 'Tropical cyclone approaching Madagascar', -18.6, 45.1, NOW(), 80, '{"confidence":0.8,"lead_time_days":2,"wind_speed":95,"min_pressure_hpa":975}'::jsonb, TRUE),
          ('seed-cholera-001', 'seed', 'cholera', 'moderate', 'Cholera Outbreak', 'Outbreak detected in Antananarivo region', -18.9, 47.5, NOW(), NULL, '{"confidence":0.7,"lead_time_days":1,"cases":156,"deaths":22}'::jsonb, TRUE),
          ('seed-flood-001', 'seed', 'flood', 'high', 'Niger River Flooding', 'Severe flooding along Niger River basin', 13.5, 2.1, NOW(), 65, '{"confidence":0.85,"lead_time_days":3,"river_level_rise":"2.4m","affected_population":45000}'::jsonb, TRUE)
        ON CONFLICT (source, external_id) DO UPDATE SET updated_at = NOW(), is_active = TRUE;
      `;
    }

    await sql`SELECT 1;`;

    return new Response(
      JSON.stringify({ status: "healthy", db: "connected", system_mode: "dev", threats_count: count, checked_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ status: "degraded", db: `error: ${e?.message || String(e)}`, checked_at: new Date().toISOString() }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
