import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

function dbUrl(): string {
  return (
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.PGDATABASE_URL ||
    ""
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = dbUrl();
  if (!url) {
    res.status(503).json({ status: "unavailable", runs: [], count: 0, detail: "missing NEON_DATABASE_URL" });
    return;
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 20)));

  try {
    const sql = neon(url);

    const rows = await sql<any[]>`
      SELECT id, source, model, model_version, run_label,
             init_time, horizon_hours, step_hours,
             region_bbox, grid_spec, input_provenance, artifact_uris,
             status, detail, created_at
      FROM forecast_runs
      ORDER BY init_time DESC
      LIMIT ${limit};
    `;

    res.status(200).json({
      timestamp: new Date().toISOString(),
      status: "ok",
      runs: rows,
      count: rows.length,
    });
  } catch (e: any) {
    res.status(200).json({
      timestamp: new Date().toISOString(),
      status: "not_configured",
      runs: [],
      count: 0,
      detail: e?.message || String(e),
    });
  }
}
