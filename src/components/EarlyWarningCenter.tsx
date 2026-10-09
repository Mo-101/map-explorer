import { useEffect } from "react";
import type * as maptilersdk from "@maptiler/sdk";
import type { EarlyAlert, AlertLevel } from "@/lib/warnings/engine";
import { LEVEL_RANK } from "@/lib/warnings/engine";
import { whenStyleReady } from "@/lib/mapReady";

interface Props {
  map: maptilersdk.Map | null;
  alerts: EarlyAlert[];
}

export const LEVEL_COLOR: Record<AlertLevel, string> = { advisory: "#38bdf8", watch: "#facc15", warning: "#fb923c", emergency: "#ef4444" };

// Map-only layer: pulsing rings for early-warning alerts. Status, banners and
// notifications live in the SituationalTicker and toasts, not on the dashboard.
export default function EarlyWarningCenter({ map, alerts }: Props) {
  useEffect(() => {
    if (!map) return;
    const data = {
      type: "FeatureCollection" as const,
      features: alerts.filter(a => Number.isFinite(a.lat) && Number.isFinite(a.lon)).map(a => ({
        type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [a.lon, a.lat] },
        properties: { color: LEVEL_COLOR[a.level], rank: LEVEL_RANK[a.level], name: a.name },
      })),
    };
    return whenStyleReady(map, () => {
      try {
        const src = map.getSource("ews-alerts") as any;
        if (src) src.setData(data);
        else {
          map.addSource("ews-alerts", { type: "geojson", data: data as any });
          map.addLayer({ id: "ews-pulse", type: "circle", source: "ews-alerts", paint: {
            "circle-radius": ["*", ["get", "rank"], 6], "circle-color": ["get", "color"], "circle-opacity": 0.25,
            "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2, "circle-stroke-opacity": 0.8 } });
          map.addLayer({ id: "ews-core", type: "circle", source: "ews-alerts", paint: {
            "circle-radius": 4, "circle-color": ["get", "color"], "circle-stroke-color": "#000", "circle-stroke-width": 1 } });
        }
      } catch { /* style not ready */ }
    });
  }, [map, alerts]);

  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const loop = (t: number) => {
      const phase = (t % 1800) / 1800;
      try {
        if (map.getLayer("ews-pulse")) {
          // Only animate constant paint values: re-setting the data-driven
          // radius every frame re-parses the source, so it never finishes loading.
          map.setPaintProperty("ews-pulse", "circle-stroke-width", 2 + phase * 8);
          map.setPaintProperty("ews-pulse", "circle-stroke-opacity", 0.8 * (1 - phase));
          map.setPaintProperty("ews-pulse", "circle-opacity", 0.35 * (1 - phase));
        }
      } catch { /* ignore */ }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [map]);

  return null;
}
