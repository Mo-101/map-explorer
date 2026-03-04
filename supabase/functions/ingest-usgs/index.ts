import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";
import countryVuln from "../_shared/country_vulnerability.json" assert { type: "json" };
import { getCountryName } from "../_shared/geo_utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "usgs";

const AFRICA_BOUNDS = { minLat: -35, maxLat: 37, minLon: -20, maxLon: 52 };

function isInAfrica(lat: number, lon: number): boolean {
  return lat >= AFRICA_BOUNDS.minLat && lat <= AFRICA_BOUNDS.maxLat &&
         lon >= AFRICA_BOUNDS.minLon && lon <= AFRICA_BOUNDS.maxLon;
}

function mapMagnitudeToSeverity(mag: number): string {
  if (mag >= 7) return "extreme";
  if (mag >= 6) return "high";
  if (mag >= 5) return "moderate";
  return "low";
}

/** Simplified GDACS EQ impact score (without population term).
 *  Formula: rawScore = -7.75 + 0.82*mag - 0.53*log10(depth)
 *  Then adjusted by INFORM Lack of Coping Capacity vulnerability. */
function computeGdacsEqScore(mag: number, depthKm: number, country: string | null) {
  const vuln = (countryVuln as Record<string, { inform_lcc: number }>)[country ?? ""]?.inform_lcc ?? 0.6;
  const rawScore = -7.75 + 0.82 * mag - 0.53 * Math.log10(Math.max(depthKm, 1));
  const gdacsScore = rawScore * vuln;

  let gdacsLevel = "green";
  if (gdacsScore >= 2) gdacsLevel = "red";
  else if (gdacsScore >= 1) gdacsLevel = "orange";

  return { score: +gdacsScore.toFixed(3), level: gdacsLevel, raw_score: +rawScore.toFixed(3), vulnerability: vuln, country };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get("NEON_DATABASE_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "NEON_DATABASE_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sql = neon(dbUrl);
  const runId = `usgs_${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

  try {
    // ── Two-layer stale cleanup ──
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND data_source_run_id IS NOT NULL AND data_source_run_id != ${runId}`;
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND last_seen_at < NOW() - INTERVAL '72 hours'`;

    // ── Watermark check ──
    const existingRun = await sql`
      SELECT 1 FROM hazard_alerts WHERE data_source_run_id = ${runId} AND source = ${SOURCE} LIMIT 1`;
    if (existingRun.length > 0) {
      return new Response(JSON.stringify({ status: "already_ingested", run_id: runId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch USGS significant earthquakes (past 30 days) ──
    const apiUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson";
    const resp = await fetch(apiUrl, { headers: { Accept: "application/json" } });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[ingest-usgs] API error ${resp.status}:`, errBody);
      throw new Error(`USGS API returned ${resp.status}`);
    }

    const geojson = await resp.json();
    const features = geojson?.features || [];

    let upsertCount = 0;
    let skippedNonAfrica = 0;

    for (const feature of features) {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      const lon = coords[0];
      const lat = coords[1];
      const depth = coords[2] || 0;

      if (!isInAfrica(lat, lon)) {
        skippedNonAfrica++;
        continue;
      }

      const mag = props.mag || 0;
      const externalId = `usgs_${feature.id || props.code || props.ids}`;
      const title = props.title || props.place || "USGS Earthquake";
      const severity = mapMagnitudeToSeverity(mag);
      const eventTime = props.time ? new Date(props.time).toISOString() : new Date().toISOString();

      // ── GDACS impact score ──
      const country = getCountryName(lat, lon);
      const gdacs = computeGdacsEqScore(mag, depth, country);

      // Override severity if GDACS says it's worse
      const effectiveSeverity = gdacs.level === "red" && severity !== "extreme" ? "high" : severity;

      const metadata = {
        magnitude: mag,
        depth_km: depth,
        place: props.place,
        event_time: eventTime,
        tsunami: props.tsunami,
        felt: props.felt,
        cdi: props.cdi,
        mmi: props.mmi,
        alert: props.alert,
        url: props.url,
        gdacs: gdacs,
      };

      await sql`
        INSERT INTO hazard_alerts (
          source, external_id, type, severity, title, description,
          lat, lng, is_active, data_source_run_id, last_seen_at,
          metadata, created_at, updated_at
        ) VALUES (
          ${SOURCE}, ${externalId}, 'earthquake', ${effectiveSeverity}, ${title.slice(0, 500)},
          ${`M${mag} earthquake - ${props.place || 'Unknown location'} (depth: ${depth}km) | GDACS: ${gdacs.level} (${gdacs.score})`},
          ${lat}, ${lon}, true, ${runId}, NOW(),
          ${JSON.stringify(metadata)}::jsonb,
          NOW(), NOW()
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          severity = EXCLUDED.severity,
          is_active = true,
          data_source_run_id = EXCLUDED.data_source_run_id,
          last_seen_at = NOW(),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`;
      upsertCount++;
    }

    console.log(`[ingest-usgs] Upserted ${upsertCount}, skipped ${skippedNonAfrica} non-Africa from ${features.length} total`);

    return new Response(JSON.stringify({
      status: "ok",
      run_id: runId,
      total_features: features.length,
      upserted: upsertCount,
      skipped_non_africa: skippedNonAfrica,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ingest-usgs] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
