import { RAINFALL_POINTS } from "@/data/rainfallPoints";

export type AlertLevel = "advisory" | "watch" | "warning" | "emergency";
export const LEVEL_RANK: Record<AlertLevel, number> = { advisory: 1, watch: 2, warning: 3, emergency: 4 };
const LEVELS: AlertLevel[] = ["advisory", "watch", "warning", "emergency"];

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

export interface EnsoState { oni: number | null; phase: "El Niño" | "La Niña" | "Neutral" | "Unknown"; season: string | null }

// Flood-prone basins with El Niño exposure (East Africa first).
const BASINS = [
  { lat: -1.5, lon: 40.0, name: "Tana River (Garissa)", country: "Kenya", floodProne: true },
  { lat: -0.2, lon: 35.0, name: "Nyando Basin (Kisumu)", country: "Kenya", floodProne: true },
  { lat: -1.28, lon: 36.82, name: "Nairobi", country: "Kenya", floodProne: true },
  { lat: -4.05, lon: 39.67, name: "Mombasa Coast", country: "Kenya", floodProne: true },
  { lat: 3.1, lon: 35.6, name: "Turkana (Lodwar)", country: "Kenya", floodProne: false },
  { lat: 1.75, lon: 40.06, name: "Wajir", country: "Kenya", floodProne: true },
  { lat: -0.45, lon: 39.65, name: "Lower Tana (Hola)", country: "Kenya", floodProne: true },
  { lat: 3.1, lon: 43.65, name: "Juba–Shabelle (Baidoa)", country: "Somalia", floodProne: true },
  { lat: 4.74, lon: 45.2, name: "Beledweyne (Shabelle)", country: "Somalia", floodProne: true },
  { lat: 7.0, lon: 39.9, name: "Bale / Genale (Ethiopia)", country: "Ethiopia", floodProne: true },
];
const COUNTRY_HINT: Record<string, string> = {
  "Kenya Highlands": "Kenya", "Ethiopian Highlands": "Ethiopia", "Lake Victoria Basin": "Uganda", "Dar es Salaam Coast": "Tanzania",
  Mogadishu: "Somalia", "Rwanda Highlands": "Rwanda", "Bujumbura Lowlands": "Burundi", "Tanzania Western": "Tanzania",
};
const SITES = [...BASINS, ...RAINFALL_POINTS.map(p => ({ ...p, country: COUNTRY_HINT[p.name] ?? "Africa", floodProne: /basin|delta|coast|nile|lake/i.test(p.name) }))];

const EAST_AFRICA = (lat: number, lon: number) => lat > -12 && lat < 15 && lon > 28 && lon < 52;

export async function fetchEnso(): Promise<EnsoState> {
  const cached = localStorage.getItem("enso-cache");
  if (cached) {
    const { at, value } = JSON.parse(cached);
    if (Date.now() - at < 86400000) return value;
  }
  try {
    const res = await fetch("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error();
    const rows = (await res.text()).trim().split("\n").slice(1).map(l => l.trim().split(/\s+/));
    const last = rows[rows.length - 1];
    const oni = Number(last[3]);
    const value: EnsoState = { oni, season: `${last[0]} ${last[1]}`, phase: oni >= 0.5 ? "El Niño" : oni <= -0.5 ? "La Niña" : "Neutral" };
    localStorage.setItem("enso-cache", JSON.stringify({ at: Date.now(), value }));
    return value;
  } catch {
    return { oni: null, phase: "Unknown", season: null };
  }
}

function bump(level: AlertLevel, by: number): AlertLevel {
  return LEVELS[Math.min(3, Math.max(0, LEVELS.indexOf(level) + by))];
}

export async function evaluateRainfall(enso: EnsoState): Promise<EarlyAlert[]> {
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
  const alerts: EarlyAlert[] = [];

  rows.forEach((row: any, i: number) => {
    const site = SITES[i];
    const p: number[] = (row?.daily?.precipitation_sum ?? []).map((v: number) => (Number.isFinite(v) ? v : 0));
    if (!site || p.length < 6) return;
    const past3 = p.slice(0, 3).reduce((a, b) => a + b, 0);
    const future = p.slice(3);
    const max24 = Math.max(...future);
    const peakDay = future.indexOf(max24);
    const next3 = future.slice(0, 3).reduce((a, b) => a + b, 0);
    const week = future.reduce((a, b) => a + b, 0);
    const ensoBoost = enso.phase === "El Niño" && shortRains && EAST_AFRICA(site.lat, site.lon) ? 1 : 0;
    const peakDate = row.daily.time?.[3 + peakDay] ?? "";
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const ensoNote = ensoBoost ? ` El Niño active (ONI ${enso.oni?.toFixed(1)}) — East Africa short-rains thresholds lowered one level.` : "";

    let level: AlertLevel | null = null;
    if (next3 >= 150) level = "emergency";
    else if (max24 >= 100) level = "warning";
    else if (max24 >= 50) level = "watch";
    else if (max24 >= 30) level = "advisory";
    if (level) {
      level = bump(level, ensoBoost);
      alerts.push({
        id: `rain-${site.name}`, kind: "heavy-rain", level, name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Forecast peak ${max24.toFixed(0)} mm in 24h on ${peakDate}; ${next3.toFixed(0)} mm over next 3 days.${ensoNote}`,
        source: "Open-Meteo forecast", issuedAt, validUntil, confidence: peakDay <= 2 ? 0.8 : 0.6,
      });
    }

    if (site.floodProne && past3 >= 40 && next3 >= 40) {
      let fl: AlertLevel = past3 + next3 >= 200 ? "warning" : past3 + next3 >= 120 ? "watch" : "advisory";
      fl = bump(fl, ensoBoost);
      alerts.push({
        id: `flood-${site.name}`, kind: "flood-risk", level: fl, name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Saturated ground: ${past3.toFixed(0)} mm in last 3 days plus ${next3.toFixed(0)} mm expected in flood-prone area.${ensoNote}`,
        source: "Open-Meteo observed + forecast", issuedAt, validUntil, confidence: 0.7,
      });
    }

    if (enso.phase === "La Niña" && EAST_AFRICA(site.lat, site.lon) && shortRains && past3 + week < 5) {
      alerts.push({
        id: `dry-${site.name}`, kind: "drought", level: "watch", name: site.name, country: site.country, lat: site.lat, lon: site.lon,
        why: `Short rains failing: ${(past3 + week).toFixed(0)} mm over 10 days during La Niña.`,
        source: "Open-Meteo + NOAA ONI", issuedAt, validUntil, confidence: 0.6,
      });
    }
  });
  return alerts;
}

export function threatsToAlerts(threats: any[]): EarlyAlert[] {
  const issuedAt = new Date().toISOString();
  return threats
    .filter(t => ["high", "critical", "red", "extreme"].includes(String(t.severity ?? "").toLowerCase()))
    .map(t => ({
      id: `hz-${t.id}`, kind: "hazard" as const,
      level: (["critical", "red", "extreme"].includes(String(t.severity).toLowerCase()) ? "emergency" : "warning") as AlertLevel,
      name: t.title || `${t.threat_type} event`, country: t.country || t.region || "", lat: t.center_lat, lon: t.center_lng,
      why: t.description || `${t.threat_type} reported with ${t.severity} severity.`,
      source: t.source || "Live hazard feed", issuedAt, validUntil: t.expires_at || new Date(Date.now() + 2 * 86400000).toISOString(), confidence: 0.85,
    }));
}
