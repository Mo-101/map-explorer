import { useEffect, useState } from "react";

export interface EnsoSignal {
  name: string;
  category: string;
  counted: boolean;
  consistent: boolean | null;
  value_mm?: number;
  normal_mm?: number;
  pct_of_normal?: number;
  members_above_upper_tercile_pct?: number;
  members_below_lower_tercile_pct?: number;
  value?: number;
  month?: string;
  period?: string;
  source?: string;
  note?: string;
  error?: string;
}

export interface EnsoRegion {
  id: string;
  name: string;
  season: string;
  expected: "wetter" | "drier";
  in_season: boolean;
  climate_baseline?: string;
  signals: EnsoSignal[];
  agreement: { consistent: number; of: number } | null;
}

export interface EnsoContext {
  oni: {
    value: number; season: string; year: number; phase: string; strength_class: string;
    change_3_months: number; niño34_sst_c: number;
    rank_for_season: { rank: number; of: number; record: boolean };
    analogs: { year: number; value_same_season: number; peak: number; peak_season: string }[];
    strength_note: string; source: string;
  };
  iod: { value: number; month: string; phase: string; stale: boolean; source_name: string } | null;
  regions: EnsoRegion[];
  generated_at: string;
}

const base = (import.meta.env.VITE_HAZARDS_API_BASE_URL || "").trim().replace(/\/$/, "");

/** El Niño triangulation from /api/v1/enso-context (server-cached for 24h). */
export function useEnsoContext(): EnsoContext | null {
  const [context, setContext] = useState<EnsoContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${base}/api/v1/enso-context`, { signal: AbortSignal.timeout(120000) });
        const body = await res.json();
        if (!cancelled && res.ok && body?.oni) setContext(body);
      } catch { /* keep the last context */ }
    };
    load();
    const t = setInterval(load, 3600000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  return context;
}
