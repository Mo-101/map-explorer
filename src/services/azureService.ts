/**
 * Azure AI Service Handler
 * Now routes through the ai-analyze edge function (Lovable AI gateway).
 * No API keys in the frontend bundle.
 */

import { fnUrl, authHeaders } from "./apiBase";

export const fetchAzureAnalysis = async (prompt: string): Promise<string> => {
  try {
    const url = fnUrl("ai-analyze");
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
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
