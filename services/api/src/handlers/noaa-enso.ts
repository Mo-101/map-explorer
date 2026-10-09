import { corsHeaders } from "../_shared/cors.js";

// NOAA CPC Oceanic Niño Index. Proxied so every browser shares one cached,
// validated read instead of hitting CPC directly (which also blocks CORS).
const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEASONS = new Set(["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]);

interface EnsoPayload {
  oni: number;
  season: string;
  year: number;
  phase: "El Niño" | "La Niña" | "Neutral";
  source: string;
  fetched_at: string;
}

let cache: { at: number; value: EnsoPayload } | null = null;

// Rows look like "SEAS  YR  TOTAL  ANOM"; ANOM is the ONI value.
export function parseLatestOni(text: string): EnsoPayload {
  const rows = text.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => {
    if (parts.length < 4 || !SEASONS.has(parts[0])) return false;
    const year = Number(parts[1]);
    const anom = Number(parts[3]);
    return Number.isInteger(year) && year >= 1950 && year <= 2100 && Number.isFinite(anom) && Math.abs(anom) < 5;
  });
  const last = rows.at(-1);
  if (!last) throw new Error("NOAA ONI file contained no valid rows");
  const oni = Number(last[3]);
  return {
    oni, season: last[0], year: Number(last[1]),
    phase: oni >= 0.5 ? "El Niño" : oni <= -0.5 ? "La Niña" : "Neutral",
    source: ONI_URL, fetched_at: new Date().toISOString(),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return json({ ...cache.value, stale: false });
  try {
    const res = await fetch(ONI_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`NOAA CPC returned HTTP ${res.status}`);
    const value = parseLatestOni(await res.text());
    cache = { at: Date.now(), value };
    return json({ ...value, stale: false });
  } catch (err) {
    // Serve the last good reading, clearly marked, rather than inventing a phase.
    if (cache) return json({ ...cache.value, stale: true, error: String(err) });
    return json({ error: err instanceof Error ? err.message : String(err) }, 503);
  }
}
