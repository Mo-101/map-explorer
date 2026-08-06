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

  const dbUrl = Deno.env.get("NEON_DATABASE_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({
      database: "disconnected",
      error: "NEON_DATABASE_URL not set",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sql = neon(dbUrl);

    // DB connectivity check
    const pingResult = await sql`SELECT NOW() as server_time`;
    const serverTime = pingResult[0]?.server_time;

    // Active threat count
    const activeResult = await sql`SELECT COUNT(*) as count FROM hazard_alerts WHERE is_active = true`;
    const activeThreats = Number(activeResult[0]?.count || 0);

    // Stale alerts (inactive in last 24h)
    const staleResult = await sql`
      SELECT COUNT(*) as count FROM hazard_alerts
      WHERE is_active = false AND updated_at > NOW() - INTERVAL '24 hours'`;
    const recentlyDeactivated = Number(staleResult[0]?.count || 0);

    // Last ingestion per source
    const lastIngest = await sql`
      SELECT source, MAX(updated_at) as last_updated, COUNT(*) as active_count
      FROM hazard_alerts WHERE is_active = true GROUP BY source ORDER BY source`;

    const bySource: Record<string, { last_updated: string; active_count: number }> = {};
    for (const row of lastIngest) {
      bySource[row.source] = {
        last_updated: row.last_updated,
        active_count: Number(row.active_count),
      };
    }

    // By severity
    const sevResult = await sql`
      SELECT severity, COUNT(*) as count FROM hazard_alerts
      WHERE is_active = true GROUP BY severity`;
    const bySeverity: Record<string, number> = {};
    for (const row of sevResult) {
      bySeverity[row.severity] = Number(row.count);
    }

    // Total rows
    const totalResult = await sql`SELECT COUNT(*) as count FROM hazard_alerts`;
    const totalRows = Number(totalResult[0]?.count || 0);

    return new Response(JSON.stringify({
      database: "connected",
      server_time: serverTime,
      active_threats: activeThreats,
      recently_deactivated: recentlyDeactivated,
      total_rows: totalRows,
      by_source: bySource,
      by_severity: bySeverity,
      checked_at: new Date().toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[smoke-test] Error:", e);
    return new Response(JSON.stringify({
      database: "error",
      error: e?.message || String(e),
      checked_at: new Date().toISOString(),
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
