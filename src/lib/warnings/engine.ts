import { RAINFALL_POINTS } from "@/data/rainfallPoints";

export type AlertLevel = "advisory" | "watch" | "warning" | "emergency";
export const LEVEL_RANK: Record<AlertLevel, number> = { advisory: 1, watch: 2, warning: 3, emergency: 4 };

export interface EarlyAlert {
  id: string;
  kind: "heavy-rain" | "flood-risk" | "drought" | "hazard";
  level: AlertLevel;
  name: string;
  country: string;
  lat: number;
  lon: number;
  why: string;
  source: string;
  issuedAt: string;
  validUntil: string;
  confidence: number;
}

export interface EnsoState {
  oni: number | null;
  phase: "El Niño" | "La Niña" | "Neutral" | "Unknown";
  season: string | null;
  stale?: boolean;
}

export interface RainfallEvaluation { alerts: EarlyAlert[]; skipped: string[] }
export interface HazardEvaluation { alerts: EarlyAlert[]; staleCount: number }

// Flood-prone basins with El Niño exposure (East Africa first).
const BASINS = [
  { lat: -1.5, lon: 40.0, name: "Tana River (Garissa)", country: "Kenya", floodProne: true },
  { lat: -0.2, lon: 35.0, name: "Nyando Basin (Kisumu)", country: "Kenya", floodProne: true },
  { lat: -1.28, lon: 36.82, name: "Nairobi", country: "Kenya", floodProne: true },
  { lat: -4.05, lon: 39.67, name: "Mombasa Coast", country: "Kenya", floodProne: true },
  { lat: 3.1, lon: 35.6, name: "Turkana (Lodwar)", country: "Kenya", floodProne: false, arid: true },
  { lat: 1.75, lon: 40.06, name: "Wajir", country: "Kenya", floodProne: true, arid: true },
  { lat: -0.45, lon: 39.65, name: "Lower Tana (Hola)", country: "Kenya", floodProne: true },
  { lat: 3.1, lon: 43.65, name: "Juba–Shabelle (Baidoa)", country: "Somalia", floodProne: true },
  { lat: 4.74, lon: 45.2, name: "Beledweyne (Shabelle)", country: "Somalia", floodProne: true },
  { lat: 7.0, lon: 39.9, name: "Bale / Genale (Ethiopia)", country: "Ethiopia", floodProne: true },
];
const COUNTRY_HINT: Record<string, string> = {
  "Kenya Highlands": "Kenya", "Ethiopian Highlands": "Ethiopia", "Lake Victoria Basin": "Uganda", "Dar es Salaam Coast": "Tanzania",
  Mogadishu: "Somalia", "Rwanda Highlands": "Rwanda", "Bujumbura Lowlands": "Burundi", "Tanzania Western": "Tanzania",
};
const ARID_POINTS = new Set(["Mogadishu"]);
const SITES: { lat: number; lon: number; name: string; country: string; floodProne: boolean; arid?: boolean }[] = [
  ...BASINS,
  ...RAINFALL_POINTS.map(p => ({ ...p, country: COUNTRY_HINT[p.name] ?? "Africa", floodProne: /basin|delta|coast|nile|lake/i.test(p.name), arid: ARID_POINTS.has(p.name) })),
];

const EAST_AFRICA = (lat: number, lon: number) => lat > -12 && lat < 15 && lon > 28 && lon < 52;
const HAZARD_MAX_AGE_MS = 72 * 3600000;
// Open-Meteo past days come from its forecast model, not rain gauges.
const RAIN_SOURCE = "Open-Meteo forecast model (past days are model estimates, not gauge observations)";

const hazardsBase = (import.meta.env.VITE_HAZARDS_API_BASE_URL || "").trim().replace(/\/$/, "");

function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw);
    return Date.now() - at < maxAgeMs ? value : null;
  } catch { return null; }
}

function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage unavailable */ }
}

// NOAA ONI via our backend proxy (/api/v1/enso), which caches and validates it.
export async function fetchEnso(): Promise<EnsoState> {
  const cached = readCache<EnsoState>("enso-cache", 6 * 3600000);
  if (cached) return cached;
  try {
    const res = await fetch(`${hazardsBase}/api/v1/enso`, { signal: AbortSignal.timeout(12000) });
    const body = await res.json();
    if (!res.ok || !Number.isFinite(body?.oni)) throw new Error(body?.error || `HTTP ${res.status}`);
    const value: EnsoState = { oni: body.oni, phase: body.phase, season: `${body.season} ${body.year}`, stale: Boolean(body.stale) };
    if (!value.stale) writeCache("enso-cache", value);
    return value;
  } catch {
    return { oni: null, phase: "Unknown", season: null };
  }
}

function elNinoContext(enso: EnsoState, lat: number, lon: number, shortRains: boolean): string | null {
  if (enso.phase !== "El Niño" || !shortRains || !EAST_AFRICA(lat, lon)) return null;
  return ` Seasonal context: El Niño active (ONI ${enso.oni?.toFixed(1)}, ${enso.season}) raises preparedness for the short rains; the level above comes from local rainfall only.`;
}

