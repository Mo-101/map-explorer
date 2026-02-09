
/**
 * Claude AI Service Handler
 * Anthropic Claude integration for strategic reasoning and safety analysis.
 * Routes requests through the FastAPI backend to keep the API key server-side.
 */

const DEFAULTS = {
  BACKEND_URL: '',
  MODEL: 'claude-sonnet-4-20250514',
};

/**
 * Fetch Claude analysis via the backend proxy endpoint.
 * Falls back to the direct Anthropic API if a client-side key is provided.
 */
export const fetchClaudeAnalysis = async (prompt: string): Promise<string> => {
  const backendUrl = localStorage.getItem('API_BASE_URL') || import.meta.env.VITE_API_BASE_URL || DEFAULTS.BACKEND_URL;

  // Prefer backend proxy to keep API key server-side
  if (backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/api/v1/ai/claude/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: DEFAULTS.MODEL,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.response || data.analysis || '';
      }

      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Claude API Error (Code ${response.status})`);
    } catch (error: any) {
      console.error('[Claude Spirit] Backend proxy failed:', error);
      // Fall through to direct API if available
    }
  }

  // Direct API call fallback (for development with client-side key)
  const apiKey = localStorage.getItem('ANTHROPIC_API_KEY') || import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    return 'Claude Spirit offline. Configure ANTHROPIC_API_KEY or enable the backend proxy to activate strategic reasoning.';
  }

  try {
    console.log('[Claude Spirit] Establishing direct link...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: DEFAULTS.MODEL,
        max_tokens: 2000,
        system: 'You are Claude Spirit, a strategic weather and disaster analyst for Africa. Provide strategic reasoning, safety assessments, and humanitarian impact analysis. Focus on actionable intelligence for African disaster response teams.',
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.content?.[0]?.text || '';
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Claude API Error (Code ${response.status})`);
  } catch (error: any) {
    console.error('[Claude Spirit] Direct API failure:', error);
    return `Claude Spirit offline. Error: ${error.message}. Check API key configuration.`;
  }
};
