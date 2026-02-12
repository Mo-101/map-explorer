let supabaseClient: any = null;

async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  try {
    const mod = await import("@/integrations/supabase/client");
    supabaseClient = mod.supabase;
    return supabaseClient;
  } catch (e) {
    console.warn("⚠️ Supabase client unavailable:", e);
    return null;
  }
}

export async function fetchRealtimeThreats() {
  const sb = await getSupabase();
  if (!sb) return { threats: [] };
  const { data, error } = await sb.functions.invoke("neon-threats");
  if (error) throw new Error(`Threats fetch failed: ${error.message}`);
  return data;
}

export async function fetchBackendHealth() {
  const sb = await getSupabase();
  if (!sb) throw new Error("Supabase client not available");
  const { data, error } = await sb.functions.invoke("neon-health");
  if (error) throw new Error(`Health check failed: ${error.message}`);
  return data;
}
