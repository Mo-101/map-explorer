/**
 * Claude AI Service Handler
 * Now routes through the ai-analyze edge function (Lovable AI gateway).
 * No API keys in the frontend bundle.
 */

import { fnUrl, authHeaders } from "./apiBase";

export const fetchClaudeAnalysis = async (prompt: string): Promise<string> => {
  try {
    const url = fnUrl("ai-analyze");
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        prompt,
        system: "You are a strategic weather and disaster analyst for Africa. Provide strategic reasoning, safety assessments, and humanitarian impact analysis. Focus on actionable intelligence for African disaster response teams.",
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `AI analyze returned ${response.status}`);
    }

    const data = await response.json();
    return data.content || "";
  } catch (error: any) {
    console.error("[Strategic AI] Error:", error);
    return `Strategic analysis unavailable: ${error.message}`;
  }
};
