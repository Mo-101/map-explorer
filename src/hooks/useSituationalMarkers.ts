import { useEffect, useMemo, useState } from "react";

export interface SituationalMarker {
  id: string;
  type: string;
  location: string;
  lat: number;
  lng: number;
  status: "ACTIVE NOW" | "MONITORING" | "UNUSUAL" | "SITUATIONAL";
  description: string;
  context: string;
  factors: string[];
  timestamp: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface AnalyticsOutput {
  total_threats: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  regions_affected: string[];
  timestamp: string;
}

export interface SituationalResponse {
  timestamp: string;
  markers: SituationalMarker[];
  analytics: AnalyticsOutput;
  count: number;
  mode: string;
  system: string;
  moscripts_voice: string;
  detailed_voices: string[];
}

function getSituationalApiBaseUrl() {
  const raw =
    ((import.meta as any).env?.VITE_SITUATIONAL_API_BASE_URL as string | undefined) || "";
  const cleaned = raw.replace(/['"]/g, "").replace(/\/$/, "");
  if (cleaned) return cleaned;
  return import.meta.env.DEV ? "http://localhost:8001" : "";
}

export function useSituationalMarkers(refreshIntervalMs = 60_000) {
  const baseUrl = useMemo(() => getSituationalApiBaseUrl(), []);
  const [data, setData] = useState<SituationalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseUrl) {
      setError("Missing situational API base URL");
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchOnce = async () => {
      try {
        if (!mounted) return;
        setLoading(true);

        const res = await fetch(`${baseUrl}/api/v1/situational-markers`);
        const json = (await res.json()) as SituationalResponse;

        if (!mounted) return;

        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          setData(null);
          return;
        }

        setData(json);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Network error");
        setData(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchOnce();
    const interval = setInterval(fetchOnce, refreshIntervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [baseUrl, refreshIntervalMs]);

  return { baseUrl, data, loading, error };
}
