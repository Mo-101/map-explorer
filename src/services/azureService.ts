/**
 * Azure AI Service Handler
 * Now routes through the ai-analyze edge function (Lovable AI gateway).
 * No API keys in the frontend bundle.
 */

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "tciktazfwokzbxnutpvh";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || `https://${PROJECT_ID}.supabase.co`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaWt0YXpmd29remJ4bnV0cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NzAwNTAsImV4cCI6MjA4NjM0NjA1MH0.4fYLkQg5tLJuj5RUuSpNnfI4gzxXHDXkiJNL5J3Bc1Y";

export const fetchAzureAnalysis = async (prompt: string): Promise<string> => {
  try {
    const url = `${SUPABASE_URL}/functions/v1/ai-analyze`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        system: "You are an elite weather forensic analyst for Africa. Provide scientific validation for atmospheric models. Focus on satellite telemetry data for African disaster monitoring.",
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `AI analyze returned ${response.status}`);
    }

    const data = await response.json();
    return data.content || "";
  } catch (error: any) {
    console.error("[AI Analyze] Error:", error);
    return `AI analysis unavailable: ${error.message}`;
  }
};
