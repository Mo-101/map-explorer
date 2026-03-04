import { useEffect, useState } from "react";
import type * as maptilersdk from "@maptiler/sdk";

interface CopernicusFloodLayerProps {
  map: maptilersdk.Map;
  visible: boolean;
}

const SOURCE_ID = "copernicus-flood";
const FILL_ID = "copernicus-flood-fill";
const OUTLINE_ID = "copernicus-flood-outline";
const LABEL_ID = "copernicus-flood-labels";

const CopernicusFloodLayer = ({ map, visible }: CopernicusFloodLayerProps) => {
  const [geoJson, setGeoJson] = useState<any>(null);

  useEffect(() => {
    fetch("/data/emsr867_flood_aois.json")
      .then((r) => r.json())
      .then(setGeoJson)
      .catch((e) => console.error("Failed to load Copernicus flood data:", e));
  }, []);

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

  return null;
};

export default CopernicusFloodLayer;
