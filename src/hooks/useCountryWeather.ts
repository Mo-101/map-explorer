import { useEffect, useState } from 'react';
export interface CountryWeather {
  code: string; country: string; location: string; lat: number; lon: number; available: boolean;
  rainfall_7d_mm?: number; peak_24h_mm?: number; peak_date?: string; from?: string; to?: string;
}
export interface CountryWeatherFeed { countries: CountryWeather[]; generated_at: string; source: string; stale: boolean; error?: string }
export function useCountryWeather() {
  const [feed, setFeed] = useState<CountryWeatherFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const base = (import.meta.env.VITE_HAZARDS_API_BASE_URL || '').replace(/\/$/, '');
        const res = await fetch(`${base}/api/v1/country-weather`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Country forecast unavailable');
        if (!controller.signal.aborted) { setFeed(body); setError(null); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Country forecast unavailable'); }
    };
    load(); const timer = setInterval(load, 30 * 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return { feed, error };
}
