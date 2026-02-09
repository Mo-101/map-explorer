/**
 * AFRO STORM Service
 * Weather-to-Health Intelligence Integration
 * Uses ONLY Azure OpenAI for AI operations
 */

import { generateHealthAlert } from './aiService';

export interface AfroStormThreat {
  id: string;
  threat_type: 'cyclone' | 'cholera' | 'lassa' | 'meningitis' | 'flood' | 'drought' | string;
  risk_level: 'low' | 'moderate' | 'high' | 'severe' | string;
  affected_regions: string[];
  lead_time_days: number | null;
  confidence: number | null;
  center_lat: number | null;
  center_lng: number | null;
  detection_details: Record<string, any>;
  created_at: string;
}

export interface AfroStormResponse {
  timestamp: string;
  threats: AfroStormThreat[];
  count: number;
  sources: string[];
  model_version: string | null;
}

// Cache for 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
let cache: { data: AfroStormResponse | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};

const API_BASE_RAW = (import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE = API_BASE_RAW.replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
const IS_DEV = import.meta.env.DEV;

const AFRO_STORM_CONFIG = {
  primaryBackend: API_BASE,
  healthEndpoint: '/api/v1/',
  threatsEndpoint: '/api/v1/threats',
  maxRetries: 1,
  retryDelayMs: 1000,
  healthCheckIntervalMinutes: 5,
} as const;

let backendAvailable = false;
let lastHealthCheck: Date | null = null;
let healthCheckInProgress = false;
let lastBackendStatusLogged: boolean | null = null;

async function checkBackendHealth(): Promise<boolean> {
  if (!AFRO_STORM_CONFIG.primaryBackend) {
    backendAvailable = false;
    return false;
  }

  if (healthCheckInProgress) {
    return backendAvailable;
  }

  if (lastHealthCheck) {
    const minutesSinceLastCheck = (Date.now() - lastHealthCheck.getTime()) / 1000 / 60;
    if (minutesSinceLastCheck < AFRO_STORM_CONFIG.healthCheckIntervalMinutes) {
      return backendAvailable;
    }
  }

  healthCheckInProgress = true;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${AFRO_STORM_CONFIG.primaryBackend}${AFRO_STORM_CONFIG.healthEndpoint}`, {
      signal: controller.signal,
      method: 'GET',
    });
    clearTimeout(timeoutId);

    backendAvailable = response.ok;
    lastHealthCheck = new Date();

    if (lastBackendStatusLogged !== backendAvailable) {
      if (backendAvailable) {
        console.log('[AFRO STORM] Backend connected at', AFRO_STORM_CONFIG.primaryBackend);
      } else {
        console.log('[AFRO STORM] Backend unavailable');
      }
      lastBackendStatusLogged = backendAvailable;
    }
  } catch {
    backendAvailable = false;
    lastHealthCheck = new Date();

    if (lastBackendStatusLogged !== backendAvailable) {
      console.log('[AFRO STORM] Backend offline');
      lastBackendStatusLogged = backendAvailable;
    }
  } finally {
    healthCheckInProgress = false;
  }

  return backendAvailable;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate that response is JSON before parsing
 */
async function safeJsonParse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(
      `Expected JSON but got ${contentType || 'unknown content-type'}. ` +
        `Body starts: ${text.slice(0, 100).replace(/\n/g, ' ')}`
    );
  }

  return await response.json();
}

/**
 * Circuit breaker state for backend requests
 */
let consecutiveFailures = 0;
let lastFailureTime = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30000; // 30 seconds

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) {
    return false;
  }

  const timeSinceLastFailure = Date.now() - lastFailureTime;
  if (timeSinceLastFailure > CIRCUIT_BREAKER_RESET_MS) {
    consecutiveFailures = 0;
    return false;
  }

  return true;
}

function recordSuccess() {
  consecutiveFailures = 0;
}

function recordFailure() {
  consecutiveFailures++;
  lastFailureTime = Date.now();
}

/**
 * Fetch AFRO STORM health threats with proper error handling and circuit breaker.
 * No mock data is returned; only live backend responses or cached live data.
 */
export async function getAfroStormThreats(): Promise<AfroStormResponse> {
  const now = Date.now();

  if (!AFRO_STORM_CONFIG.primaryBackend) {
    throw new Error('AFRO STORM backend is not configured (VITE_API_BASE_URL is empty)');
  }

  const isBackendUp = await checkBackendHealth();
  if (!isBackendUp) {
    if (cache.data && now - cache.timestamp < CACHE_TTL * 2) {
      return cache.data;
    }
    throw new Error('AFRO STORM backend unavailable');
  }

  if (isCircuitOpen()) {
    if (cache.data && now - cache.timestamp < CACHE_TTL * 2) {
      console.log('[AFRO STORM] Circuit open - serving cached data');
      return cache.data;
    }
    throw new Error('Backend unavailable (circuit breaker open)');
  }

  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  try {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= AFRO_STORM_CONFIG.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${AFRO_STORM_CONFIG.primaryBackend}${AFRO_STORM_CONFIG.threatsEndpoint}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: AfroStormResponse = await safeJsonParse(response);
        cache = { data, timestamp: now };
        recordSuccess();
        return data;
      } catch (err) {
        lastErr = err;
        if (attempt < AFRO_STORM_CONFIG.maxRetries) {
          await sleep(AFRO_STORM_CONFIG.retryDelayMs * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastErr;
  } catch (error) {
    recordFailure();

    if (cache.data) {
      return cache.data;
    }

    throw error;
  }
}

/**
 * Get threat color based on type
 */
export function getThreatColor(type: AfroStormThreat['threat_type']): string {
  const colors: Record<string, string> = {
    cyclone: '#f43f5e',
    cholera: '#3b82f6',
    lassa: '#f59e0b',
    meningitis: '#8b5cf6',
    flood: '#06b6d4',
    drought: '#fbbf24',
  };
  return colors[type] || '#64748b';
}

/**
 * Get threat icon SVG based on type
 */
export function getThreatIcon(type: AfroStormThreat['threat_type']): string {
  const icons: Record<string, string> = {
    cyclone: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12C20,14.41 18.93,16.57 17.21,18.06L14.71,15.56C15.5,14.7 16,13.41 16,12A4,4 0 0,0 12,8C10.59,8 9.3,8.5 8.44,9.29L5.94,6.79C7.43,5.07 9.59,4 12,4M12,20A8,8 0 0,1 4,12C4,9.59 5.07,7.43 6.79,5.94L9.29,8.44C8.5,9.3 8,10.59 8,12A4,4 0 0,0 12,16C13.41,16 14.7,15.5 15.56,14.71L18.06,17.21C16.57,18.93 14.41,20 12,20Z"/></svg>`,

    cholera: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4M12,6C8.69,6 6,8.69 6,12C6,15.31 8.69,18 12,18C15.31,18 18,15.31 18,12C18,8.69 15.31,6 12,6M12,8C14.21,8 16,9.79 16,12C16,14.21 14.21,16 12,16C9.79,16 8,14.21 8,12C8,9.79 9.79,8 12,8Z"/></svg>`,

    lassa: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.66,11.2C17.43,10.9 17.15,10.64 16.89,10.38C16.22,9.7 15.46,9.03 15.46,7.73C15.46,6.47 16.14,5.4 16.14,4.1C16.14,3.1 15.61,2.1 14.71,1.5C14.71,1.5 14.65,1.5 14.63,1.5C14.39,1.75 14.21,2.05 14.12,2.4C13.88,3.24 14.15,4.36 13.91,5.23C13.72,6.04 13.34,6.8 12.87,7.5C12.35,8.3 11.66,8.9 11.14,9.8C10.66,10.6 10.38,11.5 10.38,12.5C10.38,12.7 10.38,12.9 10.4,13.1C10.42,13.4 10.5,13.7 10.6,14C11,15.1 12,16 13.16,16.2C14.5,16.5 15.82,15.8 16.41,14.6C16.53,14.3 16.63,14.1 16.69,13.8C17.39,13.1 17.82,12.2 17.66,11.2Z"/></svg>`,

    meningitis: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2L4,6V12C4,16.42 7.16,20.42 12,22C16.84,20.42 20,16.42 20,12V6L12,2M12,4.18L18,7.5V12C18,15.62 15.57,18.82 12,20.18C8.43,18.82 6,15.62 6,12V7.5L12,4.18M12,7C10.34,7 9,8.34 9,10C9,11.66 10.34,13 12,13C13.66,13 15,11.66 15,10C15,8.34 13.66,7 12,7Z"/></svg>`,

    flood: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.9,13.6C11.9,13.6 11.9,13.6 11.9,13.6C11.9,13.6 11.9,13.6 11.9,13.6L11.9,13.6C11.6,13.6 11.3,13.5 11.1,13.3L3.1,5.3C2.7,4.9 2.7,4.3 3.1,3.9C3.5,3.5 4.1,3.5 4.5,3.9L11.9,11.3L19.3,3.9C19.7,3.5 20.3,3.5 20.7,3.9C21.1,4.3 21.1,4.9 20.7,5.3L12.7,13.3C12.5,13.5 12.2,13.6 11.9,13.6Z"/><path d="M12,20C12,20 12,20 12,20C12,20 12,20 12,20L12,20C11.7,20 11.4,19.9 11.2,19.7L3.2,11.7C2.8,11.3 2.8,10.7 3.2,10.3C3.6,9.9 4.2,9.9 4.6,10.3L12,17.7L19.4,10.3C19.8,9.9 20.4,9.9 20.8,10.3C21.2,10.7 21.2,11.3 20.8,11.7L12.8,19.7C12.6,19.9 12.3,20 12,20Z"/></svg>`,

    drought: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z"/></svg>`,
  };

  return icons[type] || icons.cyclone;
}

