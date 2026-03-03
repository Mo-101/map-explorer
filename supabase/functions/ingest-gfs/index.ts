import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "npm:@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Externalized, versionable, auditable thresholds ──
const THRESHOLDS = {
  wind_high: 20,       // m/s
  wind_extreme: 30,    // m/s
  mslp_high: 990,      // hPa
  mslp_extreme: 970,   // hPa
  rain_high_6h: 50,    // mm
  rain_extreme_6h: 100, // mm
};

const MSLP_FLOOR = 870; // hPa — absolute minimum; anything below is rejected
const TEMPORAL_PERSISTENCE = 3; // consecutive forecast hours required before alerting
const STALE_HOURS = 72; // deactivate alerts older than this

// Africa bounding box
const AFRICA_BBOX = { lat_min: -35, lat_max: 40, lon_min: -25, lon_max: 55 };

// ── Barometric correction: station pressure → sea-level pressure ──
function stationToMSLP(stationHpa: number, elevationM: number, tempC = 15): number {
  if (elevationM <= 0) return stationHpa;
  return stationHpa * Math.pow(
    1 + 0.0065 * elevationM / (tempC + 0.0065 * elevationM + 273.15),
    5.257
  );
}

function getLatestGFSRun(): { date: string; hour: string; runId: string } {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const runHours = [0, 6, 12, 18];
  const availableHour = utcHour - 5;
  let selectedRun = runHours[0];
  for (const rh of runHours) {
    if (rh <= availableHour) selectedRun = rh;
  }

  const d = new Date(now);
  if (availableHour < 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    selectedRun = 18;
  }

  const date = d.toISOString().slice(0, 10).replace(/-/g, "");
  const hour = String(selectedRun).padStart(2, "0");
  return { date, hour, runId: `gfs_${date}_${hour}z` };
}

interface GFSGridPoint {
  lat: number;
  lon: number;
  wind_u10?: number;
  wind_v10?: number;
  wind_speed?: number;
  mslp?: number;
  precip_6h?: number;
}

interface RawDetection {
  external_id: string;
  source: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  intensity: number;
  data_source_run_id: string;
  forecast_hour: number;
  source_artifact: Record<string, any>;
  location_key: string; // for clustering
}

