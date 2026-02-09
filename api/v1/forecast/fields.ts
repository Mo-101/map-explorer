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
    res.status(503).json({ status: "unavailable", fields: [], count: 0, detail: "missing NEON_DATABASE_URL" });
    return;
  }

  const runId = Number(req.query.run_id);
  const field = typeof req.query.field === "string" ? req.query.field : undefined;
  const limit = Math.max(1, Math.min(2000, Number(req.query.limit ?? 200)));

  if (!Number.isFinite(runId)) {
    res.status(400).json({ error: "run_id is required" });
    return;
  }

  try {
    const sql = neon(url);

    const rows = field
      ? await sql<any[]>`
          SELECT id, run_id, field, level, valid_time,
                 uri, content_type, geojson, metadata, created_at
          FROM forecast_fields
          WHERE run_id = ${runId} AND field = ${field}
          ORDER BY valid_time ASC
          LIMIT ${limit};
        `
      : await sql<any[]>`
          SELECT id, run_id, field, level, valid_time,
                 uri, content_type, geojson, metadata, created_at
          FROM forecast_fields
          WHERE run_id = ${runId}
          ORDER BY valid_time ASC
          LIMIT ${limit};
        `;

    res.status(200).json({
      timestamp: new Date().toISOString(),
      status: "ok",
      fields: rows,
      count: rows.length,
    });
  } catch (e: any) {
    res.status(200).json({
      timestamp: new Date().toISOString(),
      status: "not_configured",
      fields: [],
      count: 0,
      detail: e?.message || String(e),
    });
  }
}
