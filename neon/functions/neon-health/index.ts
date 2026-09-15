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
    await sql`SELECT 1;`;
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM hazard_alerts WHERE is_active = TRUE;`;

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
