import { neon } from "@neondatabase/serverless";
import { corsHeaders } from "../_shared/cors.js";

// Read-only: a health check must never change the schema or insert data.
export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    return new Response(
      JSON.stringify({ status: "degraded", db: "missing NEON_DATABASE_URL", checked_at: new Date().toISOString() }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sql = neon(url);
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM hazard_alerts WHERE is_active = TRUE;` as any;
    return new Response(
      JSON.stringify({ status: "healthy", db: "connected", threats_count: count, checked_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ status: "degraded", db: `error: ${e?.message || String(e)}`, checked_at: new Date().toISOString() }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
