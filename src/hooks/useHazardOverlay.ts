import { useEffect, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import {
  Hotspot,
  CycloneTrack,
  Scenario,
  getProbabilityColor,
  getCycloneCategory,
} from "@/types/disaster";
import { fetchRealtimeThreats } from "@/services/hazardsApi";

const sampleHotspots: Hotspot[] = [
  {
    id: "hs-001",
    forecast_id: "fc-001",
    disaster_type: "cyclone",
    latitude: -18.6,
    longitude: 45.1,
    lead_time_hours: 24,
    hurricane_prob: 0.72,
    wind_speed_kt: 95,
    pressure_hpa: 975,
    created_at: new Date().toISOString(),
  },
  {
    id: "hs-002",
    forecast_id: "fc-001",
    disaster_type: "cyclone",
    latitude: -12.5,
    longitude: 55.2,
    lead_time_hours: 48,
    hurricane_prob: 0.42,
    wind_speed_kt: 60,
    pressure_hpa: 992,
    created_at: new Date().toISOString(),
  },
];

const sampleTrack: CycloneTrack = {
  id: "trk-001",
  forecast_id: "fc-001",
  track_id: "mean",
  storm_name: "MO-01",
  basin: "SWIO",
  created_at: new Date().toISOString(),
  mean_track: {
    scenario_id: 0,
    probability: 0.65,
    track_points: [
      { lat: -19.0, lon: 44.5, intensity: 90, timestamp: new Date().toISOString() },
      { lat: -18.5, lon: 45.4, intensity: 95, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
      { lat: -18.0, lon: 46.3, intensity: 85, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      { lat: -17.6, lon: 47.0, intensity: 70, timestamp: new Date(Date.now() + 18 * 3600 * 1000).toISOString() },
    ],
  },
  scenarios: [
    {
      scenario_id: 1,
      probability: 0.2,
      track_points: [
        { lat: -19.2, lon: 44.2, intensity: 80, timestamp: new Date().toISOString() },
        { lat: -18.8, lon: 45.0, intensity: 78, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
        { lat: -18.3, lon: 45.9, intensity: 75, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      ],
    },
    {
      scenario_id: 2,
      probability: 0.15,
      track_points: [
        { lat: -18.9, lon: 44.7, intensity: 88, timestamp: new Date().toISOString() },
        { lat: -18.4, lon: 45.6, intensity: 82, timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
        { lat: -17.8, lon: 46.6, intensity: 70, timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
      ],
    },
  ],
};

const HOTSPOT_SOURCE_ID = "afro-hotspots";
const HOTSPOT_LAYER_ID = "afro-hotspots-layer";
const TRACK_SOURCE_ID = "afro-tracks";
const TRACK_LAYER_MEAN = "afro-track-mean";
const TRACK_LAYER_ENSEMBLE = "afro-track-ensemble";

export function useHazardOverlay(map: maptilersdk.Map | null) {
  const [hotspots, setHotspots] = useState<Hotspot[]>(sampleHotspots);
  const [track, setTrack] = useState<CycloneTrack | null>(null);

  // Fetch live threats from backend; fallback to samples
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRealtimeThreats();
        if (cancelled || !data) return;

        const mapped: Hotspot[] = data.threats
          .filter((t: any) => t.threat_type === "cyclone")
          .map((t: any, idx: number) => ({
            id: t.id || `rt-${idx}`,
            forecast_id: "live",
            disaster_type: "cyclone",
            latitude: t.center_lat,
            longitude: t.center_lng,
            lead_time_hours: t.lead_time_days ? t.lead_time_days * 24 : 12,
            hurricane_prob: t.detection_details?.track_probability ?? t.confidence ?? 0.5,
            wind_speed_kt: t.detection_details?.wind_speed ?? 60,
            pressure_hpa: t.detection_details?.min_pressure_hpa ?? 990,
            created_at: t.timestamp,
          }));

        if (mapped.length) setHotspots(mapped);
      } catch {
        // keep sample on error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    const addLayers = () => {
      // Build GeoJSON for hotspots
      const hotspotGeojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: hotspots.map((h) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [h.longitude, h.latitude] },
          properties: {
            id: h.id,
            disaster_type: h.disaster_type,
            prob: h.hurricane_prob ?? h.track_prob ?? 0,
            wind_kt: h.wind_speed_kt ?? 0,
            lead_time: h.lead_time_hours,
          },
        })),
      };

      // Build GeoJSON for tracks (mean + scenarios)
      const ensembleFeatures: GeoJSON.Feature[] = [];
      const meanFeatures: GeoJSON.Feature[] = [];

      const activeTrack = track || sampleTrack;

      const pushScenario = (scenario: Scenario | undefined, isMean = false) => {
        if (!scenario) return;
        const coords = scenario.track_points.map((p) => [p.lon, p.lat]);
        const intensities = scenario.track_points.map((p) => p.intensity);
        const maxWind = Math.max(...intensities);
        const cat = getCycloneCategory(maxWind);
        const feature: GeoJSON.Feature = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            id: `${sampleTrack.id}-${scenario.scenario_id}`,
            prob: scenario.probability,
            maxWind,
            color: cat.color,
          },
        };
        (isMean ? meanFeatures : ensembleFeatures).push(feature);
      };

      pushScenario(activeTrack.mean_track, true);
      activeTrack.scenarios?.forEach((s) => pushScenario(s, false));

      const trackGeojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...meanFeatures, ...ensembleFeatures],
      };

      // Add sources
      if (!map.getSource(HOTSPOT_SOURCE_ID)) {
        map.addSource(HOTSPOT_SOURCE_ID, { type: "geojson", data: hotspotGeojson });
      }
      if (!map.getSource(TRACK_SOURCE_ID)) {
        map.addSource(TRACK_SOURCE_ID, { type: "geojson", data: trackGeojson });
      }

      // Hotspot circles
      if (!map.getLayer(HOTSPOT_LAYER_ID)) {
        map.addLayer({
          id: HOTSPOT_LAYER_ID,
          type: "circle",
          source: HOTSPOT_SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3, 4,
              6, 8,
              8, 12,
              10, 16,
            ],
            "circle-color": [
              "case",
              ["has", "prob"],
              [
                "let",
                "p",
                ["coalesce", ["get", "prob"], 0],
                [
                  "case",
                  [">=", ["var", "p"], 0.8],
                  "hsl(0, 72%, 51%)",
                  [">=", ["var", "p"], 0.6],
                  "hsl(32, 95%, 50%)",
                  [">=", ["var", "p"], 0.4],
                  "hsl(48, 96%, 53%)",
                  [">=", ["var", "p"], 0.2],
                  "hsl(142, 71%, 45%)",
                  "hsl(210, 80%, 55%)",
                ],
              ],
              "hsl(210, 80%, 55%)",
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "white",
            "circle-opacity": 0.9,
          },
        });
      }

      // Mean track (solid)
      if (!map.getLayer(TRACK_LAYER_MEAN)) {
        map.addLayer({
          id: TRACK_LAYER_MEAN,
          type: "line",
          source: TRACK_SOURCE_ID,
          filter: ["in", ["get", "id"], ["literal", meanFeatures.map((f) => f.properties?.id)]],
          paint: {
            "line-width": 3,
            "line-color": ["coalesce", ["get", "color"], "#e11d48"],
            "line-opacity": 0.95,
          },
        });
      }

      // Ensemble tracks (dashed)
      if (!map.getLayer(TRACK_LAYER_ENSEMBLE)) {
        map.addLayer({
          id: TRACK_LAYER_ENSEMBLE,
          type: "line",
          source: TRACK_SOURCE_ID,
          filter: ["!in", ["get", "id"], ["literal", meanFeatures.map((f) => f.properties?.id)]],
          paint: {
            "line-width": 2,
            "line-color": ["coalesce", ["get", "color"], "#f97316"],
            "line-dasharray": [1, 1.5],
            "line-opacity": 0.7,
          },
        });
      }
    };

    // Wait for style to be loaded before adding sources
    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    // Cleanup on unmount
    return () => {
      if (map.getLayer(TRACK_LAYER_ENSEMBLE)) map.removeLayer(TRACK_LAYER_ENSEMBLE);
      if (map.getLayer(TRACK_LAYER_MEAN)) map.removeLayer(TRACK_LAYER_MEAN);
      if (map.getLayer(HOTSPOT_LAYER_ID)) map.removeLayer(HOTSPOT_LAYER_ID);
      if (map.getSource(TRACK_SOURCE_ID)) map.removeSource(TRACK_SOURCE_ID);
      if (map.getSource(HOTSPOT_SOURCE_ID)) map.removeSource(HOTSPOT_SOURCE_ID);
    };
  }, [map, hotspots, track]);
}
