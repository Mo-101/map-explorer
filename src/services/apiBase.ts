// Central API base resolution.
// Prefer the self-hosted Node/Fastify service via VITE_API_BASE_URL (e.g.
// https://api.mostarindustries.com). Falls back to the legacy Supabase Edge
// Functions URL only if that env var is not set.

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const FALLBACK_SUPABASE =
  import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || FALLBACK_SUPABASE;

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
