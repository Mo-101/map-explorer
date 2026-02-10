/**
 * AI Service - Multi-Provider Intelligence
 * Primary: Azure OpenAI (afro-ai-resource)
 * Strategic: Anthropic Claude (strategic reasoning & safety)
 * Sovereign African health intelligence through multi-model fusion
 */

import { DisasterType } from "../types/disaster";

interface MapEvent {
  id: string;
  type: string;
  location: string;
  lat: number;
  lng: number;
  intensity: number;
  description: string;
  timestamp: string;
  source: string;
}
import { fetchAzureAnalysis } from "./azureService";
import { fetchClaudeAnalysis } from "./claudeService";

// Batch cache for 30 minutes
const BATCH_CACHE_TTL = 30 * 60 * 1000;
const cache: Record<string, { data: any; timestamp: number }> = {};

/**
 * Robust JSON extraction from AI string responses
 */
const extractJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const startIdx = Math.min(
      text.indexOf('{') !== -1 ? text.indexOf('{') : Infinity,
      text.indexOf('[') !== -1 ? text.indexOf('[') : Infinity
    );
    const endIdx = Math.max(
      text.lastIndexOf('}'),
      text.lastIndexOf(']')
    );

    if (startIdx !== Infinity && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = text.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (innerErr) {
        console.error("Failed to parse extracted JSON:", jsonStr, innerErr);
        throw innerErr;
      }
    }
    throw new Error("No JSON structure found in response");
  }
};

/**
 * Generic caching wrapper
 */
const withBatchCache = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < BATCH_CACHE_TTL) {
    console.log(`[Cache Hit] ${key}`);
    return cached.data;
  }
  const result = await fetcher();
  cache[key] = { data: result, timestamp: Date.now() };
  return result;
};

/**
 * Fetch disaster alerts for a region
 */
export const fetchDisasterAlerts = async (region: string = "Africa"): Promise<string> => {
  return withBatchCache(`alerts_${region}`, async () => {
    const prompt = `List current natural disaster alerts for ${region}. Focus on active threats. Provide a concise scientific summary.`;
    return await fetchAzureAnalysis(prompt);
  });
};

/**
 * Get live disaster map data with coordinates
 */
export const getLiveDisasterMapData = async (): Promise<MapEvent[]> => {
  return withBatchCache('map_data', async () => {
    const prompt = `Identify current natural disasters in Africa with lat/lng coordinates, type, and description. 
Format the output strictly as a JSON array of objects with keys: id, type, location, lat, lng, intensity, description, timestamp, source. 
Use double quotes for all keys and string values.
Example: [{"id": "1", "type": "Flood", "location": "Lagos, Nigeria", "lat": 6.5244, "lng": 3.3792, "intensity": 0.8, "description": "Severe flooding", "timestamp": "2024-01-15T10:00:00Z", "source": "AFRO STORM"}]`;
    
    try {
      const response = await fetchAzureAnalysis(prompt);
      return extractJson(response);
    } catch (e) {
      console.error("Failed to parse map data:", e);
      return [];
    }
  });
};

/**
 * Get scientific forecast for a location
 */
export const getScientificForecast = async (
  location: string, 
  type: string
): Promise<{ data: string; metrics: any }> => {
  return withBatchCache(`forecast_${location}_${type}`, async () => {
    const prompt = `Analyze atmospheric conditions for ${location} regarding ${type}. 
Return a JSON object with a 'prediction' string and a 'metrics' object containing flat numbers for windSpeed, precipitation, pressure, and humidity. 
Example: {"prediction": "Heavy rainfall expected", "metrics": {"windSpeed": 45, "precipitation": 12, "pressure": 1012, "humidity": 80}}`;
    
    try {
      const response = await fetchAzureAnalysis(prompt);
      const parsed = extractJson(response);
      return {
        data: parsed.prediction || "Forecast unavailable.",
        metrics: parsed.metrics || { windSpeed: 0, precipitation: 0, pressure: 1013, humidity: 50 }
      };
    } catch (e) {
      return {
        data: "Satellite forecast unavailable.",
        metrics: { windSpeed: 0, precipitation: 0, pressure: 1013, humidity: 50 }
      };
    }
  });
};

