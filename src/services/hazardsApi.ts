import { fnUrl, authHeaders } from "./apiBase";

// The Neon read API is hosted alongside the frontend in dev and on Vercel.
// Other integrations can continue using their separate VITE_API_BASE_URL.
const hazardsBase = (import.meta.env.VITE_HAZARDS_API_BASE_URL || "").trim().replace(/\/$/, "");

async function readHazards(path: string, allowDegraded = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
  const response = await fetch(`${hazardsBase}/api/v1/${path}`, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });
  const data = await response.json();
  if (!response.ok && !(allowDegraded && typeof data?.database === "string")) {
    throw new Error(data?.error || `Hazards API returned HTTP ${response.status}`);
  }
  return data;
  } finally { clearTimeout(timeout); }
}

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
  const data = await readHazards("threats");
  if (!Array.isArray(data?.threats)) throw new Error("Invalid threats response");
  let page = data;
  while (page.has_more) {
    const offset = page.next_offset;
    if (!Number.isSafeInteger(offset) || offset <= 0) throw new Error("Invalid alerts pagination");
    page = await readHazards(`threats?offset=${offset}`);
    if (!Array.isArray(page?.threats) || (page.has_more && page.next_offset <= offset)) throw new Error("Invalid alerts pagination");
    data.threats.push(...page.threats);
  }
  data.count = data.threats.length;
  data.has_more = false;
  return data;
}

export async function fetchBackendHealth() {
  const data = await readHazards("health", true);
  if (typeof data?.database !== "string") throw new Error("Invalid database health response");
  return data;
}

export async function triggerGDACSIngestion() {
  return await callEdgeFunction("ingest-gdacs", { method: "POST" });
}

export async function triggerReliefWebIngestion() {
  return await callEdgeFunction("ingest-reliefweb", { method: "POST" });
}

export async function fetchSmokeTest() {
  return await fetchBackendHealth();
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
