import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corsHeaders } from "../_shared/cors.js";

// El Niño triangulation for Africa: the global driver (ONI), the regional
// modulator (Indian Ocean Dipole), and local evidence in each impact region
// (observed rainfall, short-range forecast, seasonal outlook), each placed in
// the 1991–2020 tercile distribution for the same calendar window. Nothing is
// combined into an invented probability: each signal is reported with its
// source, and agreement is a count of signals pointing the expected way.

const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
const DMI_URL = "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const SEASONAL = "https://seasonal-api.open-meteo.com/v1/seasonal";
const SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
const CLIMATE_YEARS = { from: 1991, to: 2020 };
const OBS_DAYS = 30, FORECAST_DAYS = 7, SEASONAL_DAYS = 90;
const CACHE_TTL_MS = 24 * 3600000;
const CACHE_FILE = join(tmpdir(), "afro-storm-enso-context.json");

type Point = [number, number]; // [lat, lon]
interface Region {
  id: string; name: string; months: number[]; season: string;
  expected: "wetter" | "drier"; iodRelevant: boolean; points: Point[];
}
// Each region is sampled at its centre and four points 4–5° away, all on land.
const REGIONS: Region[] = [
  { id: "east-africa", name: "Equatorial East Africa", months: [10, 11, 12], season: "October–December short rains",
    expected: "wetter", iodRelevant: true, points: [[0, 38], [-4, 38], [4, 38], [0, 34], [0, 42]] },
  { id: "southern-africa", name: "Southern Africa", months: [11, 12, 1, 2, 3], season: "November–March rainy season",
    expected: "drier", iodRelevant: false, points: [[-18, 29], [-22, 29], [-14, 29], [-18, 25], [-18, 33]] },
];

