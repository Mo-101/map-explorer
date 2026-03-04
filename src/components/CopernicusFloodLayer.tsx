import { useEffect, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";

interface CopernicusFloodLayerProps {
  map: maptilersdk.Map;
  visible: boolean;
  floodAlerts?: Array<{ id: string; lat: number; lng: number; severity: string; title: string }>;
  showAlertMarkers?: boolean;
}

const SOURCE_ID = "copernicus-flood";
const FILL_ID = "copernicus-flood-fill";
const OUTLINE_ID = "copernicus-flood-outline";
const LABEL_ID = "copernicus-flood-labels";
const ALERT_SOURCE = "flood-comparison-alerts";
const ALERT_CIRCLE = "flood-comparison-circles";
const ALERT_LABEL = "flood-comparison-labels";

const SEVERITY_COLORS: Record<string, string> = {
  extreme: "#ef4444",
  high: "#f97316",
  moderate: "#f59e0b",
  medium: "#f59e0b",
  low: "#22c55e",
};

const CopernicusFloodLayer = ({ map, visible, floodAlerts, showAlertMarkers }: CopernicusFloodLayerProps) => {
  const [geoJson, setGeoJson] = useState<any>(null);

  useEffect(() => {
    fetch("/data/emsr867_flood_aois.json")
      .then((r) => r.json())
      .then(setGeoJson)
      .catch((e) => console.error("Failed to load Copernicus flood data:", e));
  }, []);

  // Copernicus polygons
  useEffect(() => {
    if (!map || !geoJson) return;

    const cleanup = () => {
      try {
        [LABEL_ID, OUTLINE_ID, FILL_ID].forEach((id) => {
          if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* ignore */ }
    };

    const addLayers = () => {
      cleanup();
      if (!visible) return;

      map.addSource(SOURCE_ID, { type: "geojson", data: geoJson });

      map.addLayer({
        id: FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "hsl(217, 91%, 60%)",
          "fill-opacity": 0.25,
        },
      });

      map.addLayer({
        id: OUTLINE_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "hsl(224, 76%, 33%)",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      map.addLayer({
        id: LABEL_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 2,
        },
      });
    };

    if (map.loaded()) addLayers();
    else map.once("load", addLayers);

    return cleanup;
  }, [map, geoJson, visible]);

  // Automated flood alert markers for comparison
  useEffect(() => {
    if (!map) return;

    const cleanup = () => {
      try {
        [ALERT_LABEL, ALERT_CIRCLE].forEach((id) => {
          if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(ALERT_SOURCE)) map.removeSource(ALERT_SOURCE);
      } catch { /* ignore */ }
    };

    const addAlertLayers = () => {
      cleanup();
      if (!showAlertMarkers || !floodAlerts?.length) return;

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: floodAlerts.map((a) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
          properties: {
            id: a.id,
            severity: a.severity,
            title: a.title,
            color: SEVERITY_COLORS[a.severity] || "#f59e0b",
          },
        })),
      };

      map.addSource(ALERT_SOURCE, { type: "geojson", data: geojson });

      map.addLayer({
        id: ALERT_CIRCLE,
        type: "circle",
        source: ALERT_SOURCE,
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: ALERT_LABEL,
        type: "symbol",
        source: ALERT_SOURCE,
        layout: {
          "text-field": ["get", "title"],
          "text-size": 9,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, 1.8],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-max-width": 12,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.9)",
          "text-halo-width": 1.5,
        },
      });
    };

    if (map.loaded()) addAlertLayers();
    else map.once("load", addAlertLayers);

    return cleanup;
  }, [map, floodAlerts, showAlertMarkers]);

  return null;
};

export default CopernicusFloodLayer;