export async function evaluateRainfall(enso: EnsoState): Promise<RainfallEvaluation> {
  const params = new URLSearchParams({
    latitude: SITES.map(s => s.lat).join(","), longitude: SITES.map(s => s.lon).join(","),
    daily: "precipitation_sum", past_days: "3", forecast_days: "7", timezone: "UTC",
  });
  const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error("Rainfall provider HTTP " + res.status);
  const payload = await res.json();
  const rows = Array.isArray(payload) ? payload : [payload];
  const month = new Date().getUTCMonth();
  const shortRains = month >= 9 && month <= 11;
  const issuedAt = new Date().toISOString();
  const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
  const alerts: EarlyAlert[] = [];
  const skipped: string[] = [];

  rows.forEach((row: any, i: number) => {
    const site = SITES[i];
    if (!site) return;
    const raw: unknown[] = row?.daily?.precipitation_sum ?? [];
    // Missing values are unknown, not 0 mm: skip the site rather than under-warn.
    const values = raw.map(v => (typeof v === "number" && Number.isFinite(v) ? v : null));
    if (values.length < 6 || values.slice(0, 6).some(v => v === null)) { skipped.push(site.name); return; }
    const past3 = (values.slice(0, 3) as number[]).reduce((a, b) => a + b, 0);
    // Use forecast days up to the first gap so indices still line up with dates.
    const forecast = values.slice(3);
    const gap = forecast.indexOf(null);
    const future = (gap === -1 ? forecast : forecast.slice(0, gap)) as number[];
    const max24 = Math.max(...future);
    const peakDay = future.indexOf(max24);
    const next3 = future.slice(0, 3).reduce((a, b) => a + b, 0);
    const week = future.reduce((a, b) => a + b, 0);
    const peakDate = row.daily.time?.[3 + peakDay] ?? "";
    const context = elNinoContext(enso, site.lat, site.lon, shortRains);
    const contextBoost = context ? 0.05 : 0;

    let level: AlertLevel | null = null;
    if (next3 >= 150) level = "emergency";
    else if (max24 >= 100) level = "warning";
    else if (max24 >= 50) level = "watch";
    else if (max24 >= 30) level = "advisory";
    if (level) {
      alerts.push({
        id: `rain-${site.name}`, kind: "heavy-rain", level, name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Forecast peak ${max24.toFixed(0)} mm in 24h on ${peakDate}; ${next3.toFixed(0)} mm over next 3 days.${context ?? ""}`,
        source: RAIN_SOURCE, issuedAt, validUntil, confidence: (peakDay <= 2 ? 0.8 : 0.6) + contextBoost,
      });
    }

    if (site.floodProne && past3 >= 40 && next3 >= 40) {
      const fl: AlertLevel = past3 + next3 >= 200 ? "warning" : past3 + next3 >= 120 ? "watch" : "advisory";
      alerts.push({
        id: `flood-${site.name}`, kind: "flood-risk", level: fl, name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Wet ground: model-estimated ${past3.toFixed(0)} mm over the last 3 days plus ${next3.toFixed(0)} mm forecast in a flood-prone area.${context ?? ""}`,
        source: RAIN_SOURCE, issuedAt, validUntil, confidence: 0.6 + contextBoost,
      });
    }

    if (shortRains && !site.arid && EAST_AFRICA(site.lat, site.lon) && past3 + week < 5) {
      const laNina = enso.phase === "La Niña" ? ` Seasonal context: La Niña (ONI ${enso.oni?.toFixed(1)}) favours below-normal short rains.` : "";
      alerts.push({
        id: `dry-${site.name}`, kind: "drought", level: "advisory", name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Short rains failing: ${(past3 + week).toFixed(0)} mm over 10 days (model estimate + forecast).${laNina}`,
        source: RAIN_SOURCE, issuedAt, validUntil, confidence: laNina ? 0.6 : 0.5,
      });
    }
  });

  // ENSO itself is shown by ElNinoLayer and the ticker; it is seasonal context, not an alert.
  return { alerts, skipped };
}

// External feeds (GDACS, USGS, GFS signals…) stay their own alert kind; they never
// feed the rainfall rules. Records older than 72h are reported as stale, not alerted.
export function threatsToAlerts(threats: any[]): HazardEvaluation {
  const now = Date.now();
  const issuedAt = new Date().toISOString();
  let staleCount = 0;
  const alerts: EarlyAlert[] = [];
  for (const t of threats) {
    const severity = String(t.severity ?? "").toLowerCase();
    if (!["high", "critical", "red", "extreme"].includes(severity)) continue;
    // When the feed last confirmed the event, not when it started (droughts run for months).
    const seen = Date.parse(t.last_seen_at ?? t.updated_at ?? t.timestamp ?? t.created_at ?? "");
    const expires = Date.parse(t.expires_at ?? "");
    if (!Number.isFinite(seen) || now - seen > HAZARD_MAX_AGE_MS || (Number.isFinite(expires) && expires < now)) { staleCount++; continue; }
    alerts.push({
      id: `hz-${t.id}`, kind: "hazard",
      level: ["critical", "red", "extreme"].includes(severity) ? "emergency" : "warning",
      name: t.title || `${t.threat_type} event`, country: t.country || t.region || "", lat: t.center_lat, lon: t.center_lng,
      why: t.description || `${t.threat_type} reported with ${t.severity} severity.`,
      source: t.source || "Live hazard feed", issuedAt,
      validUntil: t.expires_at || new Date(seen + HAZARD_MAX_AGE_MS).toISOString(), confidence: 0.85,
    });
  }
  return { alerts, staleCount };
}
