import { neon } from "@neondatabase/serverless";
import { corsHeaders } from "../_shared/cors.js";
import { AFRICA_ISO3 } from "../_shared/africa.js";

// GDACS (UN OCHA / EC JRC) official alerts for weather-driven disasters in Africa.
// Severity is GDACS's own alert level; nothing here is scored or inferred locally.
const SOURCE = "gdacs";
const API = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const EVENT_TYPES = "TC;FL;DR;WF";
const TYPE_MAP: Record<string, string> = { TC: "cyclone", FL: "flood", DR: "drought", WF: "wildfire" };
const SEVERITY_MAP: Record<string, string> = { Red: "extreme", Orange: "high", Green: "moderate" };
const LOOKBACK_DAYS = 120;
// GDACS keeps moving an event's `todate` forward while it is ongoing; an event
// whose last update is older than this is treated as ended. Fast-onset events
// are updated at least daily, droughts only every few days.
const ACTIVE_WINDOW_DAYS: Record<string, number> = { TC: 3, FL: 3, WF: 3, DR: 14 };
const PAGE_SIZE = 100;
const MAX_PAGES = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function africanCountries(props: any): { iso3: string; name: string }[] {
  const listed = Array.isArray(props.affectedcountries) ? props.affectedcountries : [];
  const fromList = listed.map((c: any) => ({ iso3: String(c.iso3 ?? "").toUpperCase(), name: String(c.countryname ?? "") }));
  const own = String(props.iso3 ?? "").toUpperCase();
  const all = fromList.length ? fromList : own ? [{ iso3: own, name: String(props.country ?? "") }] : [];
  return all.filter((c: { iso3: string; name: string }) => AFRICA_ISO3.has(c.iso3));
}

async function fetchEvents(): Promise<any[]> {
  const today = new Date();
  const from = new Date(today.getTime() - LOOKBACK_DAYS * 86400000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const events: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API}?eventlist=${EVENT_TYPES}&alertlevel=Green;Orange;Red&fromdate=${day(from)}&todate=${day(today)}&pagesize=${PAGE_SIZE}&pagenumber=${page}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    if (resp.status === 204) break;
    if (!resp.ok) throw new Error(`GDACS API returned ${resp.status}`);
    const features = (await resp.json())?.features ?? [];
    events.push(...features);
    if (features.length < PAGE_SIZE) break;
  }
  return events;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl) return json({ error: "NEON_DATABASE_URL not set" }, 500);

  const sql = neon(dbUrl);
  const runId = `gdacs_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "")}`;

  try {
    // Fetch first: if GDACS is unreachable, existing alerts are left untouched.
    const features = await fetchEvents();
    const seen = new Set<string>();
    let upserted = 0, ended = 0;

    for (const feature of features) {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates;
      const type = TYPE_MAP[props.eventtype];
      const severity = SEVERITY_MAP[props.alertlevel];
      if (!Array.isArray(coords) || !type || !severity) continue;
      const countries = africanCountries(props);
      if (!countries.length) continue;
      const lastUpdate = Date.parse(props.todate ?? props.datemodified ?? "");
      const activeCutoff = Date.now() - ACTIVE_WINDOW_DAYS[props.eventtype] * 86400000;
      if (!Number.isFinite(lastUpdate) || lastUpdate < activeCutoff) { ended++; continue; }

      const externalId = `gdacs_${props.eventtype}_${props.eventid}`;
      if (seen.has(externalId)) continue; // keep the first (latest) episode per event
      seen.add(externalId);

      const [lng, lat] = coords;
      const title = props.name || `GDACS ${type}`;
      const description = props.description || props.htmldescription || title;
      const metadata = {
        gdacs: {
          eventid: props.eventid, episodeid: props.episodeid, eventtype: props.eventtype,
          alertlevel: props.alertlevel, alertscore: props.alertscore,
          episodealertlevel: props.episodealertlevel, episodealertscore: props.episodealertscore,
          severity_text: props.severitydata?.severitytext ?? null,
          severity_value: props.severitydata?.severity ?? null,
          severity_unit: props.severitydata?.severityunit ?? null,
          glide: props.glide || null, iscurrent: props.iscurrent,
        },
        countries: countries.map(c => c.name),
        iso3: countries.map(c => c.iso3),
        from_date: props.fromdate, to_date: props.todate,
        report_url: props.url?.report ?? null,
        source_name: "GDACS (UN OCHA / European Commission JRC)",
      };

      await sql`
        INSERT INTO hazard_alerts (
          source, external_id, type, severity, title, description, lat, lng, event_at, intensity,
          is_active, data_source_run_id, last_seen_at, metadata, source_artifact, created_at, updated_at
        ) VALUES (
          ${SOURCE}, ${externalId}, ${type}, ${severity}, ${title.slice(0, 500)}, ${description.slice(0, 2000)},
          ${lat}, ${lng}, ${props.fromdate ?? null}, ${props.alertscore ?? null},
          true, ${runId}, NOW(), ${JSON.stringify(metadata)}::jsonb, ${JSON.stringify({ api: API, properties: props })}::jsonb, NOW(), NOW()
        )
        ON CONFLICT (source, external_id) DO UPDATE SET
          type = EXCLUDED.type, severity = EXCLUDED.severity, title = EXCLUDED.title, description = EXCLUDED.description,
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, event_at = EXCLUDED.event_at, intensity = EXCLUDED.intensity,
          is_active = true, data_source_run_id = EXCLUDED.data_source_run_id, last_seen_at = NOW(),
          metadata = EXCLUDED.metadata, source_artifact = EXCLUDED.source_artifact, updated_at = NOW()`;
      upserted++;
    }

    // Events GDACS no longer lists as ongoing are no longer active.
    const deactivated = await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = ${SOURCE} AND is_active = true AND data_source_run_id IS DISTINCT FROM ${runId}
      RETURNING id` as any[];

    return json({ status: "ok", run_id: runId, events_fetched: features.length, africa_active: upserted,
      africa_ended: ended, deactivated: deactivated.length });
  } catch (e: any) {
    console.error("[ingest-gdacs] Error:", e);
    return json({ error: e?.message || String(e) }, 502);
  }
}