function detectHazards(points: GFSGridPoint[], runId: string, forecastHour: number, locationName = ""): RawDetection[] {
  const hazards: RawDetection[] = [];
  const suffix = locationName ? ` — ${locationName}` : "";

  for (const pt of points) {
    const locKey = `${pt.lat}_${pt.lon}`;

    // Wind hazard
    if (pt.wind_speed !== undefined) {
      if (pt.wind_speed >= THRESHOLDS.wind_extreme) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_wind_${locKey}`,
          source: "gfs", type: "cyclone", severity: "extreme",
          title: `Extreme wind ${pt.wind_speed.toFixed(1)} m/s${suffix}`,
          description: `GFS forecast: extreme wind speed of ${pt.wind_speed.toFixed(1)} m/s at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: pt.wind_speed,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "wind_10m", value_ms: pt.wind_speed, threshold: THRESHOLDS.wind_extreme },
          location_key: locKey,
        });
      } else if (pt.wind_speed >= THRESHOLDS.wind_high) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_wind_${locKey}`,
          source: "gfs", type: "storm", severity: "high",
          title: `High wind ${pt.wind_speed.toFixed(1)} m/s${suffix}`,
          description: `GFS forecast: high wind speed of ${pt.wind_speed.toFixed(1)} m/s at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: pt.wind_speed,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "wind_10m", value_ms: pt.wind_speed, threshold: THRESHOLDS.wind_high },
          location_key: locKey,
        });
      }
    }

    // MSLP hazard
    if (pt.mslp !== undefined) {
      if (pt.mslp <= THRESHOLDS.mslp_extreme) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_mslp_${locKey}`,
          source: "gfs", type: "cyclone", severity: "extreme",
          title: `Deep low pressure ${pt.mslp.toFixed(0)} hPa${suffix}`,
          description: `GFS forecast: extremely low MSLP of ${pt.mslp.toFixed(0)} hPa at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: 1013 - pt.mslp,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "mslp", value_hpa: pt.mslp, threshold: THRESHOLDS.mslp_extreme },
          location_key: locKey,
        });
      } else if (pt.mslp <= THRESHOLDS.mslp_high) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_mslp_${locKey}`,
          source: "gfs", type: "storm", severity: "high",
          title: `Low pressure ${pt.mslp.toFixed(0)} hPa${suffix}`,
          description: `GFS forecast: low MSLP of ${pt.mslp.toFixed(0)} hPa at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: 1013 - pt.mslp,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "mslp", value_hpa: pt.mslp, threshold: THRESHOLDS.mslp_high },
          location_key: locKey,
        });
      }
    }

    // Precipitation hazard
    if (pt.precip_6h !== undefined) {
      if (pt.precip_6h >= THRESHOLDS.rain_extreme_6h) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_rain_${locKey}`,
          source: "gfs", type: "flood", severity: "extreme",
          title: `Extreme rainfall ${pt.precip_6h.toFixed(0)} mm/6h${suffix}`,
          description: `GFS forecast: extreme precipitation of ${pt.precip_6h.toFixed(0)} mm in 6h at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: pt.precip_6h,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "precip_6h", value_mm: pt.precip_6h, threshold: THRESHOLDS.rain_extreme_6h },
          location_key: locKey,
        });
      } else if (pt.precip_6h >= THRESHOLDS.rain_high_6h) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_rain_${locKey}`,
          source: "gfs", type: "flood", severity: "high",
          title: `Heavy rainfall ${pt.precip_6h.toFixed(0)} mm/6h${suffix}`,
          description: `GFS forecast: heavy precipitation of ${pt.precip_6h.toFixed(0)} mm in 6h at f+${forecastHour}h`,
          lat: pt.lat, lng: pt.lon, intensity: pt.precip_6h,
          data_source_run_id: runId, forecast_hour: forecastHour,
          source_artifact: { variable: "precip_6h", value_mm: pt.precip_6h, threshold: THRESHOLDS.rain_high_6h },
          location_key: locKey,
        });
      }
    }
  }

  return hazards;
}

// ── Temporal persistence filter ──
// Groups detections by (location, hazard_variable) and only keeps clusters
// where the condition persists for TEMPORAL_PERSISTENCE+ consecutive hours.
// Emits a single representative alert per cluster (peak intensity).
function applyTemporalFilter(allDetections: RawDetection[]): RawDetection[] {
  // Group by location + variable type
  const groups = new Map<string, RawDetection[]>();
  for (const d of allDetections) {
    const variable = d.source_artifact?.variable || "unknown";
    const key = `${d.location_key}_${variable}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  const result: RawDetection[] = [];

  for (const [, detections] of groups) {
    // Sort by forecast hour
    detections.sort((a, b) => a.forecast_hour - b.forecast_hour);

    // Find consecutive runs
    let runStart = 0;
    for (let i = 1; i <= detections.length; i++) {
      const gap = i < detections.length
        ? detections[i].forecast_hour - detections[i - 1].forecast_hour
        : Infinity;

      // If gap > 1 hour, end current run
      if (gap > 1) {
        const runLength = i - runStart;
        if (runLength >= TEMPORAL_PERSISTENCE) {
          // Pick peak intensity detection from this run
          const run = detections.slice(runStart, i);
          const peak = run.reduce((best, d) => d.intensity > best.intensity ? d : best, run[0]);

          // Create a consolidated alert
          const fhMin = run[0].forecast_hour;
          const fhMax = run[run.length - 1].forecast_hour;
          result.push({
            ...peak,
            external_id: peak.external_id.replace(/_f\d+_/, `_f${fhMin}-${fhMax}_`),
            description: `${peak.description} (persists f+${fhMin}h to f+${fhMax}h, ${runLength} hours)`,
            source_artifact: {
              ...peak.source_artifact,
              persistence_hours: runLength,
              forecast_range: [fhMin, fhMax],
            },
          });
        }
        runStart = i;
      }
    }
  }

  return result;
}

