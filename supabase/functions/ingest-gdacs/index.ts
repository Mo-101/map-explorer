import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";
import countryVuln from "../_shared/country_vulnerability.json" assert { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCE = "gdacs";

// Africa bounding box
const AFRICA = { lat_min: -35, lat_max: 40, lon_min: -25, lon_max: 55 };

const TYPE_MAP: Record<string, string> = {
  EQ: "earthquake", TC: "cyclone", FL: "flood", VO: "volcano", DR: "drought",
};
const SEVERITY_MAP: Record<string, string> = {
  Red: "extreme", Orange: "high", Green: "medium",
};

function isInAfrica(lat: number, lon: number): boolean {
  return lat >= AFRICA.lat_min && lat <= AFRICA.lat_max && lon >= AFRICA.lon_min && lon <= AFRICA.lon_max;
}

/** Compute simplified GDACS-style impact metrics from native GDACS fields */
function enrichGdacsMetadata(props: any, eventType: string, alertLevel: string) {
  const gdacs: Record<string, any> = {
    level: alertLevel === "Red" ? "red" : alertLevel === "Orange" ? "orange" : "green",
    alertscore: props.alertscore ?? null,
    population_affected: props.population?.value ?? props.populationcount ?? null,
    severity_unit: props.severitydata?.severityunit ?? null,
    severity_value: props.severitydata?.severity ?? null,
  };

  // EQ-specific: compute raw impact score
  if (eventType === "earthquake" && props.severitydata?.severity) {
    const mag = Number(props.severitydata.severity) || 0;
    const depth = Number(props.severitydata.severityunit === "km" ? props.severitydata.severity : 10);
    gdacs.magnitude = mag;
    gdacs.raw_score = -7.75 + 0.82 * mag - 0.53 * Math.log10(Math.max(depth, 1));
  }

  // TC-specific: wind category
  if (eventType === "cyclone") {
    const windKph = Number(props.severitydata?.severity) || 0;
    const windKt = windKph * 0.5399; // kph to knots
    gdacs.wind_kph = windKph;
    gdacs.wind_kt = +windKt.toFixed(0);
    if (windKt >= 137) gdacs.category = "CAT5";
    else if (windKt >= 113) gdacs.category = "CAT4";
    else if (windKt >= 96) gdacs.category = "CAT3";
    else if (windKt >= 83) gdacs.category = "CAT2";
    else if (windKt >= 64) gdacs.category = "CAT1";
    else if (windKt >= 34) gdacs.category = "TS";
    else gdacs.category = "TD";
  }

  // DR-specific
  if (eventType === "drought") {
    gdacs.drought_score = props.alertscore ?? null;
  }

  // Country vulnerability lookup
  const country = props.country || props.countryname;
  if (country) {
    const vuln = (countryVuln as Record<string, { inform_lcc: number }>)[country]?.inform_lcc;
    if (vuln !== undefined) {
      gdacs.inform_vulnerability = vuln;
      gdacs.country = country;
    }
  }

  return gdacs;
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
  const runId = `gdacs_${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

  try {
    // ── Two-layer stale cleanup (before early-return) ──
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

    // ── Fetch GDACS events ──
    const gdacsUrl = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=Green;Orange;Red&eventtype=EQ,TC,FL,VO,DR&limit=50";
    const resp = await fetch(gdacsUrl, {
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      throw new Error(`GDACS API returned ${resp.status}`);
    }

    const data = await resp.json();
    const features = data?.features || [];

    let upsertCount = 0;

    for (const feature of features) {
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (!geom?.coordinates) continue;

      const lon = geom.coordinates[0];
      const lat = geom.coordinates[1];

      if (!isInAfrica(lat, lon)) continue;

      const eventType = TYPE_MAP[props.eventtype] || props.eventtype?.toLowerCase() || "unknown";
      const severity = SEVERITY_MAP[props.alertlevel] || "medium";
      const externalId = `gdacs_${props.eventid || props.eventtype}_${props.episodeid || "0"}`;
      const title = props.name || props.htmldescription || `GDACS ${eventType}`;
      const description = props.description || props.htmldescription || title;

      // ── Enriched GDACS metadata ──
      const gdacs = enrichGdacsMetadata(props, eventType, props.alertlevel);

      const metadata = {
        alertscore: props.alertscore,
        country: props.country,
        fromdate: props.fromdate,
        todate: props.todate,
        gdacs,
      };

      await sql`
        INSERT INTO hazard_alerts (
          source, external_id, type, severity, title, description,
          lat, lng, is_active, data_source_run_id, last_seen_at,
          metadata, created_at, updated_at
        ) VALUES (
          ${SOURCE}, ${externalId}, ${eventType}, ${severity}, ${title.slice(0, 500)},
          ${description.slice(0, 2000)}, ${lat}, ${lon}, true, ${runId}, NOW(),
          ${JSON.stringify(metadata)}::jsonb,
          NOW(), NOW()
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          is_active = true,
          data_source_run_id = EXCLUDED.data_source_run_id,
          last_seen_at = NOW(),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`;
      upsertCount++;
    }

    console.log(`[ingest-gdacs] Upserted ${upsertCount} alerts from ${features.length} GDACS events`);

    return new Response(JSON.stringify({
      status: "ok",
      run_id: runId,
      total_events: features.length,
      africa_upserted: upsertCount,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ingest-gdacs] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
