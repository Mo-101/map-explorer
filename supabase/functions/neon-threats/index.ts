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
      JSON.stringify({ error: "missing NEON_DATABASE_URL", threats: [], count: 0 }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sql = neon(url);
    const reqUrl = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Number(reqUrl.searchParams.get("limit") ?? 100)));

    const rows = await sql`
      SELECT id, type, severity, title, description, lat, lng, event_at, intensity, metadata, created_at, updated_at
      FROM hazard_alerts
      WHERE is_active = TRUE
      ORDER BY COALESCE(event_at, created_at) DESC
      LIMIT ${limit};
    `;

    const threats = rows
      .filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r: any) => ({
        id: String(r.id),
        type: r.type,
        threat_type: r.type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        timestamp: r.event_at || r.created_at,
        center_lat: r.lat,
        center_lng: r.lng,
        latitude: r.lat,
        longitude: r.lng,
        lead_time_days: r.metadata?.lead_time_days ?? null,
        confidence: r.metadata?.confidence ?? null,
        detection_details: r.metadata ?? {},
        created_at: r.created_at,
      }));

    return new Response(
      JSON.stringify({ threats, count: threats.length, generated_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e), threats: [], count: 0 }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
