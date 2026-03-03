import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Externalized, versionable, auditable thresholds ──
const THRESHOLDS = {
  rain_24h_high: 100,    // mm
  rain_24h_extreme: 200, // mm
  rain_72h_high: 200,    // mm
  rain_72h_extreme: 400, // mm
};

const STALE_HOURS = 72;

// ── Expanded monitoring points: 35 strategic flood-prone locations ──
const MONITORING_POINTS = [
  // East Africa
  { lat: -1.3, lon: 36.8, name: "Kenya Highlands" },
  { lat: 9.0, lon: 38.7, name: "Ethiopian Highlands" },
  { lat: 0.3, lon: 32.6, name: "Lake Victoria Basin" },
  { lat: -6.8, lon: 39.3, name: "Dar es Salaam Coast" },
  { lat: 2.0, lon: 45.3, name: "Mogadishu" },
  { lat: -1.9, lon: 29.9, name: "Rwanda Highlands" },
  { lat: -3.4, lon: 29.4, name: "Bujumbura Lowlands" },
  { lat: -8.0, lon: 32.0, name: "Tanzania Western" },
  // Southern Africa
  { lat: -26.2, lon: 28.0, name: "Gauteng SA" },
  { lat: -15.4, lon: 35.0, name: "Malawi Shire Basin" },
  { lat: -15.4, lon: 28.3, name: "Lusaka Basin" },
  { lat: -17.8, lon: 31.0, name: "Harare Catchment" },
  { lat: -25.9, lon: 32.6, name: "Maputo Coastal" },
  { lat: -8.8, lon: 13.2, name: "Luanda Coastal" },
  // West Africa
  { lat: 6.5, lon: 3.4, name: "Lagos Coastal" },
  { lat: 9.1, lon: 7.5, name: "Niger-Benue Confluence" },
  { lat: 14.7, lon: -17.5, name: "Senegal Coast" },
  { lat: 5.6, lon: -0.2, name: "Ghana Volta Basin" },
  { lat: 12.4, lon: -1.5, name: "Ouagadougou Basin" },
  { lat: 12.6, lon: -8.0, name: "Upper Niger Basin" },
  { lat: 9.5, lon: -13.7, name: "Conakry Coast" },
  { lat: 6.3, lon: -10.8, name: "Monrovia Coast" },
  // North Africa
  { lat: 30.0, lon: 31.2, name: "Nile Delta" },
  { lat: 15.6, lon: 32.5, name: "Khartoum Nile" },
  { lat: 36.8, lon: 3.1, name: "Algiers Coast" },
  // Central Africa
  { lat: -4.3, lon: 15.3, name: "Congo Basin" },
  { lat: 3.9, lon: 11.5, name: "Cameroon Highlands" },
  { lat: 4.4, lon: 18.6, name: "Central African Basin" },
  // Sahel
  { lat: 13.5, lon: 2.1, name: "Niger River Basin" },
  { lat: 12.1, lon: 15.0, name: "Lake Chad Basin" },
  // Islands & Indian Ocean
  { lat: -18.6, lon: 45.1, name: "Madagascar East Coast" },
  { lat: -18.9, lon: 47.5, name: "Antananarivo Basin" },
  { lat: -11.7, lon: 43.3, name: "Comoros" },
  { lat: -20.0, lon: 57.5, name: "Mauritius" },
  { lat: 11.5, lon: 43.1, name: "Djibouti" },
];

