const API_BASE_RAW = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "")
  .replace(/['"]/g, "")
  .replace(/\/$/, "");

const API_BASE = API_BASE_RAW || (import.meta.env.DEV ? "http://localhost:8001" : "");

export async function fetchRealtimeThreats() {
  const url = `${API_BASE}/api/v1/weather/anomalies`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Threats fetch failed: ${res.status}`);
  return res.json();
}
