const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWt0YXpmd29remJ4bnV0cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NzAwNTAsImV4cCI6MjA4NjM0NjA1MH0.4fYLkQg5tLJuj5RUuSpNnfI4gzxXHDXkiJNL5J3Bc1Y";

async function callEdgeFunction(fnName: string) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const resp = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
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
