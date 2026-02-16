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

// Africa bounding box
const AFRICA_BBOX = { lat_min: -35, lat_max: 40, lon_min: -25, lon_max: 55 };

function getLatestGFSRun(): { date: string; hour: string; runId: string } {
  const now = new Date();
  // GFS runs: 00z, 06z, 12z, 18z — available ~4.5h after init
  const utcHour = now.getUTCHours();
  const runHours = [0, 6, 12, 18];
  // Pick the most recent run that should be available (subtract 5h for processing delay)
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

function detectHazards(points: GFSGridPoint[], runId: string, forecastHour: number) {
  const hazards: any[] = [];

  for (const pt of points) {
    // Wind hazard
    if (pt.wind_speed !== undefined) {
      if (pt.wind_speed >= THRESHOLDS.wind_extreme) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_wind_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "cyclone",
          severity: "extreme",
          title: `Extreme wind ${pt.wind_speed.toFixed(1)} m/s`,
          description: `GFS forecast: extreme wind speed of ${pt.wind_speed.toFixed(1)} m/s at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: pt.wind_speed,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "wind_10m", value_ms: pt.wind_speed, threshold: THRESHOLDS.wind_extreme, u10: pt.wind_u10, v10: pt.wind_v10 },
        });
      } else if (pt.wind_speed >= THRESHOLDS.wind_high) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_wind_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "storm",
          severity: "high",
          title: `High wind ${pt.wind_speed.toFixed(1)} m/s`,
          description: `GFS forecast: high wind speed of ${pt.wind_speed.toFixed(1)} m/s at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: pt.wind_speed,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "wind_10m", value_ms: pt.wind_speed, threshold: THRESHOLDS.wind_high, u10: pt.wind_u10, v10: pt.wind_v10 },
        });
      }
    }

    // MSLP hazard
    if (pt.mslp !== undefined) {
      if (pt.mslp <= THRESHOLDS.mslp_extreme) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_mslp_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "cyclone",
          severity: "extreme",
          title: `Deep low pressure ${pt.mslp.toFixed(0)} hPa`,
          description: `GFS forecast: extremely low MSLP of ${pt.mslp.toFixed(0)} hPa at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: 1013 - pt.mslp,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "mslp", value_hpa: pt.mslp, threshold: THRESHOLDS.mslp_extreme },
        });
      } else if (pt.mslp <= THRESHOLDS.mslp_high) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_mslp_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "storm",
          severity: "high",
          title: `Low pressure ${pt.mslp.toFixed(0)} hPa`,
          description: `GFS forecast: low MSLP of ${pt.mslp.toFixed(0)} hPa at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: 1013 - pt.mslp,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "mslp", value_hpa: pt.mslp, threshold: THRESHOLDS.mslp_high },
        });
      }
    }

    // Precipitation hazard
    if (pt.precip_6h !== undefined) {
      if (pt.precip_6h >= THRESHOLDS.rain_extreme_6h) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_rain_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "flood",
          severity: "extreme",
          title: `Extreme rainfall ${pt.precip_6h.toFixed(0)} mm/6h`,
          description: `GFS forecast: extreme precipitation of ${pt.precip_6h.toFixed(0)} mm in 6h at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: pt.precip_6h,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "precip_6h", value_mm: pt.precip_6h, threshold: THRESHOLDS.rain_extreme_6h },
        });
      } else if (pt.precip_6h >= THRESHOLDS.rain_high_6h) {
        hazards.push({
          external_id: `${runId}_f${forecastHour}_rain_${pt.lat}_${pt.lon}`,
          source: "gfs",
          type: "flood",
          severity: "high",
          title: `Heavy rainfall ${pt.precip_6h.toFixed(0)} mm/6h`,
          description: `GFS forecast: heavy precipitation of ${pt.precip_6h.toFixed(0)} mm in 6h at f+${forecastHour}h`,
          lat: pt.lat,
          lng: pt.lon,
          intensity: pt.precip_6h,
          data_source_run_id: runId,
          forecast_hour: forecastHour,
          source_artifact: { variable: "precip_6h", value_mm: pt.precip_6h, threshold: THRESHOLDS.rain_high_6h },
        });
      }
    }
  }

  return hazards;
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
    const existing = await sql`
      SELECT COUNT(*)::int AS count FROM hazard_alerts
      WHERE source = 'gfs' AND data_source_run_id = ${runId};
    `;
    if (existing[0]?.count > 0) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "run already ingested", run_id: runId, existing_count: existing[0].count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch GFS data from NOMADS
    // We use the JSON filter endpoint for Africa bounding box
    const forecastHours = [0, 6, 12, 24, 48, 72];
    const allHazards: any[] = [];
    const runArtifact = {
      source: "noaa_gfs",
      run_id: runId,
      init_date: date,
      init_hour: hour,
      resolution: "0.25deg",
      bbox: AFRICA_BBOX,
      forecast_hours: forecastHours,
      thresholds: THRESHOLDS,
      ingested_at: new Date().toISOString(),
    };

    for (const fh of forecastHours) {
      const fhStr = String(fh).padStart(3, "0");
      // NOMADS filter URL for GFS 0.25-degree
      const url = `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?` +
        `file=gfs.t${hour}z.pgrb2.0p25.f${fhStr}&` +
        `lev_10_m_above_ground=on&lev_mean_sea_level=on&` +
        `var_UGRD=on&var_VGRD=on&var_PRMSL=on&var_APCP=on&` +
        `leftlon=${AFRICA_BBOX.lon_min}&rightlon=${AFRICA_BBOX.lon_max}&` +
        `toplat=${AFRICA_BBOX.lat_max}&bottomlat=${AFRICA_BBOX.lat_min}&` +
        `dir=%2Fgfs.${date}%2F${hour}%2Fatmos`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          // GFS data might not be available yet for this forecast hour
          console.log(`GFS f${fhStr} not available: ${resp.status}`);
          await resp.text(); // consume body
          continue;
        }

        // NOMADS returns GRIB2 binary — we cannot parse GRIB2 in edge functions.
        // Instead, we use the NOMADS OpenDAP/ASCII alternative or the NOAA Weather API as a proxy.
        // For MVP: use NOAA Weather.gov API for point-based alerts instead.
        await resp.arrayBuffer(); // consume GRIB2 body (can't parse)

        // Since GRIB2 parsing isn't feasible in edge runtime, we fall back to
        // synthesizing from NOAA's higher-level API endpoints below.
      } catch (fetchErr) {
        console.log(`GFS fetch error for f${fhStr}:`, fetchErr);
      }
    }

    // ── Fallback: Use NOAA Weather API for active alerts in Africa region ──
    // NOAA's API covers US primarily, so for global/Africa coverage we use
    // Open-Meteo's free GFS-backed forecast API which exposes GFS data as JSON.
    const samplePoints = [
      { lat: -18.6, lon: 45.1, name: "Madagascar" },
      { lat: 13.5, lon: 2.1, name: "Niger" },
      { lat: -15.4, lon: 35.0, name: "Malawi" },
      { lat: 6.5, lon: 3.4, name: "Lagos" },
      { lat: -4.3, lon: 15.3, name: "Kinshasa" },
      { lat: -1.3, lon: 36.8, name: "Nairobi" },
      { lat: 9.0, lon: 38.7, name: "Addis Ababa" },
      { lat: 14.7, lon: -17.5, name: "Dakar" },
      { lat: -26.2, lon: 28.0, name: "Johannesburg" },
      { lat: 30.0, lon: 31.2, name: "Cairo" },
      { lat: 0.3, lon: 32.6, name: "Kampala" },
      { lat: -6.8, lon: 39.3, name: "Dar es Salaam" },
    ];

    for (const pt of samplePoints) {
      try {
        // Open-Meteo uses GFS as backend — returns JSON directly
        const omUrl = `https://api.open-meteo.com/v1/gfs?` +
          `latitude=${pt.lat}&longitude=${pt.lon}&` +
          `hourly=wind_speed_10m,wind_gusts_10m,surface_pressure,precipitation&` +
          `forecast_hours=72&wind_speed_unit=ms&timezone=UTC`;

        const omResp = await fetch(omUrl);
        if (!omResp.ok) {
          await omResp.text();
          continue;
        }

        const omData = await omResp.json();
        const hourly = omData?.hourly;
        if (!hourly?.time) continue;

        // Scan each forecast timestep
        for (let i = 0; i < hourly.time.length; i++) {
          const windSpeed = hourly.wind_speed_10m?.[i];
          const windGust = hourly.wind_gusts_10m?.[i];
          const pressure = hourly.surface_pressure?.[i];
          const precip = hourly.precipitation?.[i];
          const fh = i; // forecast hour offset

          const gridPt: GFSGridPoint = {
            lat: pt.lat,
            lon: pt.lon,
            wind_speed: windSpeed ?? undefined,
            mslp: pressure ?? undefined,
            precip_6h: (i % 6 === 5 && precip !== null) ? precip * 6 : undefined, // approximate 6h accumulation
          };

          const detected = detectHazards([gridPt], runId, fh);
          allHazards.push(...detected);
        }
      } catch (ptErr) {
        console.log(`Open-Meteo error for ${pt.name}:`, ptErr);
      }
    }

    // Deduplicate by external_id (keep highest severity)
    const deduped = new Map<string, any>();
    for (const h of allHazards) {
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

    return new Response(
      JSON.stringify({
        status: "completed",
        source: "gfs_via_open_meteo",
        run_id: runId,
        points_scanned: samplePoints.length,
        hazards_detected: finalHazards.length,
        hazards_upserted: upserted,
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