// Batch fetch helper
async function fetchBatch<T>(items: T[], fn: (item: T) => Promise<void>, concurrency = 5): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const neonUrl = Deno.env.get("NEON_DATABASE_URL");
  if (!neonUrl) {
    return new Response(
      JSON.stringify({ error: "missing NEON_DATABASE_URL", hazards_found: 0 }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sql = neon(neonUrl);
    const now = new Date();
    const runId = `gpm_${now.toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;

    // ── Stale alert cleanup (runs BEFORE skip check) ──
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = 'gpm_imerg' AND is_active = true
        AND data_source_run_id IS NOT NULL AND data_source_run_id != ${runId};
    `;
    await sql`
      UPDATE hazard_alerts SET is_active = false, updated_at = NOW()
      WHERE source = 'gpm_imerg' AND is_active = true
        AND last_seen_at < NOW() - INTERVAL '72 hours';
    `;

    // Check if recently ingested
    const existing = await sql`
      SELECT COUNT(*)::int AS count FROM hazard_alerts
      WHERE source = 'gpm_imerg' AND data_source_run_id = ${runId};
    `;
    if (existing[0]?.count > 0) {
      return new Response(
        JSON.stringify({ status: "completed_cleanup", reason: "run already ingested, stale alerts cleaned", run_id: runId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runArtifact = {
      source: "nasa_gpm_imerg",
      run_id: runId,
      product: "near_real_time",
      resolution: "0.1deg_30min",
      monitoring_points: MONITORING_POINTS.length,
      thresholds: THRESHOLDS,
      ingested_at: now.toISOString(),
    };

    const allHazards: any[] = [];
    // Collect raw precipitation data for map overlay
    const precipGrid: { lat: number; lon: number; name: string; accum24h: number; accum72h: number; hourlyData: number[] }[] = [];

    await fetchBatch(MONITORING_POINTS, async (pt) => {
      try {
        const pastDays = 3;
        const url = `https://api.open-meteo.com/v1/forecast?` +
          `latitude=${pt.lat}&longitude=${pt.lon}&` +
          `hourly=precipitation&` +
          `past_days=${pastDays}&forecast_days=1&timezone=UTC`;

        const resp = await fetch(url);
        if (!resp.ok) {
          await resp.text();
          return;
        }

        const data = await resp.json();
        const hourly = data?.hourly;
        if (!hourly?.time || !hourly?.precipitation) return;

        const precipValues: number[] = hourly.precipitation.map((v: number | null) => v ?? 0);
        const totalHours = precipValues.length;

        const last24h = precipValues.slice(Math.max(0, totalHours - 24));
        const accum24h = last24h.reduce((s: number, v: number) => s + v, 0);

        const last72h = precipValues.slice(Math.max(0, totalHours - 72));
        const accum72h = last72h.reduce((s: number, v: number) => s + v, 0);

        // Store for overlay data
        precipGrid.push({
          lat: pt.lat, lon: pt.lon, name: pt.name,
          accum24h: Math.round(accum24h * 10) / 10,
          accum72h: Math.round(accum72h * 10) / 10,
          hourlyData: last24h,
        });

        const pointArtifact = {
          location: pt.name,
          lat: pt.lat,
          lon: pt.lon,
          accum_24h_mm: Math.round(accum24h * 10) / 10,
          accum_72h_mm: Math.round(accum72h * 10) / 10,
          hourly_samples: totalHours,
          variable: "precipitation",
        };

        // 24h threshold check
        if (accum24h >= THRESHOLDS.rain_24h_extreme) {
          allHazards.push({
            external_id: `${runId}_24h_${pt.lat}_${pt.lon}`,
            source: "gpm_imerg", type: "flood", severity: "extreme",
            title: `Extreme rainfall ${accum24h.toFixed(0)} mm/24h — ${pt.name}`,
            description: `GPM IMERG: ${accum24h.toFixed(0)} mm accumulated over 24h at ${pt.name}. Flood risk critical.`,
            lat: pt.lat, lng: pt.lon, intensity: accum24h,
            data_source_run_id: runId, forecast_hour: null,
            source_artifact: { ...pointArtifact, threshold_type: "24h", threshold_value: THRESHOLDS.rain_24h_extreme },
          });
        } else if (accum24h >= THRESHOLDS.rain_24h_high) {
          allHazards.push({
            external_id: `${runId}_24h_${pt.lat}_${pt.lon}`,
            source: "gpm_imerg", type: "flood", severity: "high",
            title: `Heavy rainfall ${accum24h.toFixed(0)} mm/24h — ${pt.name}`,
            description: `GPM IMERG: ${accum24h.toFixed(0)} mm accumulated over 24h at ${pt.name}. Elevated flood risk.`,
            lat: pt.lat, lng: pt.lon, intensity: accum24h,
            data_source_run_id: runId, forecast_hour: null,
            source_artifact: { ...pointArtifact, threshold_type: "24h", threshold_value: THRESHOLDS.rain_24h_high },
          });
        }

        // 72h threshold check
        if (accum72h >= THRESHOLDS.rain_72h_extreme) {
          allHazards.push({
            external_id: `${runId}_72h_${pt.lat}_${pt.lon}`,
            source: "gpm_imerg", type: "flood", severity: "extreme",
            title: `Sustained extreme rainfall ${accum72h.toFixed(0)} mm/72h — ${pt.name}`,
            description: `GPM IMERG: ${accum72h.toFixed(0)} mm accumulated over 72h at ${pt.name}. Severe flood risk.`,
            lat: pt.lat, lng: pt.lon, intensity: accum72h,
            data_source_run_id: runId, forecast_hour: null,
            source_artifact: { ...pointArtifact, threshold_type: "72h", threshold_value: THRESHOLDS.rain_72h_extreme },
          });
        } else if (accum72h >= THRESHOLDS.rain_72h_high) {
          allHazards.push({
            external_id: `${runId}_72h_${pt.lat}_${pt.lon}`,
            source: "gpm_imerg", type: "flood", severity: "high",
            title: `Sustained heavy rainfall ${accum72h.toFixed(0)} mm/72h — ${pt.name}`,
            description: `GPM IMERG: ${accum72h.toFixed(0)} mm accumulated over 72h at ${pt.name}. Elevated flood risk.`,
            lat: pt.lat, lng: pt.lon, intensity: accum72h,
            data_source_run_id: runId, forecast_hour: null,
            source_artifact: { ...pointArtifact, threshold_type: "72h", threshold_value: THRESHOLDS.rain_72h_high },
          });
        }
      } catch (ptErr) {
        console.log(`GPM error for ${pt.name}:`, ptErr);
      }
    }, 5);

    // Write hazard alerts to Neon
    let upserted = 0;
    for (const h of allHazards) {
      await sql`
        INSERT INTO hazard_alerts (external_id, source, type, severity, title, description, lat, lng, event_at, intensity, metadata, is_active, data_source_run_id, forecast_hour, source_artifact)
        VALUES (${h.external_id}, ${h.source}, ${h.type}, ${h.severity}, ${h.title}, ${h.description}, ${h.lat}, ${h.lng}, NOW(), ${h.intensity}, ${JSON.stringify(h.source_artifact)}::jsonb, TRUE, ${h.data_source_run_id}, ${h.forecast_hour}, ${JSON.stringify({ ...runArtifact, point_artifact: h.source_artifact })}::jsonb)
        ON CONFLICT (source, external_id) DO UPDATE SET
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          intensity = EXCLUDED.intensity,
          metadata = EXCLUDED.metadata,
          source_artifact = EXCLUDED.source_artifact,
          is_active = TRUE,
          last_seen_at = NOW(),
          updated_at = NOW();
      `;
      upserted++;
    }

    // (Stale cleanup already done at top of function)

    return new Response(
      JSON.stringify({
        status: "completed",
        source: "gpm_imerg_via_open_meteo",
        run_id: runId,
        points_scanned: MONITORING_POINTS.length,
        hazards_detected: allHazards.length,
        hazards_upserted: upserted,
        precip_grid_points: precipGrid.length,
        precip_grid: precipGrid,
        thresholds: THRESHOLDS,
        run_artifact: runArtifact,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e), hazards_found: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
