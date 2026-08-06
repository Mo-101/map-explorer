// Central API base resolution.
// Prefer the self-hosted Node/Fastify service via VITE_API_BASE_URL
// (e.g. https://api.mostarindustries.com). Falls back to the legacy
// Supabase Edge Functions URL only if that env var is unset OR points to
// localhost while the app is running on a remote origin (which can never
// resolve from the user's browser).

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const FALLBACK_SUPABASE =
  import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;

// Default to the production Fastify host on the VPS. Override at build time via
// VITE_API_BASE_URL (e.g. http://localhost:8080 for local dev).
const DEFAULT_API_BASE = "https://api.mostarindustries.com";
const RAW_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || DEFAULT_API_BASE;

function pickBase(): string {
  if (!RAW_BASE) return FALLBACK_SUPABASE;
  try {
    const u = new URL(RAW_BASE);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    const browserIsLocal =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocal && !browserIsLocal) {
      // eslint-disable-next-line no-console
      console.warn(
        `[apiBase] VITE_API_BASE_URL is set to ${RAW_BASE} but the app is running on ${window.location.host}. ` +
          `The browser cannot reach localhost from a remote origin. Falling back to ${FALLBACK_SUPABASE}. ` +
          `Deploy the Fastify service and set VITE_API_BASE_URL to its public URL (e.g. https://api.mostarindustries.com).`
      );
      return FALLBACK_SUPABASE;
    }
    return RAW_BASE;
  } catch {
    console.warn(`[apiBase] Invalid VITE_API_BASE_URL: ${RAW_BASE}. Falling back to ${FALLBACK_SUPABASE}.`);
    return FALLBACK_SUPABASE;
  }
}

export const API_BASE_URL: string = pickBase();
export const USING_SUPABASE = API_BASE_URL.includes("supabase.co");

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWt0YXpmd29remJ4bnV0cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NzAwNTAsImV4cCI6MjA4NjM0NjA1MH0.4fYLkQg5tLJuj5RUuSpNnfI4gzxXHDXkiJNL5J3Bc1Y";

export function fnUrl(name: string): string {
  return `${API_BASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (USING_SUPABASE) {
    h["apikey"] = SUPABASE_KEY;
    h["Authorization"] = `Bearer ${SUPABASE_KEY}`;
  }
  return h;
}

export type ApiHealth = {
  reachable: boolean;
  service?: string;
  time?: string;
  routes?: string[];
  latencyMs?: number;
  error?: string;
};

/**
 * Ping the Fastify service `/health` endpoint. Returns a structured result
 * so the UI can distinguish "API unreachable" from "DB down" cleanly.
 * Supabase fallback has no `/health` route, so we treat it as reachable if
 * the origin responds at all.
 */
export async function pingApi(timeoutMs = 4000): Promise<ApiHealth> {
  if (USING_SUPABASE) {
    return { reachable: true, service: "supabase-fallback" };
  }
  const url = `${API_BASE_URL.replace(/\/$/, "")}/health`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) return { reachable: false, latencyMs, error: `HTTP ${res.status}` };
    const body = (await res.json()) as Partial<ApiHealth> & { ok?: boolean };
    return {
      reachable: body.ok !== false,
      service: body.service,
      time: body.time,
      routes: body.routes,
      latencyMs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { reachable: false, error: msg.includes("abort") ? "timeout" : msg };
  } finally {
    clearTimeout(t);
  }
}