/**
 * Format threat for display
 */
export function formatThreatDescription(threat: AfroStormThreat): string {
  const details = threat.detection_details;

  switch (threat.threat_type) {
    case 'cyclone':
      return `${details.name || 'Tropical Cyclone'} - Category ${details.category || 'Unknown'}. Wind speed: ${details.max_wind_speed_ms || 'N/A'} m/s. Population at risk: ${(details.population_at_risk || 0).toLocaleString()}`;

    case 'cholera':
      return `Predicted ${details.predicted_cases?.toLocaleString() || 'N/A'} cases. Trigger: ${details.trigger || 'Unknown'}. Water contamination risk: ${Math.round((details.water_contamination_probability || 0) * 100)}%`;

    case 'lassa':
      return `Predicted ${details.predicted_cases || 'N/A'} cases. ${details.season_factor || 'Seasonal risk'}. Confidence: ${Math.round((threat.confidence || 0) * 100)}%`;

    case 'meningitis':
      return `Predicted ${details.predicted_cases?.toLocaleString() || 'N/A'} cases. Vaccination gap: ${details.vaccination_gap || 'Unknown'}`;

    case 'flood':
      return `River level rise: ${details.river_level_rise || 'N/A'}. Affected population: ${(details.affected_population || 0).toLocaleString()}. Trigger: ${details.trigger || 'Unknown'}`;

    default:
      return `Health threat detected. Lead time: ${threat.lead_time_days ?? 'N/A'} days.`;
  }
}

export function isBackendConnected(): boolean {
  return backendAvailable;
}

export function forceHealthCheck(): Promise<boolean> {
  lastHealthCheck = null;
  return checkBackendHealth();
}

export function getBackendStatus() {
  return {
    available: backendAvailable,
    lastCheck: lastHealthCheck,
    endpoint: AFRO_STORM_CONFIG.primaryBackend,
  };
}

// Single quiet check on module load
checkBackendHealth();

// Re-export generateHealthAlert from aiService for convenience
export { generateHealthAlert };
