import { neon } from "@neondatabase/serverless";
import { corsHeaders } from "../_shared/cors.js";
import countryVuln from "../_shared/country_vulnerability.json" with { type: "json" };
import { getCountryName } from "../_shared/geo_utils.js";

const SOURCE = "firms";
const AFRICA = { lat_min: -35, lat_max: 38, lon_min: -25, lon_max: 55 };

function isInAfrica(lat: number, lon: number): boolean {
  return lat >= AFRICA.lat_min && lat <= AFRICA.lat_max &&
         lon >= AFRICA.lon_min && lon <= AFRICA.lon_max;
}
function severityFromFrp(frp: number): string {
  if (frp > 1000) return "extreme";
  if (frp > 500) return "high";
  if (frp > 100) return "moderate";
  return "low";
}
function gdacsLevelFromFrp(frp: number, vuln: number): string {
  const adjusted = frp * (0.5 + vuln);
  if (adjusted > 800) return "red";
  if (adjusted > 300) return "orange";
  return "green";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const dbUrl = process.env.NEON_DATABASE_URL;
  const apiKey = process.env.FIRMS_API_KEY;
  if (!dbUrl) return new Response(JSON.stringify({ error: "NEON_DATABASE_URL not set" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!apiKey) return new Response(JSON.stringify({ error: "FIRMS_API_KEY not set" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sql = neon(dbUrl);
  const runId = `firms_${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

  try {
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND data_source_run_id IS NOT NULL AND data_source_run_id != ${runId}`;
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true
        AND last_seen_at < NOW() - INTERVAL '72 hours'`;

    const existing = await sql`
      SELECT 1 FROM hazard_alerts WHERE data_source_run_id = ${runId} AND source = ${SOURCE} LIMIT 1` as any[];
    if (existing.length > 0) {
      return new Response(JSON.stringify({ status: "already_ingested", run_id: runId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sensors = ["VIIRS_SNPP_NRT", "MODIS_NRT"];
    let allFires: any[] = [];
    let sensorUsed = "";

    for (const sensor of sensors) {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${sensor}/${AFRICA.lon_min},${AFRICA.lat_min},${AFRICA.lon_max},${AFRICA.lat_max}/1`;
        const resp = await fetch(url, { headers: { "User-Agent": "AfroStorm/1.0 (fire monitoring)" } });
        if (!resp.ok) { await resp.text(); continue; }

        const csv = await resp.text();
        const lines = csv.trim().split("\n");
        if (lines.length < 2) continue;

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        const latIdx = headers.indexOf("latitude");
        const lonIdx = headers.indexOf("longitude");
        const frpIdx = headers.indexOf("frp");
        const confIdx = headers.indexOf("confidence");
        const dateIdx = headers.indexOf("acq_date");
        const timeIdx = headers.indexOf("acq_time");
        const satIdx = headers.indexOf("satellite");
        const dnIdx = headers.indexOf("daynight");
        const brightIdx = headers.indexOf("bright_ti4") !== -1 ? headers.indexOf("bright_ti4") : headers.indexOf("brightness");
        if (latIdx === -1 || lonIdx === -1) continue;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          const lat = parseFloat(cols[latIdx]);
          const lon = parseFloat(cols[lonIdx]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (!isInAfrica(lat, lon)) continue;

          const frp = frpIdx !== -1 ? parseFloat(cols[frpIdx]) || 0 : 0;
          const confidence = confIdx !== -1 ? cols[confIdx]?.trim() : "n";
          const acqDate = dateIdx !== -1 ? cols[dateIdx]?.trim() : "";
          const acqTime = timeIdx !== -1 ? cols[timeIdx]?.trim() : "";
          const satellite = satIdx !== -1 ? cols[satIdx]?.trim() : sensor;
          const daynight = dnIdx !== -1 ? cols[dnIdx]?.trim() : "";
          const brightness = brightIdx !== -1 ? parseFloat(cols[brightIdx]) || 0 : 0;
          if (confidence === "l" || confidence === "low") continue;
          allFires.push({ lat, lon, frp, confidence, acqDate, acqTime, satellite, daynight, brightness });
        }

        sensorUsed = sensor;
        if (allFires.length > 0) break;
      } catch (e) { console.warn(`[ingest-firms] ${sensor} fetch error:`, e); }
    }

    if (allFires.length === 0) {
      return new Response(JSON.stringify({ status: "no_data", run_id: runId, message: "No fire detections found in Africa from any sensor" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const deduped = new Map<string, typeof allFires[0]>();
    for (const f of allFires) {
      const key = `${f.acqDate}_${(f.lat).toFixed(2)}_${(f.lon).toFixed(2)}`;
      const existingFire = deduped.get(key);
      if (!existingFire || f.frp > existingFire.frp) deduped.set(key, f);
    }

    let upsertCount = 0, skipped = 0;
    const sortedFires = [...deduped.values()].sort((a, b) => b.frp - a.frp).slice(0, 200);

    for (const f of sortedFires) {
      const severity = severityFromFrp(f.frp);
      const country = getCountryName(f.lat, f.lon);
      const vuln = (countryVuln as Record<string, { inform_lcc: number }>)[country ?? ""]?.inform_lcc ?? 0.6;
      const gdacsLevel = gdacsLevelFromFrp(f.frp, vuln);

      const externalId = `firms_${f.acqDate}_${f.lat.toFixed(2)}_${f.lon.toFixed(2)}`;
      const title = `🔥 Active Fire${country ? ` — ${country}` : ""} (FRP ${f.frp.toFixed(0)})`;
      const description = `Fire detected ${f.acqDate} ${f.acqTime} UTC by ${f.satellite}. FRP: ${f.frp.toFixed(1)} MW. Confidence: ${f.confidence}.${country ? ` Country: ${country}.` : ""}`;
      const metadata = {
        frp: f.frp, brightness: f.brightness, confidence: f.confidence, satellite: f.satellite,
        acquisition_date: f.acqDate, acquisition_time: f.acqTime, daynight: f.daynight, sensor: sensorUsed,
        gdacs: { level: gdacsLevel, score: f.frp * (0.5 + vuln), vulnerability: vuln, country },
      };

      try {
        await sql`
          INSERT INTO hazard_alerts (
            source, external_id, type, severity, title, description,
            lat, lng, intensity, is_active, data_source_run_id, last_seen_at,
            metadata, created_at, updated_at
          ) VALUES (
            ${SOURCE}, ${externalId}, 'fire', ${severity}, ${title.slice(0, 500)},
            ${description.slice(0, 2000)},
            ${f.lat}, ${f.lon}, ${f.frp}, true, ${runId}, NOW(),
            ${JSON.stringify(metadata)}::jsonb, NOW(), NOW()
          )
          ON CONFLICT (source, external_id) DO UPDATE SET
            severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description,
            intensity = EXCLUDED.intensity, is_active = true,
            data_source_run_id = EXCLUDED.data_source_run_id, last_seen_at = NOW(),
            metadata = EXCLUDED.metadata, updated_at = NOW()`;
        upsertCount++;
      } catch (e) { console.warn(`[ingest-firms] upsert error for ${externalId}:`, e); skipped++; }
    }

    return new Response(JSON.stringify({ status: "ok", run_id: runId, sensor: sensorUsed,
      raw_detections: allFires.length, deduped: deduped.size, upserted: upsertCount, skipped,
      top_frp: sortedFires[0]?.frp ?? 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ingest-firms] Error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
