import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AFRICA_BBOX = {
  leftlon: -25,
  rightlon: 55,
  toplat: 40,
  bottomlat: -35,
} as const;

const THRESHOLDS = {
  wind_high: 20, // m/s
  wind_extreme: 30, // m/s
  mslp_high: 990, // hPa
  mslp_extreme: 970, // hPa
  rain_high_6h: 50, // mm
  rain_extreme_6h: 100, // mm
} as const;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HAZARDS_PER_RUN = 5_000;
const UPSERT_BATCH_SIZE = 250;

const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  extreme: 4,
};

type HazardRow = {
  external_id: string;
  source: string;
  type: string;
  severity: "high" | "extreme";
  title: string;
  description: string;
  lat: number;
  lng: number;
  intensity: number;
  data_source_run_id: string;
  forecast_hour: number;
  metadata: Record<string, unknown>;
  source_artifact: Record<string, unknown>;
};

type MonitoringPoint = {
  lat: number;
  lon: number;
  name: string;
};

const monitoringPoints: MonitoringPoint[] = [
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

function getLatestGfsRun(now = new Date()): { date: string; hour: string; runId: string } {
  const runHours = [0, 6, 12, 18];
  const availableHour = now.getUTCHours() - 5;

  let selectedRun = 0;
  for (const rh of runHours) {
    if (rh <= availableHour) selectedRun = rh;
  }

  const runDate = new Date(now);
  if (availableHour < 0) {
    runDate.setUTCDate(runDate.getUTCDate() - 1);
    selectedRun = 18;
  }

  const date = runDate.toISOString().slice(0, 10).replace(/-/g, "");
  const hour = String(selectedRun).padStart(2, "0");
  return { date, hour, runId: `gfs_${date}_${hour}z` };
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function makeExternalId(
  runId: string,
  forecastHour: number,
  variable: "wind_10m" | "mslp" | "precip_6h",
  lat: number,
  lon: number,
): string {
  const fh = String(forecastHour).padStart(3, "0");
  return `${runId}_f${fh}_${variable}_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function buildHazard(params: {
  runId: string;
  forecastHour: number;
  variable: "wind_10m" | "mslp" | "precip_6h";
  type: "storm" | "cyclone" | "flood";
  severity: "high" | "extreme";
  lat: number;
  lon: number;
  intensity: number;
  measuredValue: number;
  thresholdValue: number;
  unit: string;
  extras?: Record<string, unknown>;
}): HazardRow {
  const {
    runId,
    forecastHour,
    variable,
    type,
    severity,
    lat,
    lon,
    intensity,
    measuredValue,
    thresholdValue,
    unit,
    extras,
  } = params;

  return {
    external_id: makeExternalId(runId, forecastHour, variable, lat, lon),
    source: "gfs",
    type,
    severity,
    title: `${severity === "extreme" ? "Extreme" : "High"} ${type} signal`,
    description: `GFS ${variable} threshold exceeded at f+${forecastHour}h`,
    lat,
    lng: lon,
    intensity,
    data_source_run_id: runId,
    forecast_hour: forecastHour,
    metadata: {
      variable,
      measured_value: measuredValue,
      threshold: thresholdValue,
      unit,
      data_source_run_id: runId,
      forecast_hour: forecastHour,
      source_system: "neon_ingest_gfs_edge_function",
      detection_source: "noaa_gfs_via_open_meteo",
      model: "GFS 0.25",
      detection_method: "threshold_exceedance",
      bbox: AFRICA_BBOX,
      ...(extras || {}),
    },
    source_artifact: {
      source: "open-meteo-gfs-proxy",
      variable,
      measured_value: measuredValue,
      threshold: thresholdValue,
      unit,
      run_id: runId,
      forecast_hour: forecastHour,
      ...(extras || {}),
    },
  };
}

function toNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function detectPointHazards(
  point: MonitoringPoint,
  runId: string,
  hourly: Record<string, unknown>,
): HazardRow[] {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const wind = Array.isArray(hourly?.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const gust = Array.isArray(hourly?.wind_gusts_10m) ? hourly.wind_gusts_10m : [];
  // Must be mean-sea-level pressure, not surface pressure: the mslp_* thresholds
  // are cyclone-intensity values reduced to sea level. Surface pressure falls with
  // terrain height, so comparing it against 970/990 hPa flags the East African
  // highlands as "extreme cyclones" purely because they sit ~1.5-3km up.
  const mslp = Array.isArray(hourly?.pressure_msl) ? hourly.pressure_msl : [];
  const precip = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];

  const hazards: HazardRow[] = [];

  for (let i = 0; i < times.length; i++) {
    const forecastHour = i;
    const windMs = toNumber(wind[i]);
    const gustMs = toNumber(gust[i]);
    const pressureHpa = toNumber(mslp[i]);

    if (windMs !== null) {
      if (windMs > THRESHOLDS.wind_extreme) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "wind_10m",
            type: "cyclone",
            severity: "extreme",
            lat: point.lat,
            lon: point.lon,
            intensity: windMs,
            measuredValue: windMs,
            thresholdValue: THRESHOLDS.wind_extreme,
            unit: "m/s",
            extras: { point_name: point.name, gust_ms: gustMs },
          }),
        );
      } else if (windMs > THRESHOLDS.wind_high) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "wind_10m",
            type: "storm",
            severity: "high",
            lat: point.lat,
            lon: point.lon,
            intensity: windMs,
            measuredValue: windMs,
            thresholdValue: THRESHOLDS.wind_high,
            unit: "m/s",
            extras: { point_name: point.name, gust_ms: gustMs },
          }),
        );
      }
    }

    if (pressureHpa !== null) {
      if (pressureHpa < THRESHOLDS.mslp_extreme) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "mslp",
            type: "cyclone",
            severity: "extreme",
            lat: point.lat,
            lon: point.lon,
            intensity: 1013 - pressureHpa,
            measuredValue: pressureHpa,
            thresholdValue: THRESHOLDS.mslp_extreme,
            unit: "hPa",
            extras: { point_name: point.name },
          }),
        );
      } else if (pressureHpa < THRESHOLDS.mslp_high) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "mslp",
            type: "cyclone",
            severity: "high",
            lat: point.lat,
            lon: point.lon,
            intensity: 1013 - pressureHpa,
            measuredValue: pressureHpa,
            thresholdValue: THRESHOLDS.mslp_high,
            unit: "hPa",
            extras: { point_name: point.name },
          }),
        );
      }
    }

    if (i >= 5) {
      let rain6h = 0;
      for (let j = i - 5; j <= i; j++) {
        rain6h += toNumber(precip[j]) ?? 0;
      }

      if (rain6h > THRESHOLDS.rain_extreme_6h) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "precip_6h",
            type: "flood",
            severity: "extreme",
            lat: point.lat,
            lon: point.lon,
            intensity: rain6h,
            measuredValue: rain6h,
            thresholdValue: THRESHOLDS.rain_extreme_6h,
            unit: "mm/6h",
            extras: { point_name: point.name },
          }),
        );
      } else if (rain6h > THRESHOLDS.rain_high_6h) {
        hazards.push(
          buildHazard({
            runId,
            forecastHour,
            variable: "precip_6h",
            type: "flood",
            severity: "high",
            lat: point.lat,
            lon: point.lon,
            intensity: rain6h,
            measuredValue: rain6h,
            thresholdValue: THRESHOLDS.rain_high_6h,
            unit: "mm/6h",
            extras: { point_name: point.name },
          }),
        );
      }
    }
  }

  return hazards;
}

function dedupeHazards(hazards: HazardRow[]): HazardRow[] {
  const byId = new Map<string, HazardRow>();

  for (const h of hazards) {
    const existing = byId.get(h.external_id);
    if (!existing) {
      byId.set(h.external_id, h);
      continue;
    }

    const incomingRank = SEVERITY_RANK[h.severity] ?? 0;
    const existingRank = SEVERITY_RANK[existing.severity] ?? 0;
    if (incomingRank > existingRank || h.intensity > existing.intensity) {
      byId.set(h.external_id, h);
    }
  }

  return Array.from(byId.values());
}

async function ensureRunLogTable(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      hazards_detected INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_created_at ON ingestion_runs (source, created_at DESC);`;
}

async function writeRunLog(
  sql: ReturnType<typeof neon>,
  payload: {
    source: string;
    runId: string;
    status: "success" | "failed" | "skipped";
    hazardsDetected: number;
    durationMs: number;
    error?: string;
  },
) {
  await sql`
    INSERT INTO ingestion_runs (source, run_id, status, hazards_detected, duration_ms, error)
    VALUES (${payload.source}, ${payload.runId}, ${payload.status}, ${payload.hazardsDetected}, ${payload.durationMs}, ${payload.error ?? null});
  `;
}

async function upsertHazards(sql: ReturnType<typeof neon>, hazards: HazardRow[]) {
  for (const batch of chunk(hazards, UPSERT_BATCH_SIZE)) {
    await sql.transaction(
      batch.map((h) =>
        sql`
          INSERT INTO hazard_alerts (
            external_id, source, type, severity, title, description,
            lat, lng, event_at, intensity, metadata, is_active,
            data_source_run_id, forecast_hour, source_artifact
          )
          VALUES (
            ${h.external_id}, ${h.source}, ${h.type}, ${h.severity}, ${h.title}, ${h.description},
            ${h.lat}, ${h.lng}, NOW(), ${h.intensity}, ${JSON.stringify(h.metadata)}::jsonb, TRUE,
            ${h.data_source_run_id}, ${h.forecast_hour}, ${JSON.stringify(h.source_artifact)}::jsonb
          )
          ON CONFLICT (source, external_id)
          DO UPDATE SET
            type = EXCLUDED.type,
            severity = EXCLUDED.severity,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            event_at = EXCLUDED.event_at,
            intensity = EXCLUDED.intensity,
            metadata = EXCLUDED.metadata,
            is_active = EXCLUDED.is_active,
            data_source_run_id = EXCLUDED.data_source_run_id,
            forecast_hour = EXCLUDED.forecast_hour,
            source_artifact = EXCLUDED.source_artifact,
            updated_at = NOW();
        `,
      ),
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  const neonUrl = Deno.env.get("NEON_DATABASE_URL");
  if (!neonUrl) {
    return new Response(
      JSON.stringify({ source: "gfs", status: "failed", error: "missing NEON_DATABASE_URL" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { runId } = getLatestGfsRun();
  const sql = neon(neonUrl);

  try {
    await ensureRunLogTable(sql);

    const existing = await sql`
      SELECT COUNT(*)::int AS count
      FROM hazard_alerts
      WHERE source = 'gfs' AND data_source_run_id = ${runId};
    `;

    if ((existing[0]?.count ?? 0) > 0) {
      const durationMs = Date.now() - start;
      await writeRunLog(sql, {
        source: "gfs",
        runId,
        status: "skipped",
        hazardsDetected: existing[0].count,
        durationMs,
      });

      return new Response(
        JSON.stringify({
          source: "gfs",
          run_id: runId,
          status: "skipped",
          reason: "run already ingested",
          existing_count: existing[0].count,
          duration_ms: durationMs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allHazards: HazardRow[] = [];
    let pointsScanned = 0;
    let upstreamErrors = 0;

    for (const pt of monitoringPoints) {
      try {
        const omUrl = `https://api.open-meteo.com/v1/gfs?` +
          `latitude=${pt.lat}&longitude=${pt.lon}&` +
          `hourly=wind_speed_10m,wind_gusts_10m,pressure_msl,precipitation&` +
          `forecast_hours=72&wind_speed_unit=ms&timezone=UTC`;

        const response = await fetchWithTimeout(omUrl);
        if (!response.ok) {
          upstreamErrors++;
          continue;
        }

        const payload = await response.json();
        const hourly = payload?.hourly;
        if (!hourly || !Array.isArray(hourly.time)) {
          upstreamErrors++;
          continue;
        }

        const pointHazards = detectPointHazards(pt, runId, hourly);
        allHazards.push(...pointHazards);
        pointsScanned++;
      } catch {
        upstreamErrors++;
      }
    }

    const deduped = dedupeHazards(allHazards);
    if (deduped.length > MAX_HAZARDS_PER_RUN) {
      throw new Error("Abnormal hazard spike - aborting");
    }

    if (deduped.length > 0) {
      await upsertHazards(sql, deduped);
    }

    const durationMs = Date.now() - start;
    await writeRunLog(sql, {
      source: "gfs",
      runId,
      status: "success",
      hazardsDetected: deduped.length,
      durationMs,
    });

    return new Response(
      JSON.stringify({
        source: "gfs",
        run_id: runId,
        hazards_detected: deduped.length,
        points_scanned: pointsScanned,
        upstream_errors: upstreamErrors,
        duration_ms: durationMs,
        status: "success",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    try {
      await ensureRunLogTable(sql);
      await writeRunLog(sql, {
        source: "gfs",
        runId,
        status: "failed",
        hazardsDetected: 0,
        durationMs,
        error: message,
      });
    } catch {
      // Ignore logging failure in error path.
    }

    return new Response(
      JSON.stringify({
        source: "gfs",
        run_id: runId,
        status: "failed",
        error: message,
        duration_ms: durationMs,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
