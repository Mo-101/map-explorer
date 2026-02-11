import { useEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import styles from "./SituationalMarkersLayer.module.css";
import type { SituationalMarker } from "@/hooks/useSituationalMarkers";

function getMarkerColor(type: string): string {
  const colors: Record<string, string> = {
    cyclonic_pattern: "#ef4444",
    flood_risk: "#3b82f6",
    wildfire_risk: "#f97316",
    landslide_risk: "#92400e",
    drought_conditions: "#eab308",
    disease_risk: "#a855f7",
  };
  return colors[type] || "#64748b";
}

function getMarkerSize(status: SituationalMarker["status"]): number {
  const sizes: Record<SituationalMarker["status"], number> = {
    "ACTIVE NOW": 20,
    MONITORING: 16,
    UNUSUAL: 14,
    SITUATIONAL: 12,
  };
  return sizes[status] ?? 12;
}

function getMarkerOpacity(status: SituationalMarker["status"]): number {
  const opacities: Record<SituationalMarker["status"], number> = {
    "ACTIVE NOW": 0.95,
    MONITORING: 0.85,
    UNUSUAL: 0.75,
    SITUATIONAL: 0.65,
  };
  return opacities[status] ?? 0.65;
}

interface Props {
  map: maptilersdk.Map;
  markers: SituationalMarker[];
}

const SituationalMarkersLayer = ({ map, markers }: Props) => {
  const renderedMarkersRef = useRef<maptilersdk.Marker[]>([]);

  useEffect(() => {
    renderedMarkersRef.current.forEach((m) => m.remove());
    renderedMarkersRef.current = [];

    const next = markers.map((m) => {
      const size = getMarkerSize(m.status);
      const container = document.createElement("div");
      container.className = styles.markerContainer;
      container.style.width = `${size}px`;
      container.style.height = `${size}px`;
      container.style.backgroundColor = getMarkerColor(m.type);
      container.style.opacity = String(getMarkerOpacity(m.status));

      const pulse = document.createElement("div");
      pulse.className = styles.marker;
      container.appendChild(pulse);

      const marker = new (maptilersdk as any).Marker({ element: container })
        .setLngLat([m.lng, m.lat])
        .addTo(map);

      return marker as maptilersdk.Marker;
    });

    renderedMarkersRef.current = next;

    return () => {
      next.forEach((m) => m.remove());
    };
  }, [map, markers]);

  return null;
};

export default SituationalMarkersLayer;
