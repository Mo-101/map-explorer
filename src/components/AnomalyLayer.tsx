import React, { useCallback, useEffect, useRef, useState } from "react";
import * as maptilersdk from "@maptiler/sdk";
import { AlertTriangle, CloudRain, Mountain, Wind } from "lucide-react";

interface AnomalyLayerProps {
  map: maptilersdk.Map | null;
  apiBaseUrl?: string;
}

interface AnomalyBuckets {
  cyclones: any[];
  floods: any[];
  landslides: any[];
  convergences: any[];
}

const MOCK_ANOMALIES: AnomalyBuckets = {
  cyclones: [{ id: "cy-1", center_lat: 12.5, center_lon: 42.0, max_wind_speed: 180, intensity: "Category 3" }],
  floods: [{ id: "fl-1", center_lat: 6.5, center_lon: 3.5, risk_score: 0.85 }],
  landslides: [{ id: "ls-1", center_lat: -1.2, center_lon: 36.8, risk_score: 0.9 }],
  convergences: [{ id: "cz-1", center_lat: 10.0, center_lon: 20.0, risk_multiplier: 2.1 }],
};

const AnomalyLayer: React.FC<AnomalyLayerProps> = ({ map, apiBaseUrl }) => {
  const [anomalies, setAnomalies] = useState<AnomalyBuckets>(MOCK_ANOMALIES);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  const fetchAnomalies = useCallback(async () => {
    if (!map) return;
    setLoading(true);
    try {
      if (apiBaseUrl) {
        const response = await fetch(`${apiBaseUrl}/api/v1/weather/anomalies`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setAnomalies({
          cyclones: data.cyclones || [],
          floods: data.floods || [],
          landslides: data.landslides || [],
          convergences: data.convergences || [],
        });
      } else {
        setAnomalies(MOCK_ANOMALIES);
      }
    } catch (err) {
      console.warn("Anomaly fetch failed, using mock data", err);
      setAnomalies(MOCK_ANOMALIES);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [apiBaseUrl, map]);

  // Attach sources/layers to the provided map instance
  useEffect(() => {
    if (!map) return;

    const ensureLayer = (id: string, data: any[], color: string, radius: number) => {
      const sourceId = `${id}-source`;
      const layerId = `${id}-layer`;

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: data.map((item) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [item.center_lon, item.center_lat] },
          properties: item,
        })),
      };

      const source = map.getSource(sourceId) as maptilersdk.GeoJSONSource;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(sourceId, { type: "geojson", data: geojson });
        map.addLayer({
          id: layerId,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-radius": radius,
            "circle-color": color,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.8,
          },
        });
      }
    };

    const updateAll = () => {
      ensureLayer("anomaly-cyclones", anomalies.cyclones, "#ef4444", 12);
      ensureLayer("anomaly-floods", anomalies.floods, "#3b82f6", 10);
      ensureLayer("anomaly-landslides", anomalies.landslides, "#f59e0b", 8);
      ensureLayer("anomaly-convergences", anomalies.convergences, "#a855f7", 14);
    };

    if (map.isStyleLoaded()) {
      updateAll();
    } else {
      map.once("load", updateAll);
    }

    return () => {
      ["anomaly-cyclones", "anomaly-floods", "anomaly-landslides", "anomaly-convergences"].forEach((id) => {
        const sourceId = `${id}-source`;
        const layerId = `${id}-layer`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      });
    };
  }, [map, anomalies]);

  // Polling
  useEffect(() => {
    if (!map) return;
    fetchAnomalies();
    const id = window.setInterval(fetchAnomalies, 30_000);
    return () => window.clearInterval(id);
  }, [map, fetchAnomalies]);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  return (
    <div className="absolute top-20 left-4 z-50 pointer-events-none select-none">
      {loading && (
        <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded animate-pulse inline-flex items-center space-x-1">
          <span>SCANNING ANOMALIES...</span>
          <Wind className="w-3 h-3" />
        </div>
      )}
    </div>
  );
};

export default AnomalyLayer;
