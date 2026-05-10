// src/services/whisperService.ts
// Typed client for The Phantom's Whisper Graph (read-only).
// Matches the three stormscribe-003 query patterns: point, rollout, anomalies.

import { fnUrl, authHeaders } from "./apiBase";
const FN_URL = fnUrl("whisper-query");

export interface WhisperForecast {
  location_id: string;
  lat: number;
  lon: number;
  region: string | null;
  cycle_id: string;
  lead_hours: number;
  valid_time: string;
  t2m: number | null;
  msl: number | null;
  tp: number | null;
  wind_speed_10m: number | null;
  precip_rate: number | null;
  flood_risk: number | null;
  storm_risk: number | null;
}

export interface WhisperRolloutPoint {
  lead_hours: number;
  valid_time: string;
  t2m: number | null;
  msl: number | null;
  tp: number | null;
  wind_speed_10m: number | null;
  precip_rate: number | null;
  flood_risk: number | null;
}

export interface WhisperRollout {
  location_id: string;
  lat: number;
  lon: number;
  region: string | null;
  series: WhisperRolloutPoint[];
}

/** Shared :ViolationFlag node raised by the Whisper subgraph (source='whisper'). */
export interface WhisperViolationFlag {
  id: string;
  kind: "low_pressure" | "heavy_precip" | "high_wind" | string;
  severity: number;
  status: "open" | "acknowledged" | "closed" | string;
  triggered_at: string;
  location_id: string;
  lat: number;
  lon: number;
  region: string | null;
  cycle_id?: string;
  lead_hours?: number;
  valid_time?: string;
}

/** @deprecated Use WhisperViolationFlag — flags are shared, not Whisper-scoped. */
export type WhisperAnomaly = WhisperViolationFlag;

interface WhisperResponse<T> {
  degraded: boolean;
  reason?: string;
  rows: T[];
}

async function call<T>(kind: string, params: Record<string, unknown>): Promise<WhisperResponse<T>> {
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
      },
      body: JSON.stringify({ kind, params }),
    });
    if (!res.ok) {
      return { degraded: true, reason: `whisper-query ${res.status}`, rows: [] };
    }
    return (await res.json()) as WhisperResponse<T>;
  } catch (err) {
    return {
      degraded: true,
      reason: err instanceof Error ? err.message : "network error",
      rows: [],
    };
  }
}

export const whisperService = {
  /** Point-in-time forecast for a location (nearest grid cell within 25km). */
  point(lat: number, lon: number, opts?: { cycle_id?: string; lead_hours?: number }) {
    return call<WhisperForecast>("point", {
      lat, lon,
      cycle_id: opts?.cycle_id ?? null,
      lead_hours: opts?.lead_hours ?? null,
    });
  },

  /** Full forecast trajectory (up to max_lead_hours) for a location. */
  rollout(lat: number, lon: number, opts?: { cycle_id?: string; max_lead_hours?: number }) {
    return call<WhisperRollout>("rollout", {
      lat, lon,
      cycle_id: opts?.cycle_id ?? null,
      max_lead_hours: opts?.max_lead_hours ?? 240,
    });
  },

  /** Shared :ViolationFlag scan filtered to source='whisper'. */
  anomalies(opts?: {
    kind?: string;
    status?: string;
    since?: string; // ISO datetime
    bbox?: [number, number, number, number]; // [lat_min, lat_max, lon_min, lon_max]
  }) {
    const [lat_min, lat_max, lon_min, lon_max] = opts?.bbox ?? [null, null, null, null] as any;
    return call<WhisperViolationFlag>("anomalies", {
      kind: opts?.kind ?? null,
      status: opts?.status ?? "open",
      since: opts?.since ?? null,
      lat_min, lat_max, lon_min, lon_max,
    });
  },
};
