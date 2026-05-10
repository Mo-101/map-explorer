// supabase/functions/whisper-query/index.ts
// Whisper Graph read proxy — The Phantom.
// Forwards three canonical Cypher query shapes to the isolated Neo4j subgraph
// without exposing bolt credentials to the browser.
//
// Degrades gracefully: when NEO4J_* secrets are absent, returns
// { degraded: true, reason: ... } with HTTP 200 so the UI never blanks.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type QueryKind = "point" | "rollout" | "anomalies";

interface QueryRequest {
  kind: QueryKind;
  // point: { lat, lon, cycle_id?, lead_hours? }
  // rollout: { lat, lon, cycle_id?, max_lead_hours? }
  // anomalies: { bbox?: [lat_min,lat_max,lon_min,lon_max], within_hours?: number, kind?: string }
  params: Record<string, unknown>;
}

const CYPHER: Record<QueryKind, string> = {
  point: `
    MATCH (l:W_Location)
    WHERE point.distance(l.point, point({latitude: $lat, longitude: $lon, srid: 4326})) < 25000
    WITH l ORDER BY point.distance(l.point, point({latitude: $lat, longitude: $lon, srid: 4326})) LIMIT 1
    MATCH (l)-[:HAS_FORECAST]->(f:W_ForecastNode)
    WHERE ($cycle_id IS NULL OR f.cycle_id = $cycle_id)
      AND ($lead_hours IS NULL OR f.lead_hours = $lead_hours)
    RETURN l.id AS location_id, l.lat AS lat, l.lon AS lon, l.region AS region,
           f.cycle_id AS cycle_id, f.lead_hours AS lead_hours,
           f.valid_time AS valid_time,
           f.t2m AS t2m, f.msl AS msl, f.tp AS tp,
           f.wind_speed_10m AS wind_speed_10m, f.precip_rate AS precip_rate,
           f.flood_risk AS flood_risk, f.storm_risk AS storm_risk
    ORDER BY f.lead_hours ASC LIMIT 64
  `,
  rollout: `
    MATCH (l:W_Location)
    WHERE point.distance(l.point, point({latitude: $lat, longitude: $lon, srid: 4326})) < 25000
    WITH l ORDER BY point.distance(l.point, point({latitude: $lat, longitude: $lon, srid: 4326})) LIMIT 1
    MATCH (l)-[:HAS_FORECAST]->(f:W_ForecastNode)
    WHERE ($cycle_id IS NULL OR f.cycle_id = $cycle_id)
      AND f.lead_hours <= coalesce($max_lead_hours, 240)
    RETURN l.id AS location_id, l.lat AS lat, l.lon AS lon, l.region AS region,
           collect({
             lead_hours: f.lead_hours,
             valid_time: f.valid_time,
             t2m: f.t2m, msl: f.msl, tp: f.tp,
             wind_speed_10m: f.wind_speed_10m,
             precip_rate: f.precip_rate,
             flood_risk: f.flood_risk
           }) AS series
  `,
  anomalies: `
    MATCH (v:ViolationFlag { source: 'whisper' })-[:AT]->(l:W_Location)
    WHERE ($kind IS NULL OR v.kind = $kind)
      AND ($status IS NULL OR v.status = $status)
      AND ($since IS NULL OR v.triggered_at >= datetime($since))
      AND ($lat_min IS NULL OR (l.lat >= $lat_min AND l.lat <= $lat_max
                            AND l.lon >= $lon_min AND l.lon <= $lon_max))
    OPTIONAL MATCH (f:W_ForecastNode)-[:VIOLATES_THRESHOLD]->(v)
    RETURN v.id AS id, v.kind AS kind, v.severity AS severity,
           v.status AS status, v.triggered_at AS triggered_at,
           l.id AS location_id, l.lat AS lat, l.lon AS lon, l.region AS region,
           v.cycle_id AS cycle_id, v.lead_hours AS lead_hours,
           v.valid_time AS valid_time
    ORDER BY v.severity DESC LIMIT 500
  `,
};

function degraded(reason: string, status = 200) {
  return new Response(
    JSON.stringify({ degraded: true, reason, rows: [] }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function runCypher(
  uri: string,
  user: string | undefined,
  password: string | undefined,
  database: string,
  cypher: string,
  params: Record<string, unknown>,
): Promise<unknown[]> {
  // Normalize URI: accept bolt://, neo4j://, or plain https:// (tunnel).
  let httpUrl = uri
    .replace(/^bolt(\+s|\+ssc)?:\/\//, "https://")
    .replace(/^neo4j(\+s|\+ssc)?:\/\//, "https://");
  // Strip default bolt port if present
  httpUrl = httpUrl.replace(/:7687(\/|$)/, "$1").replace(/\/$/, "");

  const url = `${httpUrl}/db/${database}/query/v2`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user && password) {
    headers.Authorization = "Basic " + btoa(`${user}:${password}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ statement: cypher, parameters: params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neo4j ${res.status}: ${text}`);
  }
  const json = await res.json();
  // Query API v2: { data: { fields, values: [[...], ...] } }
  const fields: string[] = json?.data?.fields ?? [];
  const values: unknown[][] = json?.data?.values ?? [];
  return values.map((row) =>
    Object.fromEntries(fields.map((f, i) => [f, row[i]]))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: QueryRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cypher = CYPHER[body.kind];
  if (!cypher) {
    return new Response(JSON.stringify({ error: "Unknown kind" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const NEO4J_URI = Deno.env.get("NEO4J_URI");
  const NEO4J_USER = Deno.env.get("NEO4J_USER");
  const NEO4J_PASSWORD = Deno.env.get("NEO4J_PASSWORD");
  const NEO4J_DATABASE = Deno.env.get("NEO4J_DATABASE") ?? "neo4j";

  if (!NEO4J_URI) {
    return degraded("Whisper Graph not configured yet");
  }

  try {
    const rows = await runCypher(
      NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE,
      cypher, (body.params ?? {}) as Record<string, unknown>,
    );
    return new Response(JSON.stringify({ degraded: false, rows }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[whisper-query]", msg);
    return degraded(`Whisper Graph unreachable: ${msg}`);
  }
});