/**
 * Get geographic risk analysis
 */
export const getGeographicRiskAnalysis = async (
  region: string, 
  type: DisasterType
): Promise<string> => {
  return withBatchCache(`risk_${region}_${type}`, async () => {
    const prompt = `Provide a detailed geographic risk assessment for ${type} in ${region}. 
Analyze landscape vulnerability and historical context. Be concise but thorough.`;
    return await fetchAzureAnalysis(prompt);
  });
};

/**
 * Deep disaster analysis with sources - uses both Azure and Claude
 */
export const getDeepDisasterAnalysis = async (query: string) => {
  return withBatchCache(`deep_${query.substring(0, 50)}`, async () => {
    const enhancedQuery = `${query}

Provide a comprehensive analysis with citations to scientific sources where possible.`;

    // Run Azure and Claude in parallel for richer analysis
    const [azureResponse, claudeResponse] = await Promise.allSettled([
      fetchAzureAnalysis(enhancedQuery),
      fetchClaudeAnalysis(`Strategic safety analysis for African disaster response: ${query}`)
    ]);

    const azureText = azureResponse.status === 'fulfilled' ? azureResponse.value : '';
    const claudeText = claudeResponse.status === 'fulfilled' ? claudeResponse.value : '';

    const providers: string[] = [];
    if (azureText) providers.push("Azure OpenAI");
    if (claudeText) providers.push("Anthropic Claude");

    const combinedText = claudeText
      ? `${azureText}\n\n--- Strategic Assessment (Claude) ---\n${claudeText}`
      : azureText;

    return {
      text: combinedText,
      sources: [],
      provider: providers.join(" + ") || "None"
    };
  });
};

/**
 * Quick weather tip/response
 */
export const getQuickWeatherResponse = async (query: string): Promise<string> => {
  const prompt = `Provide a very quick, expert weather response for: ${query}`;
  return await fetchAzureAnalysis(prompt);
};

/**
 * Generate health alert message
 */
export const generateHealthAlert = async (
  threat: any,
  language: 'en' | 'fr' | 'pt' | 'ar' = 'en'
): Promise<string> => {
  const prompt = `Generate a ${language === 'en' ? 'clear, actionable health alert' : 'alerte sanitaire claire et actionable'} 
for health workers in Africa.

Threat: ${threat.threat_type}
Risk Level: ${threat.risk_level}
Affected: ${threat.affected_regions?.join(', ')}
Lead Time: ${threat.lead_time_days} days

Requirements:
- Suitable for SMS (under 160 characters)
- Include specific preventive action
- Urgent but professional tone
${language !== 'en' ? `- Language: ${language}` : ''}`;

  return await fetchAzureAnalysis(prompt);
};

/**
 * Get strategic analysis from Claude for disaster response planning
 */
export const getStrategicAnalysis = async (
  query: string,
  region: string = "Africa"
): Promise<{ analysis: string; provider: string }> => {
  return withBatchCache(`strategic_${region}_${query.substring(0, 50)}`, async () => {
    const prompt = `Strategic disaster response analysis for ${region}:
${query}

Provide:
1. Humanitarian impact assessment
2. Resource allocation recommendations
3. Cross-regional risk correlations
4. Safety-critical considerations
5. Recommended response timeline`;

    const response = await fetchClaudeAnalysis(prompt);
    return {
      analysis: response,
      provider: "Anthropic Claude"
    };
  });
};

/**
 * Clear cache (useful for testing)
 */
export const clearAICache = () => {
  Object.keys(cache).forEach(key => delete cache[key]);
  console.log("[AI Service] Cache cleared");
};
