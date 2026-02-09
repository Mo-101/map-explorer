const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/['"]/g, "").replace(/\/$/, "") ||
  "http://localhost:8000";

export async function fetchRealtimeThreats() {
  const url = `${API_BASE}/api/v1/threats`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Threats fetch failed: ${res.status}`);
  return res.json();
}
