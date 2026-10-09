import { neon } from "@neondatabase/serverless";
import { corsHeaders } from "../_shared/cors.js";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (!dbUrl) {
    return new Response(JSON.stringify({ database: "disconnected", error: "NEON_DATABASE_URL not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const sql = neon(dbUrl, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
    const pingResult = await sql`SELECT NOW() as server_time` as any;
    const serverTime = pingResult[0]?.server_time;

    const activeResult = await sql`SELECT COUNT(*) as count FROM hazard_alerts WHERE is_active = true` as any;
    const activeThreats = Number(activeResult[0]?.count || 0);

    const staleResult = await sql`
      SELECT COUNT(*) as count FROM hazard_alerts
      WHERE is_active = false AND updated_at > NOW() - INTERVAL '24 hours'` as any;
    const recentlyDeactivated = Number(staleResult[0]?.count || 0);

    const lastIngest = await sql`
      SELECT source, MAX(updated_at) as last_updated, COUNT(*) as active_count
      FROM hazard_alerts WHERE is_active = true GROUP BY source ORDER BY source` as any;

    const bySource: Record<string, { last_updated: string; active_count: number }> = {};
    for (const row of lastIngest) {
      bySource[row.source] = { last_updated: row.last_updated, active_count: Number(row.active_count) };
    }

    const sevResult = await sql`
      SELECT severity, COUNT(*) as count FROM hazard_alerts
      WHERE is_active = true GROUP BY severity` as any;
    const bySeverity: Record<string, number> = {};
    for (const row of sevResult) bySeverity[row.severity] = Number(row.count);

    const totalResult = await sql`SELECT COUNT(*) as count FROM hazard_alerts` as any;
    const totalRows = Number(totalResult[0]?.count || 0);

    let graphcast: any = { status: "unknown", active_alerts: 0, latest_run: null };
    try {
      const [latest, active] = await Promise.all([
        sql`SELECT run_id, status, created_at, completed_at FROM forecast_runs WHERE source ILIKE '%graphcast%' OR model_name ILIKE '%graphcast%' ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT COUNT(*)::int AS count FROM hazard_alerts WHERE is_active AND (source ILIKE '%graphcast%' OR metadata->>'model' ILIKE '%graphcast%')`,
      ]);
      const run = latest[0];
      const age = run ? Date.now() - new Date(String(run.created_at)).getTime() : Infinity;
      graphcast = { status: !run ? "no recorded runs" : age > 86400000 ? "stale" : run.status,
        active_alerts: Number(active[0]?.count || 0), latest_run: run || null };
    } catch { /* monitoring tables may be unavailable; report unknown */ }
    return new Response(JSON.stringify({
      database: "connected",
      models: { graphcast: { ...graphcast, implementation: "Repository rollout is a placeholder; no inference implemented" }, ai_brief: { configured: Boolean(process.env.LOVABLE_API_KEY), model: "google/gemini-3-flash-preview", role: "Text summary only; does not generate weather forecasts" } },
      server_time: serverTime,
      active_threats: activeThreats,
      recently_deactivated: recentlyDeactivated,
      total_rows: totalRows,
      by_source: bySource,
      by_severity: bySeverity,
      checked_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[smoke-test] Error:", e);
    return new Response(JSON.stringify({
      database: "error", error: e?.message || String(e), checked_at: new Date().toISOString(),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
