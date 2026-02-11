import { supabase } from "@/integrations/supabase/client";

export async function fetchRealtimeThreats() {
  const { data, error } = await supabase.functions.invoke("neon-threats");
  if (error) throw new Error(`Threats fetch failed: ${error.message}`);
  return data;
}

export async function fetchBackendHealth() {
  const { data, error } = await supabase.functions.invoke("neon-health");
  if (error) throw new Error(`Health check failed: ${error.message}`);
  return data;
}