// ── Expanded sample points: 35 strategic locations across Africa ──
const SAMPLE_POINTS = [
  // East Africa
  { lat: -1.3, lon: 36.8, name: "Nairobi", elevation: 1661 },
  { lat: 9.0, lon: 38.7, name: "Addis Ababa", elevation: 2355 },
  { lat: 0.3, lon: 32.6, name: "Kampala", elevation: 1190 },
  { lat: -6.8, lon: 39.3, name: "Dar es Salaam", elevation: 15 },
  { lat: 2.0, lon: 45.3, name: "Mogadishu", elevation: 10 },
  { lat: -1.9, lon: 29.9, name: "Kigali", elevation: 1567 },
  { lat: -3.4, lon: 29.4, name: "Bujumbura", elevation: 774 },
  // Southern Africa
  { lat: -26.2, lon: 28.0, name: "Johannesburg", elevation: 1753 },
  { lat: -15.4, lon: 35.0, name: "Lilongwe", elevation: 1050 },
  { lat: -15.4, lon: 28.3, name: "Lusaka", elevation: 1280 },
  { lat: -17.8, lon: 31.0, name: "Harare", elevation: 1490 },
  { lat: -25.9, lon: 32.6, name: "Maputo", elevation: 47 },
  { lat: -8.8, lon: 13.2, name: "Luanda", elevation: 73 },
  // West Africa
  { lat: 6.5, lon: 3.4, name: "Lagos", elevation: 10 },
  { lat: 9.1, lon: 7.5, name: "Abuja", elevation: 476 },
  { lat: 14.7, lon: -17.5, name: "Dakar", elevation: 10 },
  { lat: 5.6, lon: -0.2, name: "Accra", elevation: 61 },
  { lat: 12.4, lon: -1.5, name: "Ouagadougou", elevation: 305 },
  { lat: 12.6, lon: -8.0, name: "Bamako", elevation: 350 },
  { lat: 9.5, lon: -13.7, name: "Conakry", elevation: 13 },
  { lat: 6.3, lon: -10.8, name: "Monrovia", elevation: 8 },
  // North Africa
  { lat: 30.0, lon: 31.2, name: "Cairo", elevation: 75 },
  { lat: 36.8, lon: 3.1, name: "Algiers", elevation: 25 },
  { lat: 36.8, lon: 10.2, name: "Tunis", elevation: 10 },
  { lat: 32.9, lon: 13.2, name: "Tripoli", elevation: 21 },
  { lat: 15.6, lon: 32.5, name: "Khartoum", elevation: 382 },
  // Central Africa
  { lat: -4.3, lon: 15.3, name: "Kinshasa", elevation: 310 },
  { lat: 3.9, lon: 11.5, name: "Yaoundé", elevation: 726 },
  { lat: 4.4, lon: 18.6, name: "Bangui", elevation: 369 },
  // Sahel
  { lat: 13.5, lon: 2.1, name: "Niamey", elevation: 220 },
  { lat: 12.1, lon: 15.0, name: "N'Djamena", elevation: 298 },
  // Islands & Indian Ocean
  { lat: -18.6, lon: 45.1, name: "Madagascar West", elevation: 10 },
  { lat: -18.9, lon: 47.5, name: "Antananarivo", elevation: 1276 },
  { lat: -11.7, lon: 43.3, name: "Moroni", elevation: 29 },
  { lat: -20.2, lon: 57.5, name: "Port Louis", elevation: 55 },
];

