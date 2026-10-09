import { neon } from "@neondatabase/serverless";
import { corsHeaders } from "../_shared/cors.js";

// Joint Typhoon Warning Center tropical cyclone warnings for the basins that
// reach Africa: Southern Hemisphere (sh, i.e. the South-West Indian Ocean) and
// North Indian Ocean (io, the Arabian Sea / Horn of Africa side). Positions,
// winds and forecast track are parsed from JTWC's official warning text.
const SOURCE = "jtwc";
const RSS_URL = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss";
const AFRICAN_BASINS = new Set(["sh", "io"]);
// Western part of each basin, where systems can affect Africa and its islands.
const MAX_LON_BY_BASIN: Record<string, number> = { sh: 90, io: 75 };

// RSMC La Réunion (official SWIO centre) intensity scale, 10-min winds in kt.
// JTWC reports 1-min winds, so these categories are indicative, as labelled.
function classify(windKt: number): { category: string; severity: string } {
  if (windKt >= 116) return { category: "Very intense tropical cyclone", severity: "extreme" };
  if (windKt >= 90) return { category: "Intense tropical cyclone", severity: "extreme" };
  if (windKt >= 64) return { category: "Tropical cyclone", severity: "high" };
  if (windKt >= 48) return { category: "Severe tropical storm", severity: "moderate" };
  if (windKt >= 34) return { category: "Moderate tropical storm", severity: "moderate" };
  return { category: "Tropical depression", severity: "low" };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const coord = (value: string, hemi: string) => Number(value) * (hemi === "S" || hemi === "W" ? -1 : 1);
const POSIT = /(\d{6})Z\s*---\s*(?:NEAR\s+)?(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/;

export interface JtwcWarning {
  stormId: string; name: string; warningNumber: string; issued: string;
  lat: number; lon: number; windKt: number; gustKt: number | null;
  track: { valid: string; lat: number; lon: number; windKt: number | null }[];
}

export function parseWarning(stormId: string, text: string): JtwcWarning | null {
  const subject = text.match(/SUBJ\/(.+?)\s+WARNING NR\s+(\d+)/);
  const current = text.split(/WARNING POSITION:/)[1];
  if (!subject || !current) return null;
  const pos = current.match(POSIT);
  const wind = current.match(/MAX SUSTAINED WINDS - (\d+) KT(?:, GUSTS (\d+) KT)?/);
  if (!pos || !wind) return null;
  const track: JtwcWarning["track"] = [];
  const forecasts = text.split(/FORECASTS:/)[1] ?? "";
  for (const block of forecasts.split(/\n\s*---/)) {
    const p = block.match(POSIT);
    if (!p) continue;
    const w = block.match(/MAX SUSTAINED WINDS - (\d+) KT/);
    track.push({ valid: p[1], lat: coord(p[2], p[3]), lon: coord(p[4], p[5]), windKt: w ? Number(w[1]) : null });
  }
  return {
    stormId, name: subject[1].trim(), warningNumber: subject[2], issued: pos[1],
    lat: coord(pos[2], pos[3]), lon: coord(pos[4], pos[5]),
    windKt: Number(wind[1]), gustKt: wind[2] ? Number(wind[2]) : null, track,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const neonUrl = process.env.NEON_DATABASE_URL;
  if (!neonUrl) return json({ error: "missing NEON_DATABASE_URL" }, 503);

  const sql = neon(neonUrl);
  const runId = `jtwc_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "")}`;
  const headers = { "User-Agent": "Mozilla/5.0 (AFRO-STORM hazard monitor)" };

  try {
    // Fetch first: if JTWC is unreachable, existing alerts are left untouched.
    const rssResp = await fetch(RSS_URL, { headers, signal: AbortSignal.timeout(30000) });
    if (!rssResp.ok) throw new Error(`JTWC RSS returned ${rssResp.status}`);
    const rss = await rssResp.text();
    const links = [...new Set([...rss.matchAll(/https?:\/\/[^'"\s<>]+\/products\/([a-z]{2})(\d{4})web\.txt/g)]
      .filter(m => AFRICAN_BASINS.has(m[1])).map(m => m[0]))];

    const warnings: JtwcWarning[] = [];
    for (const link of links) {
      const id = link.match(/products\/([a-z]{2}\d{4})web\.txt/)![1];
      const resp = await fetch(link, { headers, signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`JTWC warning ${id} returned ${resp.status}`);
      const warning = parseWarning(id, await resp.text());
      if (!warning) throw new Error(`JTWC warning ${id} could not be parsed`);
      if (warning.lon <= MAX_LON_BY_BASIN[id.slice(0, 2)]) warnings.push(warning);
    }

    for (const w of warnings) {
      const { category, severity } = classify(w.windKt);
      const metadata = {
        storm_id: w.stormId, warning_number: w.warningNumber, issued: `${w.issued}Z`,
        max_sustained_wind_kt_1min: w.windKt, gust_kt: w.gustKt, category,
        category_scale: "RSMC La Réunion SWIO scale (indicative: JTWC winds are 1-min averages)",
        forecast_track: w.track,
        report_url: `https://www.metoc.navy.mil/jtwc/products/${w.stormId}web.txt`,
        source_name: "Joint Typhoon Warning Center (JTWC)",
      };
      await sql`
        INSERT INTO hazard_alerts (external_id, source, type, severity, title, description, lat, lng, event_at, intensity,
          metadata, source_artifact, is_active, data_source_run_id, last_seen_at)
        VALUES (${`jtwc_${w.stormId}`}, ${SOURCE}, 'cyclone', ${severity}, ${`${w.name} (${category})`},
          ${`JTWC warning ${w.warningNumber}: max sustained winds ${w.windKt} kt${w.gustKt ? `, gusts ${w.gustKt} kt` : ""} near ${Math.abs(w.lat)}°${w.lat < 0 ? "S" : "N"} ${Math.abs(w.lon)}°${w.lon < 0 ? "W" : "E"}. ${w.track.length} forecast positions.`},
          ${w.lat}, ${w.lon}, NOW(), ${w.windKt}, ${JSON.stringify(metadata)}::jsonb, ${JSON.stringify({ rss: RSS_URL, storm_id: w.stormId })}::jsonb,
          TRUE, ${runId}, NOW())
        ON CONFLICT (source, external_id) DO UPDATE SET
          severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description,
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, intensity = EXCLUDED.intensity, metadata = EXCLUDED.metadata,
          source_artifact = EXCLUDED.source_artifact, is_active = TRUE, data_source_run_id = EXCLUDED.data_source_run_id,
          last_seen_at = NOW(), updated_at = NOW()`;
    }

    // Storms JTWC no longer issues warnings for are no longer active.
    const deactivated = await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true AND data_source_run_id IS DISTINCT FROM ${runId}
      RETURNING id` as any[];

    return json({ status: "ok", run_id: runId, african_basin_warnings: links.length, active_storms: warnings.length,
      deactivated: deactivated.length, storms: warnings.map(w => `${w.name} ${w.windKt}kt`) });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 502);
  }
}
