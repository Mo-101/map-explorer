import { COUNTRIES } from '../_shared/countries.js';
import { corsHeaders } from '../_shared/cors.js';

let cache: { at: number; body: any } | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export function summarizeCountry(row: any, index: number) {
  const country = COUNTRIES[index];
  const rain = row?.daily?.precipitation_sum;
  const dates = row?.daily?.time;
  if (!Array.isArray(rain) || rain.length !== 7 || rain.some(v => typeof v !== 'number' || !Number.isFinite(v)) || dates?.length !== 7) {
    return { ...country, available: false, reason: 'Incomplete forecast data' };
  }
  const peak = Math.max(...rain);
  return { ...country, available: true, rainfall_7d_mm: +rain.reduce((a, b) => a + b, 0).toFixed(1),
    peak_24h_mm: peak, peak_date: dates[rain.indexOf(peak)], from: dates[0], to: dates[6] };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (cache && Date.now() - cache.at < 30 * 60000) return json(cache.body);
  try {
    const params = new URLSearchParams({ latitude: COUNTRIES.map(c => c.lat).join(','), longitude: COUNTRIES.map(c => c.lon).join(','),
      daily: 'precipitation_sum', forecast_days: '7', timezone: 'UTC' });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`Forecast provider HTTP ${res.status}`);
    const rows = await res.json() as any[];
    if (!Array.isArray(rows) || rows.length !== COUNTRIES.length) throw new Error('Forecast response does not match monitoring locations');
    const body = { countries: rows.map(summarizeCountry), generated_at: new Date().toISOString(),
      source: 'Open-Meteo best-match numerical weather forecasts', scope: 'Named point locations; not national averages', stale: false };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Forecast unavailable';
    if (cache) return json({ ...cache.body, stale: true, error });
    return json({ error }, 502);
  }
}