// Batch fetch helper with concurrency limit
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
    const { date, hour, runId } = getLatestGFSRun();

    // Check if this run was already ingested
    // ── Stale alert cleanup: deactivate GFS alerts from previous runs ──
    // Run this BEFORE the skip check so old data is always cleaned up
    await sql`
      UPDATE hazard_alerts
      SET is_active = false, updated_at = NOW()
      WHERE source = 'gfs'
        AND is_active = true
        AND data_source_run_id IS NOT NULL
        AND data_source_run_id != ${runId};
    `;
    // Also deactivate anything older than 72h regardless of run
    await sql`
      UPDATE hazard_alerts
      SET is_active = false, updated_at = NOW()
      WHERE source = 'gfs'
        AND is_active = true
        AND updated_at < NOW() - INTERVAL '72 hours';
    `;
    console.log(`[ingest-gfs] Stale cleanup: deactivated alerts from previous runs (keeping ${runId})`);

    const existing = await sql`
      SELECT COUNT(*)::int AS count FROM hazard_alerts
      WHERE source = 'gfs' AND data_source_run_id = ${runId};
    `;
    if (existing[0]?.count > 0) {
      return new Response(
        JSON.stringify({ status: "completed_cleanup", reason: "run already ingested, stale alerts cleaned", run_id: runId, existing_count: existing[0].count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runArtifact = {
      source: "noaa_gfs",
      run_id: runId,
      init_date: date,
      init_hour: hour,
      resolution: "0.25deg",
      bbox: AFRICA_BBOX,
      thresholds: THRESHOLDS,
      temporal_persistence: TEMPORAL_PERSISTENCE,
      sample_points: SAMPLE_POINTS.length,
      ingested_at: new Date().toISOString(),
    };

    // Collect all raw detections across all points
    const allDetections: RawDetection[] = [];

    await fetchBatch(SAMPLE_POINTS, async (pt) => {
      try {
        const omUrl = `https://api.open-meteo.com/v1/gfs?` +
          `latitude=${pt.lat}&longitude=${pt.lon}&` +
          `hourly=wind_speed_10m,wind_gusts_10m,surface_pressure,precipitation&` +
          `forecast_hours=72&wind_speed_unit=ms&timezone=UTC`;

        const omResp = await fetch(omUrl);
        if (!omResp.ok) {
          await omResp.text();
          return;
        }

        const omData = await omResp.json();
        const hourly = omData?.hourly;
        if (!hourly?.time) return;

        for (let i = 0; i < hourly.time.length; i++) {
          const windSpeed = hourly.wind_speed_10m?.[i];
          const pressure = hourly.surface_pressure?.[i];
          const precip = hourly.precipitation?.[i];

          // Apply barometric correction for elevation
          let correctedMslp: number | undefined;
          if (pressure != null) {
            correctedMslp = stationToMSLP(pressure, pt.elevation);
            if (correctedMslp < MSLP_FLOOR) {
              correctedMslp = undefined;
            }
          }

          const gridPt: GFSGridPoint = {
            lat: pt.lat,
            lon: pt.lon,
            wind_speed: windSpeed ?? undefined,
            mslp: correctedMslp,
            precip_6h: (i % 6 === 5 && precip !== null) ? precip * 6 : undefined,
          };

          const detected = detectHazards([gridPt], runId, i, pt.name);
          allDetections.push(...detected);
        }
      } catch (ptErr) {
        console.log(`Open-Meteo error for ${pt.name}:`, ptErr);
      }
    }, 5);

    // ── Apply temporal persistence filter ──
    const filtered = applyTemporalFilter(allDetections);
    console.log(`[ingest-gfs] Raw detections: ${allDetections.length}, after temporal filter: ${filtered.length}`);

    // Deduplicate by external_id (keep highest severity)
    const deduped = new Map<string, RawDetection>();
    for (const h of filtered) {
      const existing = deduped.get(h.external_id);
      if (!existing || h.severity === "extreme") {
        deduped.set(h.external_id, h);
      }
    }
    const finalHazards = Array.from(deduped.values());

    // Write to Neon
    let upserted = 0;
    for (const h of finalHazards) {
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
          updated_at = NOW();
      `;
      upserted++;
    }

    // (Stale cleanup already done at top of function)

    return new Response(
      JSON.stringify({
        status: "completed",
        source: "gfs_via_open_meteo",
        run_id: runId,
        points_scanned: SAMPLE_POINTS.length,
        raw_detections: allDetections.length,
        after_temporal_filter: filtered.length,
        hazards_upserted: upserted,
        stale_deactivated: staleCount,
        thresholds: THRESHOLDS,
        temporal_persistence: TEMPORAL_PERSISTENCE,
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