let memory: { at: number; body: any } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned HTTP ${res.status}`);
  return res.json();
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "Mozilla/5.0 (AFRO-STORM)" } });
  if (!res.ok) throw new Error(`${new URL(url).host} returned HTTP ${res.status}`);
  return res.text();
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** Same calendar date, `offset` years earlier or later. */
function shiftYears(d: Date, offset: number) { const c = new Date(d); c.setUTCFullYear(d.getUTCFullYear() + offset); return c; }

// ---------------------------------------------------------------- ONI ------
export function parseOni(text: string) {
  return text.split(/\r?\n/).map(l => l.trim().split(/\s+/))
    .filter(p => p.length >= 4 && SEASONS.includes(p[0]) && /^\d{4}$/.test(p[1]) && Number.isFinite(Number(p[3])))
    .map(p => ({ season: p[0], year: Number(p[1]), total: Number(p[2]), anom: Number(p[3]) }));
}

function strength(oni: number) {
  const a = Math.abs(oni);
  return a >= 2 ? "very strong" : a >= 1.5 ? "strong" : a >= 1 ? "moderate" : a >= 0.5 ? "weak" : "neutral";
}

function analyseOni(rows: ReturnType<typeof parseOni>) {
  const n = rows.length;
  const cur = rows[n - 1];
  const sameSeason = rows.map((r, i) => ({ ...r, i })).filter(r => r.season === cur.season);
  const ranked = [...sameSeason].sort((a, b) => b.anom - a.anom);
  const rank = ranked.findIndex(r => r.year === cur.year) + 1;
  // Past El Niño years at the same stage, and how high they went in the next 6 seasons.
  const analogs = sameSeason
    .filter(r => r.year !== cur.year && r.anom >= 1.0)
    .map(r => {
      const ahead = rows.slice(r.i, r.i + 7);
      const peak = ahead.reduce((m, x) => (x.anom > m.anom ? x : m), ahead[0]);
      return { year: r.year, value_same_season: r.anom, peak: peak.anom, peak_season: `${peak.season} ${peak.year}` };
    })
    .sort((a, b) => Math.abs(a.value_same_season - cur.anom) - Math.abs(b.value_same_season - cur.anom))
    .slice(0, 4);
  return {
    value: cur.anom, season: cur.season, year: cur.year, niño34_sst_c: cur.total,
    phase: cur.anom >= 0.5 ? "El Niño" : cur.anom <= -0.5 ? "La Niña" : "Neutral",
    strength_class: strength(cur.anom),
    change_3_months: +(cur.anom - rows[n - 4].anom).toFixed(2),
    recent: rows.slice(-6).map(r => ({ season: `${r.season} ${r.year}`, value: r.anom })),
    rank_for_season: { rank, of: sameSeason.length, record: rank === 1 },
    analogs,
    source: ONI_URL,
    strength_note: "Strength classes are a common ONI convention, not an official NOAA category.",
  };
}

// ---------------------------------------------------------------- IOD ------
function analyseIod(text: string, now: Date) {
  let latest: { year: number; month: number; value: number } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p.length !== 13 || !/^\d{4}$/.test(p[0])) continue;
    p.slice(1).forEach((v, m) => { const x = Number(v); if (Number.isFinite(x) && x > -999) latest = { year: Number(p[0]), month: m + 1, value: x }; });
  }
  if (!latest) throw new Error("No IOD values in NOAA PSL file");
  const { year, month, value } = latest as { year: number; month: number; value: number };
  const monthsBehind = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
  return {
    value, month: `${year}-${String(month).padStart(2, "0")}`,
    phase: value >= 0.4 ? "positive" : value <= -0.4 ? "negative" : "neutral",
    months_behind: monthsBehind, stale: monthsBehind > 2,
    thresholds: "±0.4 °C (Australian Bureau of Meteorology convention)",
    source: DMI_URL, source_name: "NOAA PSL Dipole Mode Index (HadISST)",
  };
}

// ------------------------------------------------------------ Rainfall -----
const coords = (pts: Point[]) => `latitude=${pts.map(p => p[0]).join(",")}&longitude=${pts.map(p => p[1]).join(",")}`;
const asList = (d: any) => (Array.isArray(d) ? d : [d]);

/** Regional mean of daily precipitation across the sample points. */
function regionalDaily(payload: any, key = "precipitation_sum"): number[] {
  const series = asList(payload).map((loc: any) => (loc.daily?.[key] ?? []) as (number | null)[]);
  const len = Math.min(...series.map(s => s.length));
  return Array.from({ length: len }, (_, i) => {
    const vals = series.map(s => s[i]).filter((v): v is number => typeof v === "number");
    if (vals.length < series.length) throw new Error("Missing rainfall values");
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
function terciles(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  return { lower: q(1 / 3), upper: q(2 / 3), median: q(0.5) };
}
const category = (v: number, t: { lower: number; upper: number }) => (v > t.upper ? "above normal" : v < t.lower ? "below normal" : "near normal");

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

async function regionSignals(region: Region, now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const obsStart = addDays(today, -OBS_DAYS), obsEnd = addDays(today, -1);
  const windowEnd = addDays(today, SEASONAL_DAYS - 1);
  const consistentWith = (cat: string) =>
    cat === "near normal" ? false : (region.expected === "wetter") === (cat === "above normal");

  // 1991–2020 regional totals for the same calendar windows.
  const years = Array.from({ length: CLIMATE_YEARS.to - CLIMATE_YEARS.from + 1 }, (_, i) => CLIMATE_YEARS.from + i);
  const climo = await inBatches(years, 5, async (y) => {
    const offset = y - today.getUTCFullYear();
    const s = shiftYears(obsStart, offset), e = shiftYears(windowEnd, offset);
    const daily = regionalDaily(await getJson(`${ARCHIVE}?${coords(region.points)}&start_date=${day(s)}&end_date=${day(e)}&daily=precipitation_sum&timezone=UTC`));
    return {
      obs: sum(daily.slice(0, OBS_DAYS)),
      fc: sum(daily.slice(OBS_DAYS, OBS_DAYS + FORECAST_DAYS)),
      season: sum(daily.slice(OBS_DAYS, OBS_DAYS + SEASONAL_DAYS)),
    };
  });
  const t = { obs: terciles(climo.map(c => c.obs)), fc: terciles(climo.map(c => c.fc)), season: terciles(climo.map(c => c.season)) };

  const signals: any[] = [];
  const attempt = async (name: string, fn: () => Promise<any>) => {
    try { signals.push({ name, ...(await fn()) }); }
    catch (e: any) { signals.push({ name, category: "unavailable", counted: false, consistent: null, error: e?.message || String(e) }); }
  };

  await attempt("Observed rainfall, last 30 days", async () => {
    const mm = sum(regionalDaily(await getJson(`${ARCHIVE}?${coords(region.points)}&start_date=${day(obsStart)}&end_date=${day(obsEnd)}&daily=precipitation_sum&timezone=UTC`)));
    const cat = category(mm, t.obs);
    return { value_mm: +mm.toFixed(1), normal_mm: +t.obs.median.toFixed(1), pct_of_normal: Math.round((mm / t.obs.median) * 100),
      period: `${day(obsStart)} to ${day(obsEnd)}`, category: cat, counted: true, consistent: consistentWith(cat),
      source: "ERA5/ERA5T reanalysis via Open-Meteo (most recent days preliminary)" };
  });

  await attempt("Forecast rainfall, next 7 days", async () => {
    const mm = sum(regionalDaily(await getJson(`${FORECAST}?${coords(region.points)}&daily=precipitation_sum&forecast_days=${FORECAST_DAYS}&timezone=UTC`)));
    const cat = category(mm, t.fc);
    return { value_mm: +mm.toFixed(1), normal_mm: +t.fc.median.toFixed(1), pct_of_normal: Math.round((mm / t.fc.median) * 100),
      period: `${day(today)} to ${day(addDays(today, FORECAST_DAYS - 1))}`, category: cat, counted: true, consistent: consistentWith(cat),
      source: "Open-Meteo forecast (best-match NWP models)" };
  });

  await attempt("Seasonal outlook, next 90 days", async () => {
    const payload = asList(await getJson(`${SEASONAL}?${coords(region.points)}&daily=precipitation_sum&forecast_days=${SEASONAL_DAYS}&timezone=UTC`));
    const members = Object.keys(payload[0]?.daily ?? {}).filter(k => k.startsWith("precipitation_sum_member"));
    if (!members.length) throw new Error("No ensemble members in seasonal response");
    const totals = members.map(k => sum(regionalDaily(payload, k)));
    const mean = sum(totals) / totals.length;
    const share = (pred: (v: number) => boolean) => Math.round((totals.filter(pred).length / totals.length) * 100);
    const cat = category(mean, t.season);
    return { value_mm: +mean.toFixed(0), normal_mm: +t.season.median.toFixed(0), pct_of_normal: Math.round((mean / t.season.median) * 100),
      members_above_upper_tercile_pct: share(v => v > t.season.upper), members_below_lower_tercile_pct: share(v => v < t.season.lower),
      period: `${day(today)} to ${day(windowEnd)}`, category: cat, counted: false, consistent: consistentWith(cat),
      note: "Indicative only: raw model totals compared with the ERA5 normal, with no model bias correction, so not counted.",
      source: `NCEP CFSv2 ensemble (${members.length} members) via Open-Meteo` };
  });

  const counted = signals.filter(s => s.counted && s.category !== "unavailable");
  return {
    id: region.id, name: region.name, season: region.season, expected: region.expected,
    sample_points: region.points, climate_baseline: `${CLIMATE_YEARS.from}–${CLIMATE_YEARS.to}, terciles of regional totals for the same dates`,
    signals,
    agreement: { consistent: counted.filter(s => s.consistent).length, of: counted.length },
  };
}

async function build(now: Date) {
  const [oniText, dmiText] = await Promise.all([getText(ONI_URL), getText(DMI_URL).catch(() => null)]);
  const oni = analyseOni(parseOni(oniText));
  let iod: any = null;
  try { iod = dmiText ? analyseIod(dmiText, now) : null; } catch { iod = null; }
  const month = now.getUTCMonth() + 1;
  const regions = await Promise.all(REGIONS.map(async r => {
    const inSeason = r.months.includes(month);
    if (!inSeason || oni.phase !== "El Niño") {
      return { id: r.id, name: r.name, season: r.season, expected: r.expected, in_season: inSeason, signals: [], agreement: null };
    }
    const sig = await regionSignals(r, now);
    if (r.iodRelevant && iod) {
      const iodConsistent = iod.phase === "positive"; // positive IOD also favours wetter short rains
      sig.signals.push({ name: "Indian Ocean Dipole", value: iod.value, month: iod.month, category: iod.phase,
        counted: !iod.stale, consistent: iod.stale ? null : iodConsistent, source: iod.source_name,
        note: iod.stale ? `Latest available value is from ${iod.month}; not counted until a current reading exists.` : undefined });
      const counted = sig.signals.filter((s: any) => s.counted && s.category !== "unavailable");
      sig.agreement = { consistent: counted.filter((s: any) => s.consistent).length, of: counted.length };
    }
    return { ...sig, in_season: true };
  }));
  return { oni, iod, regions, generated_at: now.toISOString() };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const now = new Date();
  if (!memory) {
    try { const disk = JSON.parse(await readFile(CACHE_FILE, "utf8")); memory = disk; } catch { /* no cache yet */ }
  }
  if (memory && now.getTime() - memory.at < CACHE_TTL_MS) return json({ ...memory.body, cached: true });
  try {
    const body = await build(now);
    memory = { at: now.getTime(), body };
    writeFile(CACHE_FILE, JSON.stringify(memory)).catch(() => {});
    return json({ ...body, cached: false });
  } catch (e: any) {
    if (memory) return json({ ...memory.body, cached: true, stale: true, error: e?.message || String(e) });
    return json({ error: e?.message || String(e) }, 502);
  }
}
