export interface Forecast {
  id: string;
  source: string;
  model_name: string;
  forecast_time: string;
  valid_time: string;
  lead_time_hours: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface Scenario {
  scenario_id: number;
  probability: number;
  track_points: {
    lat: number;
    lon: number;
    intensity: number; // wind speed in kt
    timestamp: string;
  }[];
}

export interface CycloneTrack {
  id: string;
  forecast_id: string;
  track_id: string;
  storm_name?: string;
  basin: string;
  created_at: string;
  scenarios?: Scenario[]; // Ensemble members
  mean_track?: Scenario; // The high-probability mean path
}

export type DisasterType = "cyclone" | "flood" | "drought" | "landslide";
export type SeverityLevel = "low" | "moderate" | "high" | "severe" | "extreme";

export interface Hotspot {
  id: string;
  forecast_id: string;
  track_id?: string;
  disaster_type: DisasterType;
  latitude: number;
  longitude: number;
  lead_time_hours: number;
  valid_time?: string;
  hurricane_prob?: number;
  track_prob?: number;
  intensity_prob?: number;
  wind_speed_kt?: number;
  wind_speed_ms?: number;
  pressure_hpa?: number;
  radius_r8_km?: number;
  radius_r34_km?: number;
  radius_r50_km?: number;
  radius_r64_km?: number;
  raw_data?: Record<string, unknown>;
  created_at: string;
}

export interface Region {
  id: string;
  name: string;
  code: string;
  region_type: "country" | "ocean_basin" | "regional_hub";
  parent_region_id?: string;
  center_lat?: number;
  center_lon?: number;
  created_at: string;
}

export interface Alert {
  id: string;
  forecast_id?: string;
  disaster_type: DisasterType;
  severity: SeverityLevel;
  title: string;
  description?: string;
  affected_regions?: string[];
  affected_countries?: string[];
  start_time?: string;
  end_time?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Cyclone intensity categories based on wind speed (knots)
export type CycloneCategory = "TD" | "TS" | "CAT1" | "CAT2" | "CAT3" | "CAT4" | "CAT5";

export interface CycloneIntensity {
  category: CycloneCategory;
  label: string;
  minWind: number;
  maxWind: number;
  color: string;
}

export const CYCLONE_CATEGORIES: CycloneIntensity[] = [
  { category: "TD", label: "Tropical Depression", minWind: 0, maxWind: 33, color: "hsl(142, 71%, 45%)" },
  { category: "TS", label: "Tropical Storm", minWind: 34, maxWind: 63, color: "hsl(48, 96%, 53%)" },
  { category: "CAT1", label: "Category 1", minWind: 64, maxWind: 82, color: "hsl(32, 95%, 50%)" },
  { category: "CAT2", label: "Category 2", minWind: 83, maxWind: 95, color: "hsl(24, 90%, 48%)" },
  { category: "CAT3", label: "Category 3", minWind: 96, maxWind: 112, color: "hsl(0, 72%, 51%)" },
  { category: "CAT4", label: "Category 4", minWind: 113, maxWind: 136, color: "hsl(0, 80%, 40%)" },
  { category: "CAT5", label: "Category 5", minWind: 137, maxWind: 999, color: "hsl(300, 70%, 35%)" },
];

export function getCycloneCategory(windSpeedKt: number): CycloneIntensity {
  return (
    CYCLONE_CATEGORIES.find((c) => windSpeedKt >= c.minWind && windSpeedKt <= c.maxWind) || CYCLONE_CATEGORIES[0]
  );
}

// Map probability to color (for hotspot visualization)
export function getProbabilityColor(prob: number): string {
  if (prob >= 0.8) return "hsl(0, 72%, 51%)"; // Red - Extreme
  if (prob >= 0.6) return "hsl(32, 95%, 50%)"; // Orange - High
  if (prob >= 0.4) return "hsl(48, 96%, 53%)"; // Yellow - Moderate
  if (prob >= 0.2) return "hsl(142, 71%, 45%)"; // Green - Low
  return "hsl(210, 80%, 55%)"; // Blue - Very Low
}

export interface RegionalHub {
  code: string;
  name: string;
  fullName: string;
  color: string;
  center: [number, number]; // [lat, lon]
}

export const REGIONAL_HUBS: RegionalHub[] = [
  { code: "IO", name: "Indian Ocean", fullName: "Indian Ocean Basin", color: "hsl(210, 80%, 55%)", center: [-10, 70] },
  { code: "ICPAC", name: "East Africa", fullName: "IGAD Climate Prediction Center", color: "hsl(142, 71%, 45%)", center: [1, 38] },
  { code: "SADC", name: "Southern Africa", fullName: "SADC Climate Services Centre", color: "hsl(32, 95%, 50%)", center: [-25, 25] },
  { code: "ECOWAS", name: "West Africa", fullName: "ECOWAS Meteorological Hub", color: "hsl(0, 72%, 51%)", center: [10, 0] },
];
