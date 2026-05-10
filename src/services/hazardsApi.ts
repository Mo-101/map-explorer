import { fnUrl, authHeaders } from "./apiBase";

async function callEdgeFunction(fnName: string, options?: { method?: string; body?: any }) {
  const resp = await fetch(fnUrl(fnName), {
    method: options?.method || "GET",
    headers: authHeaders(),
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
