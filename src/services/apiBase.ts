// Central API base resolution with runtime failover.
//
// Primary: self-hosted Node/Fastify service (VITE_API_BASE_URL, default
// https://api.mostarindustries.com). If that host is unreachable from the
// browser, we automatically fall back to the hosted Edge Functions runtime,
// which talks to the same Neon database. This keeps the map live even when
// the VPS is down or DNS has not propagated.

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const FALLBACK_BASE =
  import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;

const DEFAULT_API_BASE = "https://api.mostarindustries.com";
const RAW_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || DEFAULT_API_BASE;

const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWt0YXpmd29remJ4bnV0cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NzAwNTAsImV4cCI6MjA4NjM0NjA1MH0.4fYLkQg5tLJuj5RUuSpNnfI4gzxXHDXkiJNL5J3Bc1Y";

function usable(raw: string): string | null {
  try {
    const u = new URL(raw);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    const browserIsLocal =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocal && !browserIsLocal) return null;
    return raw.replace(/\/$/, "");
  } catch {
    return null;
  }
}

const PRIMARY = usable(RAW_BASE);
const SECONDARY = FALLBACK_BASE.replace(/\/$/, "");

export const isSupabaseBase = (base: string) => base.includes("supabase.co");

/** Synchronous best guess — kept for back-compat with existing imports. */
export const API_BASE_URL: string = PRIMARY ?? SECONDARY;
export const USING_SUPABASE = isSupabaseBase(API_BASE_URL);

export function fnUrl(name: string, base: string = activeBase ?? API_BASE_URL): string {
  return `${base.replace(/\/$/, "")}/functions/v1/${name}`;
}

export function authHeaders(
  extra: Record<string, string> = {},
  base: string = activeBase ?? API_BASE_URL
): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (isSupabaseBase(base)) {
    h["apikey"] = SUPABASE_KEY;
    h["Authorization"] = `Bearer ${SUPABASE_KEY}`;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Failover resolution
// ---------------------------------------------------------------------------

let activeBase: string | null = null;
let probing: Promise<string | null> | null = null;
let lastProbe = 0;
const PROBE_TTL = 60_000;

async function reachable(base: string, timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = isSupabaseBase(base)
    ? `${base}/functions/v1/neon-health`
    : `${base}/health`;
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: authHeaders({}, base) });
    return res.ok || res.status === 503; // 503 = API up, DB degraded
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Resolve a working API base, probing primary then fallback. */
export async function resolveApiBase(force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && activeBase && now - lastProbe < PROBE_TTL) return activeBase;
  if (probing) return probing;

  probing = (async () => {
    const candidates = [PRIMARY, SECONDARY].filter(Boolean) as string[];
    for (const base of candidates) {
      if (await reachable(base)) {
        if (activeBase !== base) {
          // eslint-disable-next-line no-console
          console.info(`[apiBase] using ${base}`);
        }
        activeBase = base;
        lastProbe = Date.now();
        return base;
      }
    }
    activeBase = null;
    lastProbe = Date.now();
    return null;
  })();

  try {
    return await probing;
  } finally {
    probing = null;
  }
}

export class ApiUnreachableError extends Error {
  constructor() {
    super("No API host reachable");
    this.name = "ApiUnreachableError";
  }
}

/** Fetch an edge-function route on whichever host is currently reachable. */
export async function apiFetch(
  name: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15000, headers, ...rest } = init;
  const base = await resolveApiBase();
  if (!base) throw new ApiUnreachableError();

  const doFetch = async (b: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(fnUrl(name, b), {
        ...rest,
        signal: ctrl.signal,
        headers: { ...authHeaders({}, b), ...(headers as Record<string, string> | undefined) },
      });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    return await doFetch(base);
  } catch (e) {
    // Host died mid-session — re-probe once and retry on the other host.
    const next = await resolveApiBase(true);
    if (next && next !== base) return doFetch(next);
    throw e;
  }
}

export type ApiHealth = {
  reachable: boolean;
  base?: string;
  service?: string;
  time?: string;
  routes?: string[];
  latencyMs?: number;
  error?: string;
};

/** Ping whichever host is reachable, so the UI can show a clear status. */
export async function pingApi(timeoutMs = 5000): Promise<ApiHealth> {
  const started = performance.now();
  const base = await resolveApiBase(true);
  const latencyMs = Math.round(performance.now() - started);
  if (!base) {
    return { reachable: false, latencyMs, error: "no API host reachable" };
  }
  if (isSupabaseBase(base)) {
    return { reachable: true, base, service: "edge-functions", latencyMs };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    const body = (await res.json()) as Partial<ApiHealth> & { ok?: boolean };
    return {
      reachable: body.ok !== false,
      base,
      service: body.service,
      time: body.time,
      routes: body.routes,
      latencyMs,
    };
  } catch (e) {
    return { reachable: false, base, latencyMs, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}
