// Prefer the self-hosted Node/Fastify service. Falls back to legacy Supabase Edge Functions
// only if VITE_API_BASE_URL is not set (useful during local dev / staged rollout).
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
    return import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;
  })();

const USING_SUPABASE = API_BASE_URL.includes("supabase.co");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWt0YXpmd29remJ4bnV0cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NzAwNTAsImV4cCI6MjA4NjM0NjA1MH0.4fYLkQg5tLJuj5RUuSpNnfI4gzxXHDXkiJNL5J3Bc1Y";

async function callEdgeFunction(fnName: string, options?: { method?: string; body?: any }) {
  const url = `${API_BASE_URL.replace(/\/$/, "")}/functions/v1/${fnName}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (USING_SUPABASE) {
    headers["apikey"] = SUPABASE_KEY;
    headers["Authorization"] = `Bearer ${SUPABASE_KEY}`;
  }
  const resp = await fetch(url, {
    method: options?.method || "GET",
    headers,
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!resp.ok) throw new Error(`Edge function ${fnName} returned ${resp.status}`);
  return resp.json();
}

export async function fetchRealtimeThreats() {
  try {
    return await callEdgeFunction("neon-threats");
  } catch (e) {
    console.warn("⚠️ Threats fetch failed:", e);
    return { threats: [] };
  }
}

export async function fetchBackendHealth() {
  return await callEdgeFunction("neon-health");
}

export async function triggerGDACSIngestion() {
  return await callEdgeFunction("ingest-gdacs", { method: "POST" });
}

export async function triggerReliefWebIngestion() {
  return await callEdgeFunction("ingest-reliefweb", { method: "POST" });
}

export async function fetchSmokeTest() {
  try {
    return await callEdgeFunction("smoke-test");
  } catch (e) {
    console.warn("⚠️ Smoke test failed:", e);
    return { database: "error", error: String(e) };
  }
}

export async function triggerUSGSIngestion() {
  return await callEdgeFunction("ingest-usgs", { method: "POST" });
}

export async function triggerWHODONIngestion() {
  return await callEdgeFunction("ingest-who-don", { method: "POST" });
}

export async function triggerFIRMSIngestion() {
  return await callEdgeFunction("ingest-firms", { method: "POST" });
}
